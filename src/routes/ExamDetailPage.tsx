import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useGetAdminExam, useListAdminQuestions } from '../api/gen/kolearn'
import type { AdminQuestionRow, LayerStatus } from '../api/gen/model'
import { useAuth } from '../lib/auth'
import { userMessage } from '../lib/problem'
import { BlueprintPanel } from '../features/exam/BlueprintPanel'
import { PublishDialog } from '../features/exam/PublishDialog'
import { SECTION_LABEL } from '../features/exam/sectionLabels'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  PageShell,
  PageTitle,
  SectionHeading,
  SkeletonList,
  Spinner,
  Table,
  Td,
  Th,
} from '../components/ui'

/**
 * Which layers a question has, as four chips.
 *
 * "Chưa soạn" and "đã soạn" are different states and read differently; what
 * this must never do is show a layer as present-but-blank. The learner's
 * review screen hides an unwritten layer entirely (R-07 constraint 3), and
 * this table is where an author finds out which ones are still hidden.
 */
function LayerChips({ status }: { status: LayerStatus }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={status.layer2 ? 'ok' : 'neutral'}>T2</Badge>
      <Badge tone={status.layer3Written === status.layer3Required ? 'ok' : 'neutral'}>
        T3 {status.layer3Written}/{status.layer3Required}
      </Badge>
      <Badge tone={status.layer4 ? 'ok' : 'neutral'}>T4</Badge>
      <Badge tone={status.layer5 ? 'ok' : 'neutral'}>T5</Badge>
      {!status.translated && <Badge tone="warn">thiếu bản dịch</Badge>}
    </div>
  )
}

function shapeProblem(q: AdminQuestionRow): string | null {
  if (q.type !== 'MCQ') return null
  if (q.choiceCount !== 4) return `${q.choiceCount} lựa chọn`
  if (q.correctChoiceCount !== 1) return `${q.correctChoiceCount} đáp án đúng`
  return null
}

export function ExamDetailPage() {
  const { examId } = useParams({ from: '/exams/$examId' })
  const { user } = useAuth()
  const [publishing, setPublishing] = useState(false)

  const exam = useGetAdminExam(examId)
  const questions = useListAdminQuestions(examId)

  if (exam.isPending) return <Spinner label="Đang tải đề…" />
  if (exam.error != null || !exam.data) {
    return (
      <PageShell>
        <ErrorNote>{userMessage(exam.error)}</ErrorNote>
      </PageShell>
    )
  }

  const paper = exam.data
  const rows = questions.data?.items ?? []
  const canPublish = !!user?.permissions.includes('exam:publish')

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">{paper.code}</p>
          <PageTitle>{paper.title}</PageTitle>
          {paper.sourceName && (
            /* Recorded at import so a whole source stays withdrawable as a
               unit — "free to download" is not "licensed for a paid product". */
            <p className="mt-1 text-xs text-muted">Nguồn: {paper.sourceName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={paper.status === 'PUBLISHED' ? 'ok' : 'neutral'}>
            {paper.status === 'PUBLISHED' ? 'Đã xuất bản' : paper.status === 'DRAFT' ? 'Bản nháp' : 'Đã gỡ'}
          </Badge>
          {canPublish && (
            <Button onClick={() => setPublishing(true)}>Xuất bản</Button>
          )}
        </div>
      </div>

      <div className="mt-6">
        <BlueprintPanel exam={paper} />
      </div>

      <section className="mt-8" aria-labelledby="questions-heading">
        <SectionHeading id="questions-heading">Câu hỏi</SectionHeading>
        <div className="mt-3">
          {questions.error != null && <ErrorNote>{userMessage(questions.error)}</ErrorNote>}
          {questions.isPending ? (
            <SkeletonList rows={4} label="Đang tải câu hỏi…" />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Đề này chưa có câu nào"
              action={
                <Link to="/imports" className="font-semibold text-brand">
                  Nhập lô câu hỏi
                </Link>
              }
            >
              Soạn từng câu, hoặc nhập cả bộ từ một tệp.
            </EmptyState>
          ) : (
            <Table
              caption={`Câu hỏi của đề ${paper.code}`}
              head={
                <tr>
                  <Th className="text-right">Câu</Th>
                  <Th>Phần</Th>
                  <Th>Đề bài</Th>
                  <Th>Năm tầng</Th>
                  <Th className="text-right">Độ khó</Th>
                  <Th className="text-right">Lượt đã làm</Th>
                </tr>
              }
            >
              {rows.map((q) => {
                const problem = shapeProblem(q)
                return (
                  <tr key={q.id}>
                    <Td className="text-right tabular-nums">
                      <Link
                        to="/exams/$examId/questions/$questionId"
                        params={{ examId, questionId: q.id }}
                        className="font-semibold text-brand-800 underline-offset-2 hover:underline"
                      >
                        {q.displayOrdinal ?? q.ordinal}
                      </Link>
                    </Td>
                    <Td>{q.sectionKind ? SECTION_LABEL[q.sectionKind] : '—'}</Td>
                    <Td>
                      <span className="ko block max-w-md truncate">{q.stemKo}</span>
                      {problem && (
                        <span className="mt-1 inline-block text-xs text-wrong">
                          GĐ-4: {problem}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <LayerChips status={q.layerStatus} />
                    </Td>
                    <Td className="text-right tabular-nums">
                      {/* R-13's rule about invented numbers applies to a value
                          too: an unassigned difficulty is blank, not 0. */}
                      {q.difficultyManual ?? <span className="text-muted">—</span>}
                    </Td>
                    <Td className="text-right tabular-nums">{q.attemptedCount}</Td>
                  </tr>
                )
              })}
            </Table>
          )}
        </div>
      </section>

      {/* Mounted only while open: a dialog that keeps its report between
          openings would show the previous verdict for the frame before the
          new dry run lands. */}
      {publishing && <PublishDialog exam={paper} onClose={() => setPublishing(false)} />}
    </PageShell>
  )
}
