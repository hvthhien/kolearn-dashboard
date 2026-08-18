import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  createQuestionVersion,
  getGetAdminQuestionQueryKey,
  getListAdminQuestionsQueryKey,
  saveAdminQuestion,
  useGetAdminQuestion,
} from '../api/gen/kolearn'
import type { AdminQuestion, AnswerLockedProblem } from '../api/gen/model'
import { isProblem, userMessage } from '../lib/problem'
import { SECTION_LABEL } from '../features/exam/sectionLabels'
import { AnswerLockNotice } from '../features/question/AnswerLockNotice'
import { ChoiceEditor } from '../features/question/ChoiceEditor'
import { DifficultySelect } from '../features/question/DifficultySelect'
import { EvidencePicker } from '../features/question/EvidencePicker'
import { TopicPicker } from '../features/question/TopicPicker'
import { useQuestionDraft } from '../features/question/useQuestionDraft'
import {
  Badge,
  Button,
  ErrorNote,
  PageShell,
  PageTitle,
  SectionHeading,
  Spinner,
  Textarea,
} from '../components/ui'

export function QuestionEditorPage() {
  const { examId, questionId } = useParams({ from: '/exams/$examId/questions/$questionId' })
  const { data: question, isPending, error } = useGetAdminQuestion(questionId)

  if (isPending) return <Spinner label="Đang tải câu hỏi…" />
  if (error != null || !question) {
    return (
      <PageShell>
        <ErrorNote>{userMessage(error)}</ErrorNote>
      </PageShell>
    )
  }
  // Keyed on the question so switching questions rebuilds the draft rather
  // than editing question 16 into question 15's form state.
  return <Editor key={question.id} examId={examId} question={question} />
}

function Editor({ examId, question }: { examId: string; question: AdminQuestion }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { draft, set, setChoice, setCorrect, request, answerKeyChanged } =
    useQuestionDraft(question)

  const [saveError, setSaveError] = useState<unknown>(null)
  const [locked, setLocked] = useState<AnswerLockedProblem | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setSaveError(null)
    setLocked(null)
    setSaved(false)
    try {
      await saveAdminQuestion(question.id, request)
      await queryClient.invalidateQueries({ queryKey: getGetAdminQuestionQueryKey(question.id) })
      await queryClient.invalidateQueries({ queryKey: getListAdminQuestionsQueryKey(examId) })
      setSaved(true)
    } catch (err) {
      // The one refusal a save can meet. Everything else is an ordinary error.
      if (isProblem(err) && err.status === 409) {
        setLocked(err.problem as AnswerLockedProblem)
      } else {
        setSaveError(err)
      }
    } finally {
      setBusy(false)
    }
  }

  async function onCreateVersion() {
    setBusy(true)
    try {
      const next = await createQuestionVersion(question.id)
      await queryClient.invalidateQueries({ queryKey: getListAdminQuestionsQueryKey(examId) })
      await navigate({
        to: '/exams/$examId/questions/$questionId',
        params: { examId, questionId: next.id },
      })
    } catch (err) {
      setSaveError(err)
    } finally {
      setBusy(false)
    }
  }

  const number = question.displayOrdinal ?? question.ordinal

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            <Link to="/exams/$examId" params={{ examId }} className="hover:underline">
              ← Về đề
            </Link>
            {question.sectionKind && ` · phần ${SECTION_LABEL[question.sectionKind]}`}
          </p>
          <PageTitle>Câu {number}</PageTitle>
        </div>
        {/* An author needs to know before they touch the radio, not after the
            save comes back 409 (TCCN-301-9 is the other half: zero here means
            no notice at all, because that is the normal case). */}
        {question.attemptedCount > 0 && (
          <Badge tone="warn">đã có {question.attemptedCount} lượt làm — khoá đáp án</Badge>
        )}
      </div>

      <form className="mt-6 flex flex-col gap-8" onSubmit={onSave}>
        {/* TCCN-301-1: Korean and Vietnamese side by side, on one screen. A
            translation authored on a second screen is a translation authored
            without the sentence it translates in view. */}
        <section aria-labelledby="stem-heading">
          <SectionHeading id="stem-heading">Đề bài</SectionHeading>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Textarea
              id="stem-ko"
              label="Đề bài (tiếng Hàn)"
              korean
              value={draft.stemKo}
              onChange={(e) => set('stemKo', e.target.value)}
            />
            <Textarea
              id="stem-vi"
              label="Bản dịch đề bài (tiếng Việt)"
              value={draft.stemVi}
              onChange={(e) => set('stemVi', e.target.value)}
            />
          </div>
        </section>

        <section aria-labelledby="choices-heading">
          <SectionHeading id="choices-heading">Lựa chọn</SectionHeading>
          <div className="mt-3">
            <ChoiceEditor
              choices={draft.choices}
              onChange={setChoice}
              onSetCorrect={setCorrect}
              answerLocked={false}
            />
          </div>
        </section>

        {/* Layer 2 is authored for every question, not only ones a learner is
            likely to miss: right by elimination is a wrong answer that has not
            happened yet (R-07, YC-112). */}
        <section aria-labelledby="layer2-heading">
          <SectionHeading id="layer2-heading">Tầng 2 — vì sao đáp án đúng là đúng</SectionHeading>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Textarea
              id="layer2-ko"
              label="Tầng 2 (tiếng Hàn)"
              value={draft.explanationCorrectKo}
              onChange={(e) => set('explanationCorrectKo', e.target.value)}
            />
            <Textarea
              id="layer2-vi"
              label="Tầng 2 (tiếng Việt)"
              value={draft.explanationCorrectVi}
              onChange={(e) => set('explanationCorrectVi', e.target.value)}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Để trống thì tầng này <strong>vắng mặt</strong> ở màn Xem lại đáp án — không hiện
            tiêu đề rỗng, không hiện chữ “chưa có”.
          </p>
        </section>

        <section aria-labelledby="evidence-heading">
          <SectionHeading id="evidence-heading">Tầng 4 — căn cứ</SectionHeading>
          <div className="mt-3">
            <EvidencePicker
              passageId={question.passageId}
              evidence={draft.evidence}
              onChange={(evidence) => set('evidence', evidence)}
            />
          </div>
        </section>

        <section aria-labelledby="topics-heading">
          <SectionHeading id="topics-heading">Tầng 5 — chủ điểm</SectionHeading>
          <div className="mt-3">
            <TopicPicker selected={draft.topics} onChange={(topics) => set('topics', topics)} />
          </div>
        </section>

        {/* Headed "Phân loại" rather than "Độ khó": the section landmark and
            the field label would otherwise be the same string, which makes
            "the difficulty control" ambiguous to a screen reader and to
            `getByLabelText`. */}
        <section aria-labelledby="difficulty-heading">
          <SectionHeading id="difficulty-heading">Phân loại</SectionHeading>
          <div className="mt-3">
            <DifficultySelect
              value={draft.difficultyManual}
              observed={question.difficultyObserved}
              onChange={(v) => set('difficultyManual', v)}
            />
          </div>
        </section>

        {locked && (
          <AnswerLockNotice
            attemptedCount={locked.attemptedCount ?? question.attemptedCount}
            questionOrdinal={locked.questionOrdinal ?? question.ordinal}
            onCreateVersion={() => void onCreateVersion()}
            busy={busy}
          />
        )}
        {saveError != null && <ErrorNote>{userMessage(saveError)}</ErrorNote>}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="submit" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu nháp'}
          </Button>
          {answerKeyChanged && question.attemptedCount > 0 && !locked && (
            <span className="text-sm text-warn">
              Bạn vừa đổi đáp án đúng của một câu đã có người làm — lưu sẽ bị từ chối.
            </span>
          )}
          {saved && (
            <span role="status" className="text-sm text-correct">
              Đã lưu.
            </span>
          )}
        </div>
      </form>
    </PageShell>
  )
}
