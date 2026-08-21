import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { publishAdminShadowVideo } from '../../api/gen/kolearn'
import { userMessage } from '../../lib/problem'
import { Button, Dialog, ErrorNote, SectionHeading, Spinner } from '../../components/ui'

/**
 * The gate, run before anything is released.
 *
 * `PublishDialog`'s shape with the nouns changed, deliberately including the
 * two things that make it work: the dry run is a `useQuery` over a POST that is
 * read-only by contract, and blockers and warnings render in two separate
 * sections rather than one merged list. If warnings blocked as well, nobody
 * would publish anything and the gate would be routed around.
 */
export function PublishVideoDialog({
  videoId,
  onClose,
  onPublished,
}: {
  videoId: string
  onClose: () => void
  onPublished: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const report = useQuery({
    queryKey: ['publish-dry-run', 'shadowing', videoId],
    queryFn: ({ signal }) => publishAdminShadowVideo(videoId, { dryRun: true }, { signal }),
    gcTime: 0,
    staleTime: 0,
  })

  const blocked = (report.data?.blockers.length ?? 0) > 0
  const warnings = report.data?.warnings ?? []

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await publishAdminShadowVideo(videoId, {
        acceptWarnings: warnings.length > 0,
      })
      if (result.published) {
        onPublished()
        onClose()
      } else {
        setError(new Error('gate_refused'))
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Đưa vào ngân hàng"
      onClose={onClose}
      footer={
        <>
          <Button
            type="button"
            onClick={() => void publish()}
            disabled={busy || blocked || !report.data}
          >
            {warnings.length > 0 ? 'Vẫn đưa vào ngân hàng' : 'Đưa vào ngân hàng'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
        </>
      }
    >
      {report.isPending && <Spinner label="Đang kiểm tra…" />}
      {report.error ? <ErrorNote>{userMessage(report.error)}</ErrorNote> : null}
      {error !== null && (
        <ErrorNote>
          {error instanceof Error && error.message === 'gate_refused'
            ? 'Cổng kiểm tra đã từ chối — xem lại danh sách bên trên.'
            : userMessage(error)}
        </ErrorNote>
      )}

      {report.data && (
        <>
          <section>
            <SectionHeading>Lỗi chặn ({report.data.blockers.length})</SectionHeading>
            {report.data.blockers.length === 0 ? (
              <p className="text-sm text-muted">Không có lỗi chặn nào.</p>
            ) : (
              <ul className="mt-1 grid gap-1 text-sm text-wrong">
                {report.data.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-4">
            <SectionHeading>Cảnh báo ({warnings.length})</SectionHeading>
            {warnings.length === 0 ? (
              <p className="text-sm text-muted">Không có cảnh báo nào.</p>
            ) : (
              <ul className="mt-1 grid gap-1 text-sm text-warn">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Dialog>
  )
}
