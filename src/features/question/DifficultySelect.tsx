import { Field } from '../../components/ui'

/**
 * YC-303 — difficulty, assigned by hand while authoring.
 *
 * Three things about this control are criteria rather than choices:
 *
 * - It is assigned here, at authoring time (TCCN-303-1). The BA left the
 *   method open — tag by hand, or derive from real attempt data — and flagged
 *   that it has to be decided before the first batch of papers. The team's
 *   standing answer is by hand now, with room kept for the derived value:
 *   tagging thousands of questions retroactively costs far more, and deriving
 *   needs attempt data that does not exist yet.
 * - Blank is a legitimate state (TCCN-303-3). An unassigned difficulty is a
 *   publish *warning* with a count, never a blocker.
 * - The observed value sits beside it, read-only and clearly separate. ver1.0
 *   uses only the manual one; keeping both from the start is what stops this
 *   being a schema change later.
 *
 * And the one thing this control must never grow: a mirror on a learner
 * screen. TCCN-303-2 — no label, no filter, no sort, anywhere a learner
 * looks. Difficulty's user is the ver1.1 placement test; showing it early just
 * invites a learner to filter for the easy questions, which ruins both the
 * measurement and the studying.
 */
export function DifficultySelect({
  value,
  observed,
  onChange,
}: {
  value: number | null
  observed?: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <Field
      label="Độ khó"
      htmlFor="difficulty"
      hint="Chưa gắn cũng xuất bản được — đây là cảnh báo, không phải lỗi chặn."
    >
      <div className="flex flex-wrap items-center gap-3">
        <select
          id="difficulty"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="tap rounded-xl border border-line bg-white px-4 text-base text-ink"
        >
          <option value="">Chưa gắn</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>

        {observed != null && (
          <span className="text-xs text-muted">
            Suy từ dữ liệu làm bài: {observed.toFixed(3)} — chỉ để tham khảo, ver1.0 không dùng.
          </span>
        )}
      </div>
    </Field>
  )
}
