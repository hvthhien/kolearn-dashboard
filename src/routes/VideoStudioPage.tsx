import { useRef, useState, useCallback } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  deleteAdminShadowVideo,
  getGetAdminShadowVideoQueryKey,
  getListAdminShadowVideosQueryKey,
  retireAdminShadowVideo,
  saveAdminShadowGlossary,
  saveAdminShadowLines,
  saveAdminShadowVideo,
  useGetAdminShadowVideo,
} from '../api/gen/kolearn'
import type { AdminShadowVideoDetail } from '../api/gen/model'
import { userMessage } from '../lib/problem'
import { useAuth } from '../lib/auth'
import { useShadowDraft } from '../features/shadowing/useShadowDraft'
import { LineEditor } from '../features/shadowing/LineEditor'
import { decodeSpeechRuns, proposeChunks } from '../features/shadowing/chunks'
import type { Segment } from '../features/shadowing/segment'
import { ApprovalPanel } from '../features/shadowing/ApprovalPanel'
import { GlossaryEditor } from '../features/shadowing/GlossaryEditor'
import {
  ThumbnailUploadPanel,
  VideoUploadPanel,
} from '../features/shadowing/VideoUploadPanel'
import { PublishVideoDialog } from '../features/shadowing/PublishVideoDialog'
import { RemoveDialog } from '../features/manage/RemoveDialog'
import { removalFor } from '../features/manage/removal'
import { blocking, issueMessage, sortByStart, validateLines } from '../features/shadowing/lineRules'
import {
  Badge,
  Button,
  ErrorNote,
  PageShell,
  PageTitle,
  SectionHeading,
  Select,
  Spinner,
  TextField,
  WarnNote,
} from '../components/ui'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp mới',
  IN_REVIEW: 'Chờ duyệt',
  PUBLISHED: 'Đã vào ngân hàng',
  RETIRED: 'Đã gỡ',
}

export function VideoStudioPage() {
  const { videoId } = useParams({ from: '/videos/$videoId' })
  const { data, isPending, error } = useGetAdminShadowVideo(videoId)

  if (error) {
    return (
      <PageShell>
        <ErrorNote>{userMessage(error)}</ErrorNote>
      </PageShell>
    )
  }
  if (isPending) {
    return (
      <PageShell>
        <Spinner label="Đang tải ngữ liệu…" />
      </PageShell>
    )
  }
  // Keyed, so switching videos rebuilds the draft rather than editing video B
  // into video A's form state.
  return <Studio key={data.id} video={data} />
}

/**
 * SC-VIDEO-STUDIO.
 *
 * One route for the whole thing, not one per block: the line editor, the
 * approval pass and the dictionary all address the same `<video>` element, and
 * splitting them across routes would mean three players, three loads of the
 * same thirty megabytes, and a reviewer who cannot see the timing they are
 * approving.
 *
 * The metadata, lines and dictionary sit inside one form with one Lưu nháp.
 * The upload and the verdicts sit outside it, and that is load-bearing rather
 * than tidiness: an upload and a verdict are immediate server writes, and a
 * reviewer who marks nine lines and closes the tab must not lose nine verdicts.
 */
function Studio({ video }: { video: AdminShadowVideoDetail }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { draft, set, setLine, setEntry, setDraft, videoRequest, linesRequest, glossaryRequest } =
    useShadowDraft(video)

  const [activeLine, setActiveLine] = useState(0)

  /**
   * The speech runs in the whole media, decoded once and reused.
   *
   * Once, because decoding a thirty-megabyte file per line is a studio that
   * stops responding — and because the runs do not depend on which line is
   * being chunked. Lazily, because most sessions never touch this button and
   * paying the download on every open would tax everybody for a feature some
   * videos do not need.
   */
  const speechRuns = useRef<Segment[] | null>(null)
  const [chunkError, setChunkError] = useState<string | null>(null)

  const proposeChunksFor = useCallback(
    (index: number) => {
      const line = draft.lines[index]
      const url = video.asset?.playbackUrl
      if (!line || !url) return

      void (async () => {
        setChunkError(null)
        try {
          if (speechRuns.current === null) {
            speechRuns.current = await decodeSpeechRuns(await (await fetch(url)).blob())
          }
          const chunks = proposeChunks(speechRuns.current, line)
          if (chunks.length === 0) {
            // An honest empty answer, not a failure: a short line with no
            // internal pause is one nobody needs to split.
            setChunkError('Câu này không có khoảng nghỉ nào đủ dài để chia cụm.')
            return
          }
          setLine(index, { chunks })
        } catch {
          setChunkError('Không đọc được âm thanh của ngữ liệu này để chia cụm.')
        }
      })()
    },
    [draft.lines, video.asset?.playbackUrl, setLine],
  )

  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [publishing, setPublishing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const navigate = useNavigate()

  const canPublish = user?.permissions.includes('shadowing:publish') ?? false
  const canWrite = user?.permissions.includes('shadowing:write') ?? false
  const removal = removalFor(video.publishedAt)
  // Deleting is authoring and retiring is release, so the button is offered on
  // whichever permission matches the operation this video would actually get.
  const canRemove = removal === 'DELETE' ? canWrite : canPublish

  const issues = validateLines(draft.lines, video.asset?.durationMs ?? null)
  const blockers = issues.filter(blocking)

  // Compared against what was loaded, so the approval panel knows whether the
  // saved lines still describe what is on screen.
  const dirty = JSON.stringify(linesRequest.lines) !== JSON.stringify(
    video.lines.map((l) => ({
      id: l.id,
      startMs: l.startMs,
      endMs: l.endMs,
      textKo: l.textKo,
      textVi: l.textVi,
      speaker: l.speaker,
      // Every field linesRequest sends has to be here, or the two shapes never
      // match and the video reads as dirty from the moment it loads — which
      // disables the approval buttons for a change nobody made.
      chunks: l.chunks.map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        charStart: c.charStart,
        charEnd: c.charEnd,
      })),
    })),
  )

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetAdminShadowVideoQueryKey(video.id) })
    await queryClient.invalidateQueries({ queryKey: getListAdminShadowVideosQueryKey() })
  }

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setSaved(false)
    setSaveError(null)
    try {
      await saveAdminShadowVideo(video.id, videoRequest)
      await saveAdminShadowLines(video.id, linesRequest)
      await saveAdminShadowGlossary(video.id, glossaryRequest)
      await refresh()
      setSaved(true)
    } catch (err) {
      setSaveError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <p className="text-xs text-muted">
        <Link to="/videos" className="hover:underline">
          ← Về xưởng ngữ liệu
        </Link>
        {' · '}
        {STATUS_LABEL[video.status]}
      </p>

      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{video.title || 'Chưa đặt chủ đề'}</PageTitle>
        <div className="flex items-center gap-2">
          <Badge tone={video.review.unreviewed === 0 ? 'ok' : 'warn'}>
            {video.review.approved}/{video.review.total} đã duyệt
          </Badge>
          {canPublish && (
            <Button type="button" onClick={() => setPublishing(true)}>
              Đưa vào ngân hàng
            </Button>
          )}
        </div>
      </div>

      {video.review.unreviewed > 0 && (
        <WarnNote>
          Còn <strong>{video.review.unreviewed} câu chưa duyệt</strong> thì không đưa được vào ngân
          hàng.
        </WarnNote>
      )}

      <section aria-labelledby="video-section" className="mt-6">
        <SectionHeading id="video-section">Âm thanh</SectionHeading>
        <VideoUploadPanel
          videoId={video.id}
          asset={video.asset}
          thumbnail={video.thumbnail}
          lineCount={video.lines.length}
          videoRef={videoRef}
          onUploaded={() => void refresh()}
          onSegments={(segments) =>
            setDraft((d) => ({
              ...d,
              lines: segments.map((s) => ({
                startMs: s.startMs,
                endMs: s.endMs,
                chunks: [],
                textKo: '',
                textVi: '',
                speaker: '',
              })),
            }))
          }
        />
      </section>

      <section aria-labelledby="thumb-section" className="mt-6">
        <SectionHeading id="thumb-section">Ảnh xem trước</SectionHeading>
        <ThumbnailUploadPanel
          videoId={video.id}
          thumbnail={video.thumbnail}
          onUploaded={() => void refresh()}
        />
      </section>

      <form onSubmit={(e) => void onSave(e)}>
        <section aria-labelledby="meta-section" className="mt-6">
          <SectionHeading id="meta-section">Thông tin</SectionHeading>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <TextField
              id="title"
              label="Chủ đề"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
            />
            <Select
              id="level"
              label="Cấp độ"
              value={String(draft.level)}
              onChange={(e) => set('level', Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  TOPIK{n}
                </option>
              ))}
            </Select>
            <TextField
              id="voice"
              label="Giọng đọc"
              value={draft.voice}
              onChange={(e) => set('voice', e.target.value)}
            />
            <Select
              id="voiceKind"
              label="Nguồn giọng"
              value={draft.voiceKind}
              onChange={(e) => set('voiceKind', e.target.value as 'HUMAN' | 'SYNTHETIC')}
            >
              <option value="SYNTHETIC">Do máy tạo</option>
              <option value="HUMAN">Người thật</option>
            </Select>
          </div>
        </section>

        <section aria-labelledby="lines-section" className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading id="lines-section">Câu và mốc thời gian</SectionHeading>
            <Button
              type="button"
              variant="ghost"
              onClick={() => set('lines', sortByStart(draft.lines))}
            >
              Sắp xếp lại theo thời gian
            </Button>
          </div>

          {issues.length > 0 && (
            <ul className="mt-2 grid gap-1 text-sm">
              {issues.map((issue, i) => (
                <li
                  key={i}
                  className={
                    blocking(issue) ? 'rounded-lg bg-wrong/10 px-3 py-1.5 text-wrong' : 'text-warn'
                  }
                >
                  {issueMessage(issue)}
                </li>
              ))}
            </ul>
          )}

          {chunkError !== null && <WarnNote>{chunkError}</WarnNote>}
          <LineEditor
            lines={draft.lines}
            activeIndex={activeLine}
            videoRef={videoRef}
            onProposeChunks={video.asset ? proposeChunksFor : undefined}
            onActivate={setActiveLine}
            onChangeLine={setLine}
            onChangeLines={(lines) => set('lines', lines)}
          />
        </section>

        <section aria-labelledby="glossary-section" className="mt-6">
          <SectionHeading id="glossary-section">
            Từ điển — chốt nghĩa trong ngữ cảnh
          </SectionHeading>
          <GlossaryEditor
            entries={draft.glossary}
            lines={video.lines}
            onChangeEntry={setEntry}
            onChangeEntries={(entries) => set('glossary', entries)}
          />
        </section>

        {saveError !== null && <ErrorNote>{userMessage(saveError)}</ErrorNote>}

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={busy || blockers.length > 0}>
            Lưu nháp
          </Button>
          {saved && <span className="text-sm text-correct">Đã lưu.</span>}
        </div>
      </form>

      <section aria-labelledby="review-section" className="mt-8">
        <SectionHeading id="review-section">Người bản ngữ nghe duyệt từng câu</SectionHeading>
        <ApprovalPanel
          videoId={video.id}
          lines={video.lines}
          dirty={dirty}
          videoRef={videoRef}
          onChanged={() => void refresh()}
        />
        <WarnNote>
          ⚠ <strong>AI không tự đưa video vào ngân hàng.</strong> Người học nhại theo giọng mẫu —
          giọng mẫu sai một chút thì họ nhớ sai rất lâu và không có cách nào tự biết.
        </WarnNote>
      </section>

      {/* Last on the page, and behind a confirmation, because everything above
          it is additive and this is the one control that takes something away.
          Which operation it offers is not a choice presented here — the row's
          own history decides, and RemoveDialog says which one it will run. */}
      {canRemove && (
        <section aria-labelledby="remove-section" className="mt-10 border-t border-line pt-6">
          <SectionHeading id="remove-section">
            {removal === 'DELETE' ? 'Xoá video này' : 'Gỡ khỏi ngân hàng'}
          </SectionHeading>
          <p className="mt-1 max-w-prose text-sm text-muted">
            {removal === 'DELETE'
              ? 'Video này chưa từng xuất bản, nên xoá được hẳn — cùng lời thoại và từ điển.'
              : 'Video này đã từng xuất bản nên không xoá được. Gỡ sẽ đưa nó ra khỏi danh sách của người học, còn tiến độ và thẻ đã tạo thì giữ nguyên.'}
          </p>
          <div className="mt-3">
            <Button
              type="button"
              variant={removal === 'DELETE' ? 'danger' : 'secondary'}
              onClick={() => setRemoving(true)}
            >
              {removal === 'DELETE' ? 'Xoá hẳn video' : 'Gỡ khỏi ngân hàng'}
            </Button>
          </div>
        </section>
      )}

      {publishing && (
        <PublishVideoDialog
          videoId={video.id}
          onClose={() => setPublishing(false)}
          onPublished={() => void refresh()}
        />
      )}

      {removing && (
        <RemoveDialog
          noun="video"
          title={video.title}
          publishedAt={video.publishedAt}
          learnerRecord="tiến độ của họ"
          onDelete={() => deleteAdminShadowVideo(video.id)}
          onRetire={() => retireAdminShadowVideo(video.id).then(() => undefined)}
          onClose={() => setRemoving(false)}
          onDone={(done) => {
            void refresh()
            // Only a delete leaves nothing to come back to. A retired video is
            // still editable and still republishable, so staying on it is what
            // lets the next click be "fix the line and publish again".
            if (done === 'DELETE') void navigate({ to: '/videos' })
          }}
        />
      )}
    </PageShell>
  )
}
