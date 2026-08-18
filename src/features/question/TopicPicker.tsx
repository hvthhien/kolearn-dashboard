import { useId, useState } from 'react'
import { useListTopics } from '../../api/gen/kolearn'
import type { AdminQuestionTopic, Topic } from '../../api/gen/model'
import { Field } from '../../components/ui'

const CATEGORY_LABEL: Record<Topic['category'], string> = {
  GRAMMAR: 'ngữ pháp',
  VOCAB: 'từ vựng',
  READING_SKILL: 'kỹ năng đọc',
  LISTENING_SKILL: 'kỹ năng nghe',
}

/**
 * Layer 5, tagged from the catalogue and never typed free-hand.
 *
 * TCCN-301-5, and the reason is R-06: the weakness table counts wrong answers
 * **by topic**. Two spellings of one topic split "sai 8 trên 11 lần gặp" into
 * two rows, and both rows are wrong — the number the whole product exists to
 * produce, quietly halved. This input is the cheapest place in the system to
 * stop that: one field, one time, before the row exists.
 *
 * So typing produces suggestions and nothing else. There is deliberately no
 * "create «what you typed»" affordance here; widening the catalogue is
 * `topic:manage`, a permission an author does not have, and it is a decision
 * about the taxonomy rather than a step in tagging one question.
 *
 * It reads `GET /topics`, the same normalised catalogue a learner tags from,
 * rather than an admin-only copy of it. R-06 counts weakness by topic across
 * both, so two lists would be two spellings waiting to happen — the exact
 * failure this control exists to prevent.
 */
export function TopicPicker({
  selected,
  onChange,
}: {
  selected: AdminQuestionTopic[]
  onChange: (topics: AdminQuestionTopic[]) => void
}) {
  const inputId = useId()
  const [query, setQuery] = useState('')
  const { data } = useListTopics({ q: query })

  const selectedIds = selected.map((t) => t.topicId)
  const suggestions = (data?.items ?? []).filter((t) => !selectedIds.includes(t.id))
  const exactMatch = (data?.items ?? []).some(
    (t) => t.name.toLowerCase() === query.trim().toLowerCase(),
  )

  return (
    <Field
      label="Tầng 5 — chủ điểm cần biết"
      htmlFor={inputId}
      hint="Chọn từ danh mục đã chuẩn hoá. Gõ một tên chưa có không tạo được chủ điểm mới."
    >
      <div className="flex flex-col gap-3">
        {selected.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {selected.map((t) => (
              <li key={t.topicId}>
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 py-1 pr-1 pl-3 text-sm">
                  <span className="text-xs text-muted">{CATEGORY_LABEL[t.category]}</span>
                  <span className="font-medium text-ink">{t.name}</span>
                  <button
                    type="button"
                    aria-label={`Bỏ chủ điểm ${t.name}`}
                    onClick={() => onChange(selected.filter((x) => x.topicId !== t.topicId))}
                    className="tap grid place-items-center rounded-full px-2 text-muted hover:text-ink"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={`${inputId}-list`}
          autoComplete="off"
          placeholder="Gõ để tìm chủ điểm…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="tap rounded-xl border border-line bg-white px-4 text-base text-ink"
        />

        <ul id={`${inputId}-list`} className="flex flex-wrap gap-2">
          {suggestions.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([
                    ...selected,
                    { topicId: t.id, name: t.name, category: t.category, note: '' },
                  ])
                  setQuery('')
                }}
                className="tap rounded-full border border-line bg-white px-3 text-sm text-ink hover:bg-brand-soft"
              >
                <span className="text-xs text-muted">{CATEGORY_LABEL[t.category]} — </span>
                {t.name}
                {!t.isSystem && <span className="ml-1 text-xs text-muted">(tự thêm)</span>}
              </button>
            </li>
          ))}
        </ul>

        {query.trim() !== '' && suggestions.length === 0 && !exactMatch && (
          <p className="text-sm text-muted">
            Không có chủ điểm nào khớp “{query.trim()}”. Chủ điểm mới phải được thêm vào danh
            mục trước — gõ tự do ở đây không tạo được chủ điểm.
          </p>
        )}
      </div>
    </Field>
  )
}
