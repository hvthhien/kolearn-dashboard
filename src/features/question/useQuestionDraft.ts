import { useCallback, useMemo, useState } from 'react'
import type {
  AdminChoice,
  AdminQuestion,
  Evidence,
  QuestionTopic,
  SaveQuestionRequest,
} from '../../api/gen/model'

/**
 * The editor's working copy, and the one place blank becomes `null`.
 *
 * TCCN-301-3 is a rule about what reaches the database: a layer nobody has
 * written must be **absent**, not an empty string. The server already enforces
 * that on the way in (`NULLIF(btrim(…), '')` through the review layer) and the
 * learner's client has nowhere that substitutes "Chưa có" — so the authoring
 * screen is the only thing in the system that can manufacture the empty string
 * in the first place. It gets caught here, once, rather than at nine call
 * sites that each have to remember.
 *
 * The difference is invisible until it is on a learner's screen: an empty
 * string renders a layer heading with nothing under it, which reads as "the
 * author had nothing to say" rather than "this layer is not written yet".
 */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export interface Draft {
  stemKo: string
  stemVi: string
  explanationCorrectKo: string
  explanationCorrectVi: string
  difficultyManual: number | null
  choices: AdminChoice[]
  /* Resolved rather than bare ids: a topic just picked has no entry in the
     question's stored topics, so an id-only draft has nothing to render the
     chip's name from and falls back to showing the uuid. */
  topics: QuestionTopic[]
  evidence: Evidence[]
}

function toDraft(q: AdminQuestion): Draft {
  return {
    stemKo: q.stemKo,
    stemVi: q.stemVi ?? '',
    explanationCorrectKo: q.explanationCorrectKo ?? '',
    explanationCorrectVi: q.explanationCorrectVi ?? '',
    difficultyManual: q.difficultyManual ?? null,
    choices: q.choices.map((c) => ({ ...c })),
    topics: q.topics.map((t) => ({ ...t })),
    evidence: q.evidence.map((e) => ({ ...e })),
  }
}

export function useQuestionDraft(question: AdminQuestion) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(question))

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
  }, [])

  const setChoice = useCallback((ordinal: number, patch: Partial<AdminChoice>) => {
    setDraft((d) => ({
      ...d,
      choices: d.choices.map((c) => (c.ordinal === ordinal ? { ...c, ...patch } : c)),
    }))
  }, [])

  /**
   * Exactly one correct choice, always — GĐ-4's second half. Marking one
   * unmarks the rest here rather than at the publish gate, because a radio
   * group that can end up with two selected is a control lying about itself.
   * The gate still checks: an imported paper can arrive with two.
   */
  const setCorrect = useCallback((ordinal: number) => {
    setDraft((d) => ({
      ...d,
      choices: d.choices.map((c) => ({ ...c, isCorrect: c.ordinal === ordinal })),
    }))
  }, [])

  const reset = useCallback((q: AdminQuestion) => setDraft(toDraft(q)), [])

  /** True when the author has moved the answer key off where it was stored. */
  const answerKeyChanged = useMemo(
    () =>
      draft.choices.some((c) => {
        const before = question.choices.find((x) => x.ordinal === c.ordinal)
        return !before || before.isCorrect !== c.isCorrect
      }),
    [draft.choices, question.choices],
  )

  const request = useMemo<SaveQuestionRequest>(
    () => ({
      stemKo: draft.stemKo,
      stemVi: draft.stemVi,
      explanationCorrectKo: blankToNull(draft.explanationCorrectKo),
      explanationCorrectVi: blankToNull(draft.explanationCorrectVi),
      difficultyManual: draft.difficultyManual,
      choices: draft.choices.map((c) => ({
        ordinal: c.ordinal,
        textKo: c.textKo,
        textVi: c.textVi ?? '',
        isCorrect: c.isCorrect,
        whyWrongKo: blankToNull(c.whyWrongKo ?? ''),
        whyWrongVi: blankToNull(c.whyWrongVi ?? ''),
      })),
      topicIds: draft.topics.map((t) => t.topicId),
      evidence: draft.evidence,
    }),
    [draft],
  )

  return { draft, set, setChoice, setCorrect, reset, request, answerKeyChanged }
}
