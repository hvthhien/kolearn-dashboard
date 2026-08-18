import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { QUESTIONS, READING_PASSAGE } from '../../mocks/fixtures/bank'
import { renderRoute } from '../../test/harness'

const READING_Q = '/exams/e-83/questions/q-15'
const LISTENING_Q = '/exams/e-83/questions/q-3'

/** The layer-4 section of whichever question is on screen. */
async function evidenceRegion() {
  const heading = await screen.findByText('Tầng 4 — căn cứ')
  return within(heading.closest('section')!)
}

describe('YC-301: tầng 4 — căn cứ chỉ đúng vào ngữ liệu', () => {
  // TCCN-301-4 (drafted): a reading span is character offsets *into that
  // passage*, stored alongside the text they pointed at.
  it('TCCN-301-4: căn cứ phần Đọc lưu vị trí ký tự đầu và cuối trong đoạn văn', async () => {
    renderRoute(READING_Q)
    const region = await evidenceRegion()

    expect(await region.findByText(/ký tự 45–57/)).toBeInTheDocument()
    expect(region.getByText('저는 걸어서 다녔습니다')).toBeInTheDocument()
  })

  // TCCN-301-4 (drafted): "với câu Nghe, lưu mốc thời gian bắt đầu và kết thúc
  // trong tệp tiếng". A millisecond range, not a character range — different
  // columns, and a screen offering only one cannot author half the paper.
  it('TCCN-301-4: căn cứ phần Nghe lưu mốc thời gian trong tệp tiếng', async () => {
    renderRoute(LISTENING_Q)
    const region = await evidenceRegion()

    expect(await region.findByLabelText('Bắt đầu (ms)')).toHaveValue(12400)
    expect(region.getByLabelText('Kết thúc (ms)')).toHaveValue(18900)
    expect(region.getByText(/12400 – 18900 ms/)).toBeInTheDocument()
  })

  // TCCN-301-4 (drafted): the load-bearing half. "Sửa đoạn văn sau đó làm lệch
  // một căn cứ đã lưu thì báo trước khi lưu, không âm thầm để nó trỏ sang chỗ
  // khác." Without this the highlight lands on the wrong sentence on the
  // learner's review screen and nothing reports an error, which is what makes
  // it worth a criterion rather than a bug report.
  it('TCCN-301-4: đoạn văn đã sửa làm lệch căn cứ thì báo trước khi lưu', async () => {
    // The same passage with characters inserted at the front, so the stored
    // offsets now point somewhere else.
    server.use(
      http.get('/api/v1/admin/passages/:id', () =>
        HttpResponse.json({
          ...READING_PASSAGE,
          textKo: `그리고 또한. ${READING_PASSAGE.textKo}`,
        }),
      ),
    )

    renderRoute(READING_Q)
    const region = await evidenceRegion()

    const warning = await region.findByText(/Đoạn văn đã đổi từ lúc lưu căn cứ này/)
    expect(warning).toHaveTextContent('저는 걸어서 다녔습니다')
    expect(warning).toHaveTextContent(/Bôi đen lại trước khi lưu/)
  })

  it('TCCN-301-4: đoạn văn không đổi thì không cảnh báo gì', async () => {
    renderRoute(READING_Q)
    const region = await evidenceRegion()
    await region.findByText(/ký tự 45–57/)

    expect(region.queryByText(/Đoạn văn đã đổi/)).not.toBeInTheDocument()
  })

  // The boundary this screen has to get right (TCCN-114-3): a question with no
  // stimulus has no layer 4, and that is not an error state.
  it('câu không có ngữ liệu thì không có tầng 4, và đó không phải lỗi', async () => {
    const stripped = { ...structuredClone(QUESTIONS[1]!), passageId: null, evidence: [] }
    server.use(http.get('/api/v1/admin/questions/:id', () => HttpResponse.json(stripped)))

    renderRoute(READING_Q)
    const region = await evidenceRegion()

    expect(
      await region.findByText(/Câu này không kèm ngữ liệu nào, nên không có tầng 4/),
    ).toBeInTheDocument()
    expect(region.queryByRole('alert')).not.toBeInTheDocument()
  })
})
