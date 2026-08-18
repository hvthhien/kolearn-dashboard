import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { renderRoute } from '../test/harness'
import { EXAMS } from '../mocks/fixtures/bank'

async function openExam(id = 'e-83') {
  renderRoute(`/exams/${id}`)
  return within(await screen.findByRole('region', { name: 'Cấu trúc đề' }))
}

describe('YC-302: cấu trúc đề đọc từ cấu hình', () => {
  // TCCN-302-1 (drafted): every number comes from the blueprint the paper was
  // cut from, never from a constant in the screen. GĐ-1 warns the TOPIK format
  // changes between years and has to be checked against the official
  // publication — which only works if a format change is a new version of a
  // config row rather than an edit to a component.
  it('TCCN-302-1: số câu, thời gian và điểm lấy từ cấu hình, không viết cứng', async () => {
    // Serve a paper whose structure differs from R-16's published numbers. A
    // screen holding constants renders 50/60/100 regardless and passes every
    // test written against the real blueprint; this one cannot.
    const altered = structuredClone(EXAMS[0]!)
    altered.sections = altered.sections.map((s) =>
      s.kind === 'LISTENING'
        ? { ...s, questionCount: 44, timeLimitSeconds: 2700, maxScore: 90 }
        : s,
    )
    altered.blueprintVersion = '2027-thử-nghiệm'
    server.use(http.get('/api/v1/admin/exams/:id', () => HttpResponse.json(altered)))

    const panel = await openExam()
    const listening = (await panel.findByText('Nghe')).closest('tr')!
    expect(within(listening).getByText('44')).toBeInTheDocument()
    expect(within(listening).getByText('45 phút')).toBeInTheDocument()
    expect(within(listening).getByText('90')).toBeInTheDocument()
  })

  // TCCN-302-1 (drafted): "cấu hình có phiên bản; sửa cấu hình không làm đổi
  // cấu trúc của đề đã tạo". The version is on screen because an author
  // looking at two papers cut from different versions has no other way to tell.
  it('TCCN-302-1: phiên bản cấu hình hiện cùng đề', async () => {
    const panel = await openExam()
    expect(panel.getByText('2024')).toBeInTheDocument()
  })

  // TCCN-302-2 (drafted): TOPIK II is three sections totalling 300, each
  // scaled to 100 (R-05).
  it('TCCN-302-2: TOPIK II gồm đủ ba phần, tổng 300 điểm, mỗi phần thang 100', async () => {
    const panel = await openExam()

    for (const name of ['Nghe', 'Viết', 'Đọc']) {
      expect(panel.getByText(name)).toBeInTheDocument()
    }
    expect(panel.getByText(/tổng/)).toHaveTextContent('300')
  })

  // TCCN-302-3 (drafted): the two sittings are shown apart, and each section
  // keeps its own clock. One timer over all 300 points would be a different
  // exam from the one being sat.
  it('TCCN-302-3: hai buổi thi tách nhau, mỗi phần một đồng hồ riêng', async () => {
    const panel = await openExam()

    expect(panel.getByText('Buổi 1')).toBeInTheDocument()
    expect(panel.getByText('Buổi 2')).toBeInTheDocument()

    // Nghe and Viết in sitting 1, Đọc in sitting 2 — grouped, not merely labelled.
    const sittingTwo = panel.getByRole('table', { name: /buổi 2/i })
    expect(within(sittingTwo).getByText('Đọc')).toBeInTheDocument()
    expect(within(sittingTwo).queryByText('Nghe')).not.toBeInTheDocument()

    // R-16's per-section limits, not one figure for the paper.
    expect(panel.getByText('60 phút')).toBeInTheDocument()
    expect(panel.getByText('50 phút')).toBeInTheDocument()
    expect(panel.getByText('70 phút')).toBeInTheDocument()
  })

  // TCCN-302-4 (drafted): a paper missing a section is usable for Luyện tập
  // and marked as unusable for Thi thử.
  it('TCCN-302-4: đề thiếu phần được đánh dấu rõ là không dùng cho Thi thử', async () => {
    const panel = await openExam('e-84')

    // `getByText` lands on the <strong>; the sentence around it is the notice.
    const notice = panel.getByText(/không dùng cho Thi thử/i).closest('p')!
    expect(notice).toBeInTheDocument()
    expect(notice).toHaveTextContent('Viết')
    expect(notice).toHaveTextContent(/Xuất bản được để Luyện tập/)
    expect(notice).toHaveTextContent(/không quy đổi cấp độ/)
  })
})
