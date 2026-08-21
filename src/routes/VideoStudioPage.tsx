import { useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  getGetAdminShadowVideoQueryKey,
  getListAdminShadowVideosQueryKey,
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
import { ApprovalPanel } from '../features/shadowing/ApprovalPanel'
import { GlossaryEditor } from '../features/shadowing/GlossaryEditor'
import { VideoUploadPanel } from '../features/shadowing/VideoUploadPanel'
import { PublishVideoDialog } from '../features/shadowing/PublishVideoDialog'
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
        <Spinner label="Đang tải video…" />
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
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [publishing, setPublishing] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const canPublish = user?.permissions.includes('shadowing:publish') ?? false

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
          ← Về xưởng video
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
        <SectionHeading id="video-section">Video</SectionHeading>
        <VideoUploadPanel
          videoId={video.id}
          asset={video.asset}
          lineCount={video.lines.length}
          videoRef={videoRef}
          onUploaded={() => void refresh()}
          onSegments={(segments) =>
            setDraft((d) => ({
              ...d,
              lines: segments.map((s) => ({
                startMs: s.startMs,
                endMs: s.endMs,
                textKo: '',
                textVi: '',
                speaker: '',
              })),
            }))
          }
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

          <LineEditor
            lines={draft.lines}
            activeIndex={activeLine}
            videoRef={videoRef}
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

      {publishing && (
        <PublishVideoDialog
          videoId={video.id}
          onClose={() => setPublishing(false)}
          onPublished={() => void refresh()}
        />
      )}
    </PageShell>
  )
}
