import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getGetAdminDictationSetQueryKey,
  getListAdminDictationSetsQueryKey,
  publishAdminDictationSet,
} from '../../api/gen/kolearn'
import type { AdminDictationPublishReport, AdminDictationSetDetail } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { Button, Dialog, ErrorNote } from '../../components/ui'

/**
 * The release gate for a dictation set, on screen.
 *
 * Two lists, because the server returns two, and merging them into one
 * "problems" list reads better and destroys the distinction the server went to
 * the trouble of making: a blocker refuses the publish, a warning is a thing to
 * read and decide about. If warnings blocked too, nobody would publish anything
 * and the gate would be routed around.
 *
 * The blockers here are unusually load-bearing. An unreviewed sentence means
 * nobody has confirmed the audio says what the transcript claims — and since
 * grading is exact comparison against that transcript, publishing one marks a
 * learner wrong for hearing correctly.
 *
 * Mounted by the caller only while open, so there is no state to reset between
 * openings and no effect doing the resetting — the same shape PublishDialog
 * uses for exams.
 */
export function PublishSetDialog({
  set,
  onClose,
}: {
  set: AdminDictationSetDetail
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  // A POST, but read-only by contract when `dryRun` is set — so it is a query,
  // and the dialog gets caching, `isPending` and error handling for free.
  const dryRun = useQuery<AdminDictationPublishReport>({
    queryKey: ['dictation-publish-dry-run', set.id],
    queryFn: ({ signal }) => publishAdminDictationSet(set.id, { dryRun: true }, { signal }),
    gcTime: 0,
    staleTime: 0,
  })

  const publish = useMutation({
    mutationFn: () => publishAdminDictationSet(set.id, { acceptWarnings: true }),
    onSuccess: async (report) => {
      if (!report.published) return
      await queryClient.invalidateQueries({ queryKey: getGetAdminDictationSetQueryKey(set.id) })
      await queryClient.invalidateQueries({ queryKey: getListAdminDictationSetsQueryKey() })
    },
  })

  const report = publish.data ?? dryRun.data
  const error = publish.error ?? dryRun.error
  const blocked = (report?.blockers.length ?? 0) > 0
  const done = publish.data?.published === true

  return (
    <Dialog
      title={`Xuất bản ${set.title}`}
      open
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Xong</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              onClick={() => publish.mutate()}
              disabled={publish.isPending || dryRun.isPending || blocked || !report}
            >
              {report && report.warnings.length > 0 ? 'Vẫn xuất bản' : 'Xuất bản'}
            </Button>
          </>
        )
      }
    >
      {error != null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      {dryRun.isPending && <p className="text-sm text-muted">Đang kiểm tra…</p>}

      {done && (
        <p className="rounded-xl bg-correct/10 px-4 py-3 text-sm text-correct">
          Đã xuất bản. Bộ này giờ hiện trong danh sách chép chính tả của người học.
        </p>
      )}

      {report && !done && (
        <div className="flex flex-col gap-5">
          <section aria-labelledby="dictation-publish-blockers">
            <h3 id="dictation-publish-blockers" className="text-sm font-semibold text-wrong">
              Lỗi chặn ({report.blockers.length})
            </h3>
            {report.blockers.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Không có lỗi chặn nào.</p>
            ) : (
              <>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {report.blockers.map((b) => (
                    <li key={b} className="rounded-lg bg-wrong/10 px-3 py-2 text-sm text-ink">
                      {b}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  Còn lỗi chặn thì không xuất bản được. Câu chưa nghe duyệt là câu chưa ai xác nhận
                  tiếng có khớp lời thoại — người học sẽ bị chấm sai dù nghe đúng.
                </p>
              </>
            )}
          </section>

          <section aria-labelledby="dictation-publish-warnings">
            <h3 id="dictation-publish-warnings" className="text-sm font-semibold text-ink">
              Cảnh báo ({report.warnings.length})
            </h3>
            {report.warnings.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Không có cảnh báo nào.</p>
            ) : (
              <>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {report.warnings.map((w) => (
                    <li key={w} className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink">
                      {w}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  Cảnh báo không chặn xuất bản. Đọc rồi xác nhận nếu vẫn muốn phát hành.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </Dialog>
  )
}
