import { confirmShadowUpload, createShadowUploadTarget } from '../../api/gen/kolearn'
import type {
  AdminShadowVideoDetail,
  ShadowMediaKind,
  ShadowUploadPurpose,
} from '../../api/gen/model'
import { putBytesWithProgress } from '../../lib/http'

/**
 * Getting a video into the bank.
 *
 * The bytes never pass through the API. There are two 4.5 MB request-body gates
 * between this browser and the Go function — Vercel's, and this app's own
 * `api/proxy.ts`, which does `await request.arrayBuffer()` before forwarding —
 * and a three-minute video is around 30 MB. Direct-to-storage is not an
 * optimisation; it is the only path that exists.
 *
 * Three steps, and the split between the last two is what makes a retry cheap:
 * the PUT is the expensive one, so a failure in the small JSON call after it
 * must not re-send thirty megabytes.
 */

/**
 * What each kind of item accepts, keyed by the kind the draft was created as.
 *
 * Keyed rather than flattened, because the server holds an upload to the item's
 * OWN kind and reads it from the row: an author who started an audio item and
 * drops an .mp4 into it gets refused there whatever this list says, so the two
 * had better agree.
 */
export const ACCEPTED_MEDIA: Record<ShadowMediaKind, string[]> = {
  VIDEO: ['video/mp4'],
  AUDIO: ['audio/mpeg', 'audio/mp4'],
}
export const ACCEPTED_THUMBNAIL = ['image/png', 'image/jpeg', 'image/webp']

/** A three-minute lesson is ~30 MB. This is here to stop a mis-dropped file. */
export const MAX_BYTES = 200 * 1024 * 1024
/**
 * Much tighter, because this one is protecting something. The poster sits on
 * the learner's list screen where every row loads one, and a learner on a
 * Vietnamese mobile network pays for each.
 */
export const MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024
const MIN_MS = 5_000
const MAX_MS = 15 * 60_000

export type UploadPhase =
  | 'idle'
  | 'probing'
  | 'requesting-target'
  | 'uploading'
  | 'finalising'
  | 'done'
  | 'failed'
  | 'cancelled'

export interface VideoProbe {
  bytes: number
  mimeType: string
  durationMs: number
}

export class VideoRejected extends Error {
  detailVi: string

  constructor(detailVi: string) {
    super(detailVi)
    this.name = 'VideoRejected'
    this.detailVi = detailVi
  }
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

/**
 * Reads the file's own metadata before thirty megabytes leave the machine.
 *
 * Exported separately from the upload rather than folded into it, and that is
 * deliberate: this needs a real media element, which jsdom does not have, so
 * keeping it out is what makes the network sequence testable at all.
 *
 * A file whose metadata never loads is a file this browser cannot decode —
 * exactly the thing to find out before the upload rather than after.
 */
export function probeVideoFile(file: File, kind: ShadowMediaKind = 'VIDEO'): Promise<VideoProbe> {
  const accepted = ACCEPTED_MEDIA[kind]
  if (!accepted.includes(file.type)) {
    const wanted = kind === 'AUDIO' ? 'tệp .mp3 hoặc .m4a' : 'tệp .mp4 (H.264 + AAC)'
    return Promise.reject(
      new VideoRejected(
        `Ngữ liệu này là ${kind === 'AUDIO' ? 'âm thanh' : 'video'}, chỉ nhận ${wanted}. ` +
          `Tệp bạn chọn là ${file.type || 'không rõ định dạng'}.`,
      ),
    )
  }
  if (file.size > MAX_BYTES) {
    return Promise.reject(
      new VideoRejected(`Tệp nặng ${mb(file.size)} MB, vượt giới hạn ${mb(MAX_BYTES)} MB.`),
    )
  }

  return new Promise((resolve, reject) => {
    // A <video> element, even for an .mp3 — it decodes both, and it is the
    // same element the learner's player uses, so a file this cannot read is a
    // file that screen could not have played either.
    const el = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      fn()
    }

    // A pathological file must not hang the panel with no way out.
    const guard = window.setTimeout(
      () => finish(() => reject(new VideoRejected('Không đọc được thông tin từ tệp này.'))),
      10_000,
    )

    el.preload = 'metadata'
    el.addEventListener('loadedmetadata', () => {
      window.clearTimeout(guard)
      const durationMs = Math.round(el.duration * 1000)
      if (!Number.isFinite(durationMs) || durationMs < MIN_MS || durationMs > MAX_MS) {
        finish(() =>
          reject(new VideoRejected('Ngữ liệu phải dài từ 5 giây đến 15 phút.')),
        )
        return
      }
      finish(() => resolve({ bytes: file.size, mimeType: file.type, durationMs }))
    })
    el.addEventListener('error', () => {
      window.clearTimeout(guard)
      finish(() => reject(new VideoRejected('Trình duyệt không đọc được tệp này.')))
    })
    el.src = url
  })
}

/**
 * Reads a poster before it leaves the machine.
 *
 * A separate function from probeVideoFile rather than a branch inside it, and
 * the reason is the element: an image needs `new Image()`, which reports
 * `naturalWidth`, and a media element would sit on `loadedmetadata` forever
 * waiting for a duration a PNG does not have.
 *
 * The width check is the one worth having. A 320px cover looks fine in the
 * studio's own preview and is a blurred smear on the learner's list — the
 * screen where every row loads one.
 */
export function probeThumbnailFile(file: File): Promise<VideoProbe> {
  if (!ACCEPTED_THUMBNAIL.includes(file.type)) {
    return Promise.reject(
      new VideoRejected(
        `Ảnh xem trước chỉ nhận .png, .jpg hoặc .webp. ` +
          `Tệp bạn chọn là ${file.type || 'không rõ định dạng'}.`,
      ),
    )
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return Promise.reject(
      new VideoRejected(
        `Ảnh nặng ${mb(file.size)} MB, vượt giới hạn ${mb(MAX_THUMBNAIL_BYTES)} MB. ` +
          `Nên xuất lại WebP khoảng 1280px.`,
      ),
    )
  }

  return new Promise((resolve, reject) => {
    const el = new Image()
    const url = URL.createObjectURL(file)
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      fn()
    }

    const guard = window.setTimeout(
      () => finish(() => reject(new VideoRejected('Không đọc được ảnh này.'))),
      10_000,
    )

    el.addEventListener('load', () => {
      window.clearTimeout(guard)
      if (el.naturalWidth < 640) {
        finish(() =>
          reject(
            new VideoRejected(
              `Ảnh chỉ rộng ${el.naturalWidth}px — sẽ vỡ trên danh sách. Cần ít nhất 640px.`,
            ),
          ),
        )
        return
      }
      // durationMs is 0 and stays 0: an image has no duration, and the server
      // ignores the field for a thumbnail.
      finish(() => resolve({ bytes: file.size, mimeType: file.type, durationMs: 0 }))
    })
    el.addEventListener('error', () => {
      window.clearTimeout(guard)
      finish(() => reject(new VideoRejected('Trình duyệt không đọc được ảnh này.')))
    })
    el.src = url
  })
}

export interface UploadHandle {
  promise: Promise<AdminShadowVideoDetail>
  cancel: () => void
}

export function uploadShadowingVideo(args: {
  videoId: string
  file: File
  probe: VideoProbe
  /**
   * MEDIA when absent. It decides which accept-list and byte ceiling the server
   * holds the upload to, and one thing more that is easy to miss: a MEDIA
   * confirm retires every line's approval, because every stretch of audio has
   * just been replaced. A THUMBNAIL confirm does not.
   */
  purpose?: ShadowUploadPurpose
  /** Set after a successful PUT. Pass it back to resume at the final step. */
  resumeObjectKey?: string
  onPhase: (phase: UploadPhase) => void
  onProgress: (loadedBytes: number, totalBytes: number) => void
  onObjectKey: (key: string) => void
}): UploadHandle {
  const controller = new AbortController()
  const purpose = args.purpose ?? 'MEDIA'
  // An image has no duration and the server ignores the field for a thumbnail.
  // Sending a zero would be a claim rather than an absence.
  const durationMs = purpose === 'MEDIA' ? args.probe.durationMs : undefined

  const promise = (async () => {
    // Resume path: the bytes are already in the bucket, and re-sending them
    // because a two-hundred-byte JSON call timed out is the failure worth
    // writing code to avoid.
    if (args.resumeObjectKey) {
      args.onPhase('finalising')
      const saved = await confirmShadowUpload(args.videoId, {
        objectKey: args.resumeObjectKey,
        ...(durationMs === undefined ? {} : { durationMs }),
        purpose,
      })
      args.onPhase('done')
      return saved
    }

    args.onPhase('requesting-target')
    // The server validates type, size and duration here, before signing
    // anything — the checks in probeVideoFile are courtesy.
    const target = await createShadowUploadTarget(args.videoId, {
      fileName: args.file.name,
      mimeType: args.probe.mimeType,
      byteSize: args.probe.bytes,
      purpose,
    })
    args.onObjectKey(target.objectKey)

    args.onPhase('uploading')
    // `target.headers` is opaque: it echoes what the server signed, and a
    // signed header this client altered would be a signature mismatch. Passed
    // through verbatim rather than reconstructed.
    const res = await putBytesWithProgress(target.url, args.file, target.headers, {
      onProgress: args.onProgress,
      signal: controller.signal,
    })
    if (res.status < 200 || res.status >= 300) {
      throw new VideoRejected(`Kho lưu trữ từ chối tệp này (HTTP ${res.status}).`)
    }

    args.onPhase('finalising')
    const saved = await confirmShadowUpload(args.videoId, {
      objectKey: target.objectKey,
      ...(durationMs === undefined ? {} : { durationMs }),
      purpose,
    })
    args.onPhase('done')
    return saved
  })()

  return { promise, cancel: () => controller.abort() }
}
