import type { AdminExamDetail } from '../../api/gen/model'
import { Badge, SectionHeading, Table, Td, Th } from '../../components/ui'
import { SECTION_LABEL, minutes } from './sectionLabels'

/**
 * R-16's exam structure, read from the blueprint the paper was cut from.
 *
 * Every number on this panel comes from `exam.sections`, which the server
 * copied out of `exam_blueprints` when the paper was created. Nothing here is
 * a constant, and that is the criterion rather than a style preference: GĐ-1
 * warns the TOPIK format changes between years and has to be checked against
 * the official publication, so a format change must be a new blueprint version
 * — leaving papers already sat scoring against the version they were sat under
 * (TCCN-302-1).
 *
 * The sittings are shown as separate groups because they *are* separate
 * sittings: TOPIK II is two sessions with a gap between them, each section on
 * its own clock. One timer over all 300 points would be a different exam
 * (TCCN-302-3).
 */
export function BlueprintPanel({ exam }: { exam: AdminExamDetail }) {
  const sittings = [...new Set(exam.sections.map((s) => s.sitting))].sort()
  const total = exam.sections.reduce((sum, s) => sum + s.maxScore, 0)

  return (
    <section aria-labelledby="blueprint-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading id="blueprint-heading">Cấu trúc đề</SectionHeading>
        <p className="text-xs text-muted">
          Theo cấu hình <span className="font-mono">{exam.blueprintVersion}</span> · tổng{' '}
          <span className="tabular-nums">{total}</span> điểm
        </p>
      </div>

      {/* R-05: a Thi thử of TOPIK II is all three sections or it is not a Thi
          thử, and a paper missing one cannot yield a band at all. */}
      {!exam.examReady && (
        <p className="mt-2 rounded-xl bg-warn-soft px-4 py-3 text-sm text-ink">
          Đề này <strong>không dùng cho Thi thử</strong>: phần{' '}
          {(exam.missingSections ?? []).map((s) => SECTION_LABEL[s]).join(', ')} chưa có câu nào.
          Xuất bản được để Luyện tập, và không quy đổi cấp độ.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-4">
        {sittings.map((sitting) => (
          <div key={sitting}>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
              Buổi {sitting}
            </p>
            <Table
              caption={`Các phần thi thuộc buổi ${sitting}`}
              head={
                <tr>
                  <Th>Phần</Th>
                  <Th className="text-right">Số câu</Th>
                  <Th className="text-right">Đã soạn</Th>
                  <Th className="text-right">Thời gian</Th>
                  <Th className="text-right">Điểm</Th>
                </tr>
              }
            >
              {exam.sections
                .filter((s) => s.sitting === sitting)
                .sort((a, b) => a.ordinal - b.ordinal)
                .map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium">{SECTION_LABEL[s.kind]}</Td>
                    <Td className="text-right tabular-nums">{s.questionCount}</Td>
                    <Td className="text-right tabular-nums">
                      {s.authoredCount === 0 ? (
                        <Badge tone="warn">chưa có câu nào</Badge>
                      ) : (
                        s.authoredCount
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{minutes(s.timeLimitSeconds)}</Td>
                    <Td className="text-right tabular-nums">{s.maxScore}</Td>
                  </tr>
                ))}
            </Table>
          </div>
        ))}
      </div>
    </section>
  )
}
