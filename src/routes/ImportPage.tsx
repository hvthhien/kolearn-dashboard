import { useState } from 'react'
import { dryRunImport, runImport } from '../api/gen/kolearn'
import type { ImportReport } from '../api/gen/model'
import { userMessage } from '../lib/problem'
import {
  Button,
  ErrorNote,
  PageShell,
  PageTitle,
  SectionHeading,
  Table,
  Td,
  Th,
  WarnNote,
} from '../components/ui'

/**
 * Batch import, with the dry run as a required first step.
 *
 * TCCN-301-6: choosing *chạy thử* reports how many rows would be created,
 * updated and skipped, and where each problem is — and writes nothing. The
 * real run that follows produces exactly those changes.
 *
 * The gate reports every problem at once rather than stopping at the first.
 * Fixing a thousand-question file one error per run is not a workflow anyone
 * follows; they give up and hand-edit the database instead, which is how a
 * paper ends up in the bank without ever passing the gate.
 *
 * The real-run button does not exist until a dry run has been read. It is a
 * step, not a suggestion: an import that lands a paper nobody previewed is not
 * undoable from this screen.
 *
 * The counts are what the server can honestly report — passages, questions,
 * choices, topics — not created/updated/skipped. An import whose exam code
 * already exists is refused outright rather than merged, so there is no diff to
 * describe, and a three-number summary would be describing a merge that never
 * happens. Issues carry `where` (`questions[14].choices`) rather than a line
 * number, because the gate validates the parsed bundle and by then the line it
 * came from is gone.
 */
export function ImportPage() {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ImportReport | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function submit(real: boolean) {
    setBusy(true)
    setError(null)
    try {
      const bundle = JSON.parse(text) as Record<string, unknown>
      const result = real ? await runImport({ bundle }) : await dryRunImport({ bundle })
      setPreview(result)
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError(new Error(`Tệp không phải JSON hợp lệ: ${err.message}`))
      } else {
        setError(err)
      }
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File) {
    setText(await file.text())
    setPreview(null)
  }

  // `ok` is the gate's own verdict rather than a count this screen infers.
  const blocked = preview != null && !preview.ok

  return (
    <PageShell>
      <PageTitle>Nhập lô đề</PageTitle>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Chạy thử trước, xem báo cáo, rồi mới chạy thật. Chạy thử không ghi gì vào ngân hàng đề.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Tệp bundle (.json)
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFile(file)
            }}
            className="tap rounded-xl border border-line bg-white px-4 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Hoặc dán nội dung bundle
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setPreview(null)
            }}
            rows={8}
            className="w-full rounded-xl border border-line bg-white p-3 font-mono text-xs text-ink"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={busy || text.trim() === ''} onClick={() => void submit(false)}>
            {busy ? 'Đang chạy…' : 'Chạy thử'}
          </Button>
          <Button disabled={busy || !preview || blocked} onClick={() => void submit(true)}>
            Chạy thật
          </Button>
        </div>

        {error != null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      </div>

      {preview && (
        <section className="mt-8" aria-labelledby="import-report">
          <SectionHeading id="import-report">
            {preview.dryRun ? 'Báo cáo chạy thử' : 'Kết quả chạy thật'}
          </SectionHeading>

          {preview.dryRun && (
            <p className="mt-2 text-sm text-muted">
              Chưa ghi gì vào ngân hàng đề. Chạy thật sẽ tạo ra đúng những thay đổi dưới đây.
            </p>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Đoạn văn', preview.passages ?? 0],
              ['Câu hỏi', preview.questions ?? 0],
              ['Lựa chọn', preview.choices ?? 0],
              ['Chủ điểm mới', preview.topicsNew ?? 0],
              ['Lỗi', preview.issues.length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line bg-white px-4 py-3">
                <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {preview.translationCoverage != null && preview.translationCoverage < 1 && (
            <div className="mt-3">
              <WarnNote>
                Bản dịch tiếng Việt mới phủ {Math.round(preview.translationCoverage * 100)}%. Không
                chặn nhập, nhưng năm tầng giải thích chỉ dùng được với người học đọc hiểu được
                lựa chọn (YC-121).
              </WarnNote>
            </div>
          )}

          <div className="mt-4">
            {preview.issues.length === 0 ? (
              <p className="text-sm text-correct">Không có lỗi nào.</p>
            ) : (
              <Table
                caption="Các lỗi trong tệp nhập"
                head={
                  <tr>
                    <Th>Vị trí trong tệp</Th>
                    <Th>Lỗi</Th>
                  </tr>
                }
              >
                {preview.issues.map((issue) => (
                  <tr key={`${issue.where}-${issue.message}`}>
                    <Td className="font-mono text-xs">{issue.where}</Td>
                    <Td>{issue.message}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </section>
      )}
    </PageShell>
  )
}
