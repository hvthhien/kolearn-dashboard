import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockQuestion } from '../../mocks/handlers'
import { renderRoute } from '../../test/harness'

const Q16 = '/exams/e-83/questions/q-16' // no topics yet

async function topicRegion() {
  const heading = await screen.findByText('Tầng 5 — chủ điểm')
  return within(heading.closest('section')!)
}

describe('YC-301: tầng 5 — chủ điểm lấy từ danh mục', () => {
  // TCCN-301-5 (drafted): typing produces suggestions from the normalised
  // catalogue. The reason is R-06: the weakness table counts wrong answers by
  // topic, so two spellings of one topic split "sai 8 trên 11 lần gặp" into
  // two rows and both are wrong. This input is the cheapest place in the whole
  // system to stop that — one field, one time, before the row exists.
  it('TCCN-301-5: gõ một phần tên thì gợi ý từ danh mục đã chuẩn hoá', async () => {
    const user = userEvent.setup()
    renderRoute(Q16)
    const region = await topicRegion()

    await user.type(region.getByRole('combobox'), 'thời gian')

    expect(await region.findByRole('button', { name: /từ chỉ thời gian/ })).toBeInTheDocument()
    // And nothing unrelated came back with it.
    expect(region.queryByRole('button', { name: /nghe lấy ý chính/ })).not.toBeInTheDocument()
  })

  // TCCN-301-5 (drafted): "không tạo được chủ điểm mới chỉ bằng cách gõ một
  // chuỗi chưa có trong danh mục". There is deliberately no "create «what you
  // typed»" affordance — widening the catalogue is `topic:manage`, a decision
  // about the taxonomy rather than a step in tagging one question.
  it('TCCN-301-5: gõ một tên chưa có trong danh mục không tạo được chủ điểm mới', async () => {
    const user = userEvent.setup()
    renderRoute(Q16)
    const region = await topicRegion()

    await user.type(region.getByRole('combobox'), 'chủ điểm hoàn toàn mới')

    expect(
      await region.findByText(/Không có chủ điểm nào khớp “chủ điểm hoàn toàn mới”/),
    ).toBeInTheDocument()
    // No route to create one from here — not a button, not a submit.
    expect(region.queryByRole('button', { name: /tạo|thêm mới/i })).not.toBeInTheDocument()
  })

  it('TCCN-301-5: chọn một gợi ý thì gắn chủ điểm đó cho câu hỏi', async () => {
    const user = userEvent.setup()
    renderRoute(Q16)
    const region = await topicRegion()

    await user.type(region.getByRole('combobox'), 'thời gian')
    await user.click(await region.findByRole('button', { name: /từ chỉ thời gian/ }))

    expect(region.getByRole('button', { name: 'Bỏ chủ điểm từ chỉ thời gian' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    await screen.findByText('Đã lưu.')

    expect(mockQuestion('q-16')?.topics.map((t) => t.name)).toEqual(['từ chỉ thời gian'])
  })

  it('xếp chủ điểm đã chuẩn hoá lên trước chủ điểm tự thêm', async () => {
    const user = userEvent.setup()
    renderRoute(Q16)
    const region = await topicRegion()

    await user.type(region.getByRole('combobox'), 'đ')
    const suggestions = await region.findAllByRole('button', { name: /—/ })
    const labels = suggestions.map((b) => b.textContent ?? '')

    const firstCurated = labels.findIndex((l) => !l.includes('(tự thêm)'))
    const firstOwn = labels.findIndex((l) => l.includes('(tự thêm)'))
    expect(firstCurated).toBeLessThan(firstOwn === -1 ? Infinity : firstOwn)
  })
})
