import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useListAdminExams } from '../api/gen/kolearn'
import type { ExamStatus } from '../api/gen/model'
import { userMessage } from '../lib/problem'
import { SECTION_LABEL } from '../features/exam/sectionLabels'
import {
  Badge,
  EmptyState,
  ErrorNote,
  FilterChips,
  PageShell,
  PageTitle,
  Refreshing,
  SkeletonList,
  Table,
  Td,
  Th,
} from '../components/ui'

type StatusFilter = ExamStatus | 'ALL'

const STATUS_LABEL: Record<ExamStatus, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã xuất bản',
  RETIRED: 'Đã gỡ',
}

/**
 * The bank, drafts included — the learner's `/exams` shows only what has been
 * published, and the drafts are the work.
 */
export function ExamListPage() {
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const { data, error, isPending, isFetching } = useListAdminExams(
    status === 'ALL' ? undefined : { status },
  )

  const items = data?.items ?? []

  return (
    <PageShell>
      <PageTitle>Ngân hàng đề</PageTitle>

      <FilterChips<StatusFilter>
        className="mt-4"
        label="Lọc theo trạng thái"
        value={status}
        onChange={setStatus}
        choices={[
          { value: 'ALL', label: 'Tất cả' },
          { value: 'DRAFT', label: STATUS_LABEL.DRAFT },
          { value: 'PUBLISHED', label: STATUS_LABEL.PUBLISHED },
          { value: 'RETIRED', label: STATUS_LABEL.RETIRED },
        ]}
      />

      <div className="mt-4">
        {error != null && <ErrorNote>{userMessage(error)}</ErrorNote>}

        {isPending ? (
          <SkeletonList rows={3} label="Đang tải danh sách đề…" />
        ) : items.length === 0 ? (
          /* R-13: an empty list is its own state with something to do next,
             never a table of zeroes and never the error screen. */
          <EmptyState
            title="Chưa có đề nào ở trạng thái này"
            action={
              <Link to="/imports" className="font-semibold text-brand">
                Nhập lô đề mới
              </Link>
            }
          >
            Đổi bộ lọc, hoặc nhập một bộ đề vào ngân hàng.
          </EmptyState>
        ) : (
          <Refreshing busy={isFetching}>
            <Table
              caption="Danh sách đề trong ngân hàng"
              head={
                <tr>
                  <Th>Mã đề</Th>
                  <Th>Tên</Th>
                  <Th>Bậc</Th>
                  <Th>Cấu hình</Th>
                  <Th className="text-right">Số câu</Th>
                  <Th>Trạng thái</Th>
                </tr>
              }
            >
              {items.map((exam) => (
                <tr key={exam.id}>
                  <Td className="font-mono text-xs">
                    <Link
                      to="/exams/$examId"
                      params={{ examId: exam.id }}
                      className="font-semibold text-brand-800 underline-offset-2 hover:underline"
                    >
                      {exam.code}
                    </Link>
                  </Td>
                  <Td>
                    {exam.title}
                    {/* TCCN-302-4: said here, in the list, before anyone opens
                        the paper — not after a learner has started it. */}
                    {!exam.examReady && (
                      <p className="mt-1 text-xs text-warn">
                        Không dùng cho Thi thử — thiếu phần{' '}
                        {(exam.missingSections ?? []).map((s) => SECTION_LABEL[s]).join(', ')}.
                        Chỉ dùng để Luyện tập.
                      </p>
                    )}
                  </Td>
                  <Td>{exam.level === 'TOPIK_I' ? 'TOPIK I' : 'TOPIK II'}</Td>
                  <Td className="font-mono text-xs text-muted">{exam.blueprintVersion}</Td>
                  <Td className="text-right tabular-nums">{exam.questionCount}</Td>
                  <Td>
                    <Badge tone={exam.status === 'PUBLISHED' ? 'ok' : 'neutral'}>
                      {STATUS_LABEL[exam.status]}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          </Refreshing>
        )}
      </div>
    </PageShell>
  )
}
