import { useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  deleteAdminDictationSet,
  getGetAdminDictationSetQueryKey,
  getListAdminDictationSetsQueryKey,
  retireAdminDictationSet,
  useGetAdminDictationSet,
} from '../api/gen/kolearn'
import { userMessage } from '../lib/problem'
import { useAuth } from '../lib/auth'
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
import { EditSetDialog } from '../features/dictation/EditSetDialog'
import { RemoveDialog } from '../features/manage/RemoveDialog'
import { removalFor } from '../features/manage/removal'

/**
 * Xưởng chép chính tả — one set.
 *
 * Read-only about the CONTENT, and that is the whole shape of it. The
 * sentences, the translations, the dictionary and the anchors arrive through
 * `cmd/dictation-import`; what this screen writes is the verdict, the four
 * metadata fields, and whether the set still exists.
 *
 * That is not a stopgap. It is what the screen is for: the importer can do
 * everything except hear whether the audio says what the transcript claims, and
 * that single check is what stands between a mis-transcribed sentence and a
 * learner being marked wrong for hearing correctly.
 *
 * "Sửa thông tin" does not soften that line. It reaches the title, the level
 * and the voice labels — the things the importer cannot fix afterwards because
 * it was the manifest that was wrong — and no sentence goes back for another
 * ear over a rename.
 */
export function DictationStudioPage() {
  const { setId } = useParams({ from: '/dictation/$setId' })
  const { data, error, isPending } = useGetAdminDictationSet(setId)
  const [publishing, setPublishing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()

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

  const canWrite = user?.permissions.includes('dictation:write') ?? false
  const canPublish = user?.permissions.includes('dictation:publish') ?? false
  const removal = removalFor(data.publishedAt)
  // Deleting is authoring and retiring is release, so the button is offered on
  // whichever permission matches the operation this set would actually get.
  const canRemove = removal === 'DELETE' ? canWrite : canPublish

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetAdminDictationSetQueryKey(data.id) })
    void queryClient.invalidateQueries({ queryKey: getListAdminDictationSetsQueryKey() })
  }

  return (
    <PageShell>
      <Link to="/dictation" className="text-sm font-medium text-brand">
        ← Danh sách bộ
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{data.title}</PageTitle>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              Sửa thông tin
            </Button>
          )}
          <Button onClick={() => setPublishing(true)} disabled={data.status === 'PUBLISHED'}>
            {data.status === 'PUBLISHED' ? 'Đã xuất bản' : 'Xuất bản'}
          </Button>
        </div>
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

      {/* Last on the page, and behind a confirmation, because everything above
          it is additive and this is the one control that takes something away.
          Which operation it offers is not a choice presented here — the set's
          own history decides, and RemoveDialog says which one it will run. */}
      {canRemove && (
        <section aria-labelledby="remove-section" className="mt-10 border-t border-line pt-6">
          <SectionHeading id="remove-section">
            {removal === 'DELETE' ? 'Xoá bộ này' : 'Gỡ khỏi ngân hàng'}
          </SectionHeading>
          <p className="mt-1 max-w-prose text-sm text-muted">
            {removal === 'DELETE'
              ? 'Bộ này chưa từng xuất bản, nên xoá được hẳn — cùng toàn bộ câu và từ điển. Nhập lại bằng lệnh nhập nếu cần.'
              : 'Bộ này đã từng xuất bản nên không xoá được. Gỡ sẽ đưa nó ra khỏi danh sách của người học, còn kết quả chép và thẻ đã tạo thì giữ nguyên.'}
          </p>
          <div className="mt-3">
            <Button
              type="button"
              variant={removal === 'DELETE' ? 'danger' : 'secondary'}
              onClick={() => setRemoving(true)}
            >
              {removal === 'DELETE' ? 'Xoá hẳn bộ' : 'Gỡ khỏi ngân hàng'}
            </Button>
          </div>
        </section>
      )}

      {publishing && <PublishSetDialog set={data} onClose={() => setPublishing(false)} />}

      {editing && (
        <EditSetDialog set={data} onClose={() => setEditing(false)} onSaved={refresh} />
      )}

      {removing && (
        <RemoveDialog
          noun="bộ"
          title={data.title}
          publishedAt={data.publishedAt}
          learnerRecord="kết quả chép của họ"
          onDelete={() => deleteAdminDictationSet(data.id)}
          onRetire={() => retireAdminDictationSet(data.id).then(() => undefined)}
          onClose={() => setRemoving(false)}
          onDone={(done) => {
            refresh()
            // Only a delete leaves nothing to come back to. A retired set is
            // still reviewable and still republishable, so staying on it is
            // what lets the next click be "fix the sentence and publish again".
            if (done === 'DELETE') void navigate({ to: '/dictation' })
          }}
        />
      )}
    </PageShell>
  )
}
