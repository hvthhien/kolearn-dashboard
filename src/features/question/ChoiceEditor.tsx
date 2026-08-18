import type { ChangeEvent } from 'react'
import type { AdminChoice } from '../../api/gen/model'
import { Textarea } from '../../components/ui'

/**
 * The four choices, each with its own Vietnamese and its own layer 3.
 *
 * The shape is the criterion. TCCN-301-2: three distractors get **three**
 * boxes, one each, and there is no shared box for the question. Layer 3
 * answers "why is *the choice you picked* wrong" — an explanation written once
 * and shown to whoever picked any of the three can only be an explanation that
 * says nothing about any of them. The schema keeps a generic fallback because
 * imported papers have one; this editor does not offer it, because offering it
 * is offering a way to skip writing three.
 *
 * The Vietnamese box beside every choice is YC-121, and it is not optional
 * polish: a learner who cannot read the choice cannot read an explanation
 * about that choice either, which makes layers 2 and 3 useless to them.
 */
export function ChoiceEditor({
  choices,
  onChange,
  onSetCorrect,
  answerLocked,
}: {
  choices: AdminChoice[]
  onChange: (ordinal: number, patch: Partial<AdminChoice>) => void
  onSetCorrect: (ordinal: number) => void
  answerLocked: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-semibold text-ink">
        Lựa chọn và đáp án đúng
        {/* GĐ-4 states the shape; the count is shown rather than enforced so a
            half-built question still saves (TCCN-301-10). */}
        <span className="ml-2 font-normal text-muted">
          {choices.length}/4 lựa chọn
          {choices.length !== 4 && ' — xuất bản cần đúng 4'}
        </span>
      </legend>

      {choices.map((choice) => {
        const id = `choice-${choice.ordinal}`
        return (
          <div
            key={choice.ordinal}
            className={`rounded-xl border p-4 ${
              choice.isCorrect ? 'border-correct bg-correct/5' : 'border-line bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-muted">Lựa chọn {choice.ordinal}</span>
              <label className="tap inline-flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="radio"
                  name="correct-choice"
                  checked={choice.isCorrect}
                  disabled={answerLocked}
                  onChange={() => onSetCorrect(choice.ordinal)}
                />
                Đáp án đúng
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Textarea
                id={`${id}-ko`}
                label="Tiếng Hàn"
                korean
                value={choice.textKo}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(choice.ordinal, { textKo: e.target.value })}
              />
              <Textarea
                id={`${id}-vi`}
                label="Bản dịch tiếng Việt"
                value={choice.textVi ?? ''}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(choice.ordinal, { textVi: e.target.value })}
              />
            </div>

            {/* Layer 3 belongs only to a distractor: the right answer's
                explanation is layer 2, and it is a different question. */}
            {!choice.isCorrect && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Textarea
                  id={`${id}-why-ko`}
                  label={`Tầng 3 — vì sao lựa chọn ${choice.ordinal} sai (tiếng Hàn)`}
                  value={choice.whyWrongKo ?? ''}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(choice.ordinal, { whyWrongKo: e.target.value })}
                />
                <Textarea
                  id={`${id}-why-vi`}
                  label={`Tầng 3 — vì sao lựa chọn ${choice.ordinal} sai (tiếng Việt)`}
                  value={choice.whyWrongVi ?? ''}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(choice.ordinal, { whyWrongVi: e.target.value })}
                />
              </div>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
