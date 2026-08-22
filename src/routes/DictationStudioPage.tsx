import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { getGetAdminDictationSetQueryKey, useGetAdminDictationSet } from '../api/gen/kolearn'
import { userMessage } from '../lib/problem'
import {
  Badge,
  Button,
  ErrorNote,
  PageShell,
  PageTitle,
  SectionHeading,
  Spinner,
} from '../components/ui'
import { ReviewPanel } from '../features/dictation/ReviewPanel'
import { PublishSetDialog } from '../features/dictation/PublishSetDialog'

/**
 * Xưởng chép chính tả — one set.
 *
 * Read-only about the content, and that is the whole shape of it. The
 * sentences, the translations, the dictionary and the anchors arrive through
 * `cmd/dictation-import`; the only thing this screen writes is the verdict.
 *
 * That is not a stopgap. It is what the screen is for: the importer can do
 * everything except hear whether the audio says what the transcript claims, and
 * that single check is what stands between a mis-transcribed sentence and a
 * learner being marked wrong for hearing correctly.
 */
export function DictationStudioPage() {
  const { setId } = useParams({ from: '/dictation/$setId' })
  const { data, error, isPending } = useGetAdminDictationSet(setId)
  const [publishing, setPublishing] = useState(false)
  const queryClient = useQueryClient()

  if (error != null) {
    return (
      <PageShell>
        <ErrorNote>{userMessage(error)}</ErrorNote>
      </PageShell>
    )
  }
  if (isPending || !data) {
    return (
      <PageShell>
        <Spinner label="Đang mở bộ…" />
      </PageShell>
    )
  }

  const ready = data.review.unreviewed === 0 && data.review.rejected === 0

  return (
    <PageShell>
      <Link to="/dictation" className="text-sm font-medium text-brand">
        ← Danh sách bộ
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{data.title}</PageTitle>
        <Button onClick={() => setPublishing(true)} disabled={data.status === 'PUBLISHED'}>
          {data.status === 'PUBLISHED' ? 'Đã xuất bản' : 'Xuất bản'}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>Cấp độ {data.level}</span>
        <span>·</span>
        <span>
          {data.voice || 'chưa ghi giọng đọc'}
          {data.voiceKind === 'SYNTHETIC' && ' · do máy tạo'}
        </span>
        <span>·</span>
        <span>{data.items.length} câu</span>
        <span>·</span>
        <span>{data.glossary.length} mục từ điển</span>
      </div>

      {/* The counter, and the reason the screen exists. "Chưa nghe" includes
          verdicts that went stale when a sentence was edited under them — a
          verdict about audio that has since been replaced is not a verdict. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="ok">{data.review.approved} đạt</Badge>
        {data.review.rejected > 0 && <Badge tone="bad">{data.review.rejected} chưa đạt</Badge>}
        {data.review.unreviewed > 0 ? (
          <Badge tone="warn">{data.review.unreviewed} chưa nghe</Badge>
        ) : (
          <Badge>đã nghe hết</Badge>
        )}
      </div>

      {!ready && data.status !== 'PUBLISHED' && (
        <p className="mt-3 text-sm text-muted">
          Còn câu chưa nghe duyệt thì không xuất bản được. Chấm chính tả là so chữ với lời thoại,
          nên một câu có tiếng không khớp lời thoại sẽ chấm sai người học dù họ nghe đúng.
        </p>
      )}

      <SectionHeading>Nghe duyệt từng câu</SectionHeading>
      <ReviewPanel
        setId={data.id}
        items={data.items}
        onChanged={() => {
          void queryClient.invalidateQueries({
            queryKey: getGetAdminDictationSetQueryKey(data.id),
          })
        }}
      />

      {data.glossary.length > 0 && (
        <>
          <SectionHeading>Từ điển của bộ</SectionHeading>
          <p className="mt-1 text-sm text-muted">
            Soạn bằng importer. Một mục chưa chốt nghĩa trong ngữ cảnh sẽ chặn xuất bản — YC-426
            đem chính những mục này ra gợi ý cho người học lưu thành thẻ.
          </p>
          <ul className="mt-2 grid gap-2">
            {data.glossary.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-line bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ko font-medium">{entry.headwordKo}</span>
                  {entry.readingLatin !== '' && (
                    <span className="text-xs text-muted">{entry.readingLatin}</span>
                  )}
                  <span className="text-xs text-muted">{entry.partOfSpeech}</span>
                  {entry.contextSettled ? (
                    <Badge tone="ok">đã chốt</Badge>
                  ) : (
                    <Badge tone="warn">chưa chốt nghĩa trong ngữ cảnh</Badge>
                  )}
                  <span className="ml-auto text-xs text-muted">
                    {entry.occurrences.length} chỗ trong bộ
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink">Nghĩa chung: {entry.meaningVi}</p>
                {entry.contextMeaningVi !== '' && (
                  <p className="text-sm text-muted">Trong bộ này: {entry.contextMeaningVi}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {publishing && <PublishSetDialog set={data} onClose={() => setPublishing(false)} />}
    </PageShell>
  )
}
