import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/harness'

/** Opens the publish dialog on the seed draft, which has both kinds of problem. */
async function openPublish(examId = 'e-83') {
  const user = userEvent.setup()
  renderRoute(`/exams/${examId}`)
  await user.click(await screen.findByRole('button', { name: 'Xuất bản' }))
  return { user, dialog: await screen.findByRole('dialog') }
}

describe('YC-301: cổng xuất bản', () => {
  // TCCN-301-7 (drafted): two groups, not one list. `bank.Publish` returns
  // blockers and warnings separately and the screen keeps them separate.
  // Merging them into one friendly "problems" list reads better and destroys
  // the reason both exist — a blocker refuses, a warning is a judgement call.
  it('TCCN-301-7: lỗi chặn và cảnh báo hiện thành hai nhóm riêng', async () => {
    const { dialog } = await openPublish()

    const blockers = within(dialog).getByRole('heading', { name: /^Lỗi chặn/ })
    const warnings = within(dialog).getByRole('heading', { name: /^Cảnh báo/ })
    expect(blockers).toBeInTheDocument()
    expect(warnings).toBeInTheDocument()

    // Each group owns its own list — a single list under one heading would
    // satisfy "both words appear on screen" while failing the criterion.
    const blockerSection = blockers.closest('section')!
    const warningSection = warnings.closest('section')!
    expect(blockerSection).not.toBe(warningSection)
    expect(within(blockerSection).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(within(warningSection).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  // TCCN-301-7 (drafted): a blocker refuses the publish.
  it('TCCN-301-7: còn lỗi chặn thì không xuất bản được', async () => {
    const { dialog } = await openPublish()

    // Labelled 'Vẫn xuất bản' here, because this exam also has warnings.
    expect(within(dialog).getByRole('button', { name: /xuất bản/i })).toBeDisabled()
    expect(within(dialog).getByText(/Còn lỗi chặn thì không xuất bản được/)).toBeInTheDocument()
  })

  // TCCN-301-10 (drafted): the shape rules are blocking, and the message names
  // the question. "3 câu hỏng" sends an author back through fifty questions to
  // find which three.
  it('TCCN-301-10: GĐ-4 là lỗi chặn, và chỉ đúng câu nào hỏng', async () => {
    const { dialog } = await openPublish()

    const blockerSection = within(dialog)
      .getByRole('heading', { name: /^Lỗi chặn/ })
      .closest('section')!
    // q-16 has three choices.
    expect(within(blockerSection).getByText(/Câu 16: có 3 lựa chọn, phải đúng 4/)).toBeInTheDocument()
  })

  // TCCN-303-3 (drafted): an unassigned difficulty is counted and reported,
  // and lands on the warning side of the line, never the blocking side.
  it('TCCN-303-3: câu chưa gắn độ khó là cảnh báo, không phải lỗi chặn', async () => {
    const { dialog } = await openPublish()

    const warningSection = within(dialog)
      .getByRole('heading', { name: /^Cảnh báo/ })
      .closest('section')!
    const blockerSection = within(dialog)
      .getByRole('heading', { name: /^Lỗi chặn/ })
      .closest('section')!

    expect(within(warningSection).getByText(/1 câu chưa gắn độ khó/)).toBeInTheDocument()
    expect(within(blockerSection).queryByText(/độ khó/)).not.toBeInTheDocument()
  })

  // TCCN-301-7 (drafted): warnings alone publish, after a confirmation step. A
  // warning nobody has to acknowledge is a warning nobody reads.
  it('TCCN-301-7: chỉ có cảnh báo thì xuất bản được, sau một bước xác nhận', async () => {
    // e-84 is published already but its gate reports only warnings, which is
    // the state this criterion describes.
    const { user, dialog } = await openPublish('e-84')

    expect(
      within(dialog).getByRole('heading', { name: 'Lỗi chặn (0)' }),
    ).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: 'Vẫn xuất bản' })
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(await within(dialog).findByText(/Đã xuất bản SEED-TOPIK-II-84/)).toBeInTheDocument()
  })

  it('chạy cổng ở chế độ chạy thử khi mở, không xuất bản gì', async () => {
    const { dialog } = await openPublish()
    // The exam is still a draft behind the dialog.
    expect(within(dialog).queryByText(/Đã xuất bản/)).not.toBeInTheDocument()
  })
})
