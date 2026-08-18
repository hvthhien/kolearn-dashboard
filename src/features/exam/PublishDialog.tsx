import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getGetAdminExamQueryKey,
  getListAdminExamsQueryKey,
  publishAdminExam,
} from '../../api/gen/kolearn'
import type { AdminExamDetail, PublishReport } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { Button, Dialog, ErrorNote } from '../../components/ui'

/**
 * The release gate, on screen.
 *
 * `bank.Publish` returns blockers and warnings as two lists, and this shows
 * them as two lists. That is the whole of TCCN-301-7, and it is easy to get
 * wrong in the friendliest possible way — merging them into one "problems"
 * list reads better and destroys the distinction the server went to the
 * trouble of making. A blocker refuses the publish; a warning is a thing to
 * look at and decide about, and if warnings blocked too then nobody would
 * publish anything and the gate would be routed around.
 *
 * Opening runs the gate as a dry run, so the author sees the verdict before
 * committing to anything. Warnings then need an explicit acknowledgement,
 * because a warning nobody has to acknowledge is a warning nobody reads.
 *
 * Mounted by the caller only while open, so there is no state to reset between
 * openings and no effect doing the resetting.
 */
export function PublishDialog({
  exam,
  onClose,
}: {
  exam: AdminExamDetail
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  // A POST, but read-only by contract when `dryRun` is set — so it is a query,
  // and the dialog gets caching, `isPending` and error handling for free.
  const dryRun = useQuery<PublishReport>({
    queryKey: ['publish-dry-run', exam.id],
    queryFn: ({ signal }) => publishAdminExam(exam.id, { dryRun: true }, { signal }),
    gcTime: 0,
    staleTime: 0,
  })

  const publish = useMutation({
    mutationFn: () => publishAdminExam(exam.id, { acceptWarnings: true }),
    onSuccess: async (report) => {
      if (!report.published) return
      await queryClient.invalidateQueries({ queryKey: getGetAdminExamQueryKey(exam.id) })
      await queryClient.invalidateQueries({ queryKey: getListAdminExamsQueryKey() })
    },
  })

  const report = publish.data ?? dryRun.data
  const error = publish.error ?? dryRun.error
  const blocked = (report?.blockers.length ?? 0) > 0
  const done = publish.data?.published === true

  return (
    <Dialog
      title={`Xuất bản ${exam.code}`}
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
          Đã xuất bản {report?.examCode}. Đề này giờ hiện trong danh sách của người học.
        </p>
      )}

      {report && !done && (
        <div className="flex flex-col gap-5">
          <section aria-labelledby="publish-blockers">
            <h3 id="publish-blockers" className="text-sm font-semibold text-wrong">
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
                  Còn lỗi chặn thì không xuất bản được. Sửa xong rồi mở lại.
                </p>
              </>
            )}
          </section>

          <section aria-labelledby="publish-warnings">
            <h3 id="publish-warnings" className="text-sm font-semibold text-ink">
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
