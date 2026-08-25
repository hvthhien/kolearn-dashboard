import { useRef, useState, type RefObject } from 'react'
import type { AdminShadowAsset, ShadowMediaKind } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { Button, Dialog, ErrorNote, WarnNote } from '../../components/ui'
import { proposeSegments, type Segment } from './segment'
import {
  probeThumbnailFile,
  probeVideoFile,
  uploadShadowingVideo,
  VideoRejected,
  type UploadPhase,
  type VideoProbe,
} from './uploadVideo'

const PHASE_LABEL: Record<UploadPhase, string> = {
  idle: '',
  probing: 'Đang đọc tệp…',
  'requesting-target': 'Đang xin chỗ tải lên…',
  uploading: 'Đang tải lên',
  finalising: 'Đang ghi nhận…',
  done: 'Đã tải lên.',
  failed: 'Tải lên thất bại.',
  cancelled: 'Đã huỷ.',
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

export function VideoUploadPanel({
  videoId,
  mediaKind,
  asset,
  thumbnail,
  lineCount,
  videoRef,
  onUploaded,
  onSegments,
}: {
  videoId: string
  /** Fixed when the draft was created; the server refuses anything else. */
  mediaKind: ShadowMediaKind
  asset?: AdminShadowAsset
  thumbnail?: AdminShadowAsset
  lineCount: number
  videoRef: RefObject<HTMLVideoElement | null>
  onUploaded: () => void
  onSegments: (segments: Segment[]) => void
}) {
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [loaded, setLoaded] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<unknown>(null)
  const [confirmReplace, setConfirmReplace] = useState<File | null>(null)
  const [proposed, setProposed] = useState<Segment[] | null>(null)

  // Remembered the moment the PUT succeeds. A failure in the small confirm call
  // after it must not re-send thirty megabytes.
  const objectKey = useRef<string | null>(null)
  const probe = useRef<VideoProbe | null>(null)
  const file = useRef<File | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  const run = async (chosen: File) => {
    setError(null)
    setPhase('probing')
    try {
      const measured = await probeVideoFile(chosen, mediaKind)
      probe.current = measured
      file.current = chosen
      setTotal(measured.bytes)

      const handle = uploadShadowingVideo({
        videoId,
        file: chosen,
        probe: measured,
        onPhase: setPhase,
        onProgress: (l, t) => {
          setLoaded(l)
          setTotal(t)
        },
        onObjectKey: (key) => {
          objectKey.current = key
        },
      })
      cancelRef.current = handle.cancel
      await handle.promise
      onUploaded()

      // Proposed, never applied. Silence detection finds audio boundaries, not
      // sentence boundaries, so this is an offer the editor accepts or ignores.
      if (lineCount === 0) {
        setProposed(await proposeSegments(chosen))
      }
    } catch (err) {
      setPhase(err instanceof Error && err.message === 'upload_aborted' ? 'cancelled' : 'failed')
      if (!(err instanceof Error && err.message === 'upload_aborted')) setError(err)
    }
  }

  const onPick = (chosen: File | undefined) => {
    if (!chosen) return
    // Replacing is destructive of somebody else's work, so it asks first.
    if (asset) setConfirmReplace(chosen)
    else void run(chosen)
  }

  const retry = () => {
    const chosen = file.current
    const measured = probe.current
    if (!chosen || !measured) return
    setError(null)
    const handle = uploadShadowingVideo({
      videoId,
      file: chosen,
      probe: measured,
      // Only when the bytes already landed. Otherwise this restarts from the
      // top, because a minted target may have expired and re-minting is cheap.
      ...(phase === 'failed' && objectKey.current ? { resumeObjectKey: objectKey.current } : {}),
      onPhase: setPhase,
      onProgress: (l, t) => {
        setLoaded(l)
        setTotal(t)
      },
      onObjectKey: (key) => {
        objectKey.current = key
      },
    })
    cancelRef.current = handle.cancel
    handle.promise.then(onUploaded).catch((err: unknown) => {
      setPhase('failed')
      setError(err)
    })
  }

  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0

  return (
    <div className="mt-2">
      {asset && (
        // The same one-element decision the learner's player makes: a <video>
        // plays an .mp3 and draws `poster` while it does, so the studio previews
        // exactly what the learner will get rather than an approximation of it.
        <video
          ref={videoRef}
          src={asset.playbackUrl}
          poster={thumbnail?.playbackUrl}
          controls
          playsInline
          preload="metadata"
          aria-label={mediaKind === 'AUDIO' ? 'Âm thanh đang soạn' : 'Video đang soạn'}
          className="w-full rounded-xl border border-line bg-ink"
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept={mediaKind === 'AUDIO' ? 'audio/mpeg,audio/mp4,.mp3,.m4a' : 'video/mp4,.mp4'}
          aria-label={mediaKind === 'AUDIO' ? 'Chọn tệp âm thanh' : 'Chọn tệp video'}
          onChange={(e) => onPick(e.target.files?.[0])}
          className="tap rounded-xl border border-line bg-white px-4 py-2 text-sm"
        />
        {phase === 'uploading' && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => cancelRef.current?.()}
          >
            Huỷ tải lên
          </Button>
        )}
        {phase === 'failed' && (
          <Button type="button" variant="secondary" onClick={retry}>
            Thử lại
          </Button>
        )}
      </div>

      {phase === 'uploading' && (
        <div className="mt-2">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Tiến độ tải video lên"
            className="h-2 overflow-hidden rounded-full bg-line"
          >
            {/* Inline style: a Tailwind arbitrary value cannot be dynamic. */}
            <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <p aria-live="polite" className="mt-1 text-sm text-muted">
            {/* Announced in tens, or a screen reader machine-guns through a
                hundred updates. */}
            Đang tải lên — {Math.round(pct / 10) * 10}% ({mb(loaded)} / {mb(total)} MB)
          </p>
        </div>
      )}

      {phase !== 'idle' && phase !== 'uploading' && PHASE_LABEL[phase] && (
        <p className="mt-2 text-sm text-muted">{PHASE_LABEL[phase]}</p>
      )}

      {error !== null && (
        <ErrorNote>
          {error instanceof VideoRejected ? error.detailVi : userMessage(error)}
        </ErrorNote>
      )}

      {proposed !== null && (
        <div className="mt-3 rounded-xl border border-line bg-white p-3">
          {proposed.length === 0 ? (
            <p className="text-sm text-muted">
              Máy không dò được đoạn tiếng cho video này. Đặt mốc bằng tay.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink">
                Máy đã dò được <strong>{proposed.length} đoạn tiếng</strong>. Tạo {proposed.length}{' '}
                câu trống theo các mốc này?
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    onSegments(proposed)
                    setProposed(null)
                  }}
                >
                  Dùng các mốc này
                </Button>
                <Button type="button" variant="ghost" onClick={() => setProposed(null)}>
                  Bỏ qua
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {confirmReplace && (
        <Dialog
          open
          title={mediaKind === 'AUDIO' ? 'Thay tệp âm thanh' : 'Thay video'}
          onClose={() => setConfirmReplace(null)}
          footer={
            <>
              <Button
                type="button"
                onClick={() => {
                  const chosen = confirmReplace
                  setConfirmReplace(null)
                  void run(chosen)
                }}
              >
                {mediaKind === 'AUDIO' ? 'Thay tệp âm thanh' : 'Thay video'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmReplace(null)}>
                Huỷ
              </Button>
            </>
          }
        >
          <WarnNote>
            Thay {mediaKind === 'AUDIO' ? 'tệp âm thanh' : 'video'} sẽ{' '}
            <strong>xoá toàn bộ kết quả duyệt</strong> của {lineCount} câu — người bản ngữ sẽ phải
            nghe lại từ đầu. Mốc thời gian và bản dịch được giữ nguyên.
          </WarnNote>
        </Dialog>
      )}
    </div>
  )
}

/**
 * The poster, uploaded on its own.
 *
 * A separate control rather than a second slot in the panel above, because the
 * two uploads mean different things and only one of them is destructive.
 * Replacing the media retires every approval — the dialog above says so and
 * asks first. Replacing the poster retires nothing, so it does not ask.
 *
 * For an AUDIO item this is not decoration: it is the whole visual surface of
 * the learner's screen, and the publish gate refuses to release one without it.
 * The copy says which of those two situations the author is in.
 */
export function ThumbnailUploadPanel({
  videoId,
  mediaKind,
  thumbnail,
  onUploaded,
}: {
  videoId: string
  mediaKind: ShadowMediaKind
  thumbnail?: AdminShadowAsset
  onUploaded: () => void
}) {
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [error, setError] = useState<unknown>(null)

  const run = async (chosen: File) => {
    setError(null)
    setPhase('probing')
    try {
      const measured = await probeThumbnailFile(chosen)
      const handle = uploadShadowingVideo({
        videoId,
        file: chosen,
        probe: measured,
        purpose: 'THUMBNAIL',
        onPhase: setPhase,
        // No progress bar: a poster is a few hundred kilobytes, and a bar that
        // jumps 0 → 100 is noise pretending to be information.
        onProgress: () => {},
        onObjectKey: () => {},
      })
      await handle.promise
      onUploaded()
    } catch (err) {
      setPhase('failed')
      setError(err)
    }
  }

  return (
    <div className="mt-2">
      {thumbnail && (
        <img
          src={thumbnail.playbackUrl}
          alt="Ảnh xem trước hiện tại"
          className="aspect-video w-full max-w-sm rounded-xl border border-line object-cover"
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          aria-label="Chọn ảnh xem trước"
          onChange={(e) => {
            const chosen = e.target.files?.[0]
            if (chosen) void run(chosen)
          }}
          className="tap rounded-xl border border-line bg-white px-4 py-2 text-sm"
        />
      </div>

      {phase !== 'idle' && PHASE_LABEL[phase] && (
        <p className="mt-2 text-sm text-muted">{PHASE_LABEL[phase]}</p>
      )}

      {!thumbnail && mediaKind === 'AUDIO' && (
        <WarnNote>
          Ngữ liệu âm thanh <strong>phải có ảnh xem trước</strong> mới xuất bản được — người học
          không có gì để nhìn trong lúc nghe.
        </WarnNote>
      )}

      {error !== null && (
        <ErrorNote>
          {error instanceof VideoRejected ? error.detailVi : userMessage(error)}
        </ErrorNote>
      )}
    </div>
  )
}
