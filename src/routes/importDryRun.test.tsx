import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { renderRoute } from '../test/harness'

const BUNDLE = JSON.stringify({ exam: { code: 'TOPIK-II-102' }, questions: [] })

async function pasteBundle() {
  const user = userEvent.setup()
  renderRoute('/imports')
  const box = await screen.findByLabelText('Hoặc dán nội dung bundle')
  // `paste` rather than `type`: a 50-question bundle typed one keystroke at a
  // time is a minute of test time for no additional coverage.
  await user.click(box)
  await user.paste(BUNDLE)
  return user
}

describe('YC-301: nhập lô có bước chạy thử', () => {
  // TCCN-301-6 (drafted): the dry run reports what the run would write.
  //
  // Passages, questions, choices and new topics rather than
  // created/updated/skipped: an import whose exam code already exists is
  // refused outright rather than merged, so there is no diff to describe and a
  // three-number summary would be describing a merge that never happens.
  // "Chủ điểm mới" earns its place — a bundle inventing thirty topics has
  // probably spelled existing ones differently, which is what splits a weakness
  // row in two (R-06).
  it('TCCN-301-6: chạy thử báo sẽ ghi vào ngân hàng đề những gì', async () => {
    const user = await pasteBundle()
    await user.click(screen.getByRole('button', { name: 'Chạy thử' }))

    const report = within((await screen.findByText('Báo cáo chạy thử')).closest('section')!)
    expect(within(report.getByText('Câu hỏi').closest('div')!).getByText('50')).toBeInTheDocument()
    expect(within(report.getByText('Đoạn văn').closest('div')!).getByText('12')).toBeInTheDocument()
    expect(within(report.getByText('Lựa chọn').closest('div')!).getByText('200')).toBeInTheDocument()
    expect(within(report.getByText('Chủ điểm mới').closest('div')!).getByText('3')).toBeInTheDocument()
  })

  // TCCN-301-6 (drafted): "và lỗi ở dòng nào". The gate reports a path into the
  // bundle — `questions[14].choices` — rather than a line number, because it
  // validates the parsed bundle and by then the line it came from is gone. The
  // criterion's intent is that an author can find the broken question, which a
  // path does better than a line anyway.
  //
  // Every problem at once, not the first: fixing a thousand-question file one
  // error per run is not a workflow anyone follows; they hand-edit the database
  // instead, and the paper lands in the bank without passing the gate.
  it('TCCN-301-6: chạy thử chỉ ra lỗi ở đâu, và báo tất cả cùng lúc', async () => {
    const user = await pasteBundle()
    await user.click(screen.getByRole('button', { name: 'Chạy thử' }))

    const table = await screen.findByRole('table', { name: /lỗi trong tệp nhập/i })
    const rows = within(table).getAllByRole('row').slice(1) // drop the header
    expect(rows).toHaveLength(2)

    expect(within(rows[0]!).getByText('questions[14].choices')).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/Chỉ có 3 lựa chọn/)).toBeInTheDocument()
    expect(within(rows[1]!).getByText('questions[27].evidence')).toBeInTheDocument()
  })

  // TCCN-301-6 (drafted): "và không ghi gì vào ngân hàng đề".
  it('TCCN-301-6: chạy thử không ghi gì vào ngân hàng đề', async () => {
    const writes: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method !== 'GET') writes.push(`${request.method} ${new URL(request.url).pathname}`)
    })

    const user = await pasteBundle()
    await user.click(screen.getByRole('button', { name: 'Chạy thử' }))
    await screen.findByText('Báo cáo chạy thử')

    // The dry-run endpoint is the only write-shaped call made, and the
    // contract says it touches nothing.
    expect(writes.filter((w) => !w.includes('/auth/'))).toEqual([
      'POST /api/v1/admin/imports/dry-run',
    ])
    expect(screen.getByText(/Chưa ghi gì vào ngân hàng đề/)).toBeInTheDocument()
  })

  // TCCN-301-6 (drafted): "chạy thật ngay sau đó cho ra đúng những thay đổi đã
  // báo". A preview that does not predict the run is worse than no preview.
  it('TCCN-301-6: chạy thật cho ra đúng những thay đổi đã báo', async () => {
    // A clean bundle: the seed preview carries blocking issues, and the run
    // after one of those is refused rather than applied (the case below).
    const clean = {
      examCode: 'TOPIK-II-102',
      ok: true,
      passages: 12,
      questions: 50,
      choices: 200,
      topics: 34,
      topicsNew: 3,
      issues: [],
    }
    server.use(
      http.post('/api/v1/admin/imports/dry-run', () =>
        HttpResponse.json({ ...clean, dryRun: true }),
      ),
      http.post('/api/v1/admin/imports', () => HttpResponse.json({ ...clean, dryRun: false })),
    )

    const user = await pasteBundle()
    await user.click(screen.getByRole('button', { name: 'Chạy thử' }))
    await screen.findByText('Báo cáo chạy thử')

    await user.click(screen.getByRole('button', { name: 'Chạy thật' }))

    const report = within((await screen.findByText('Kết quả chạy thật')).closest('section')!)
    expect(within(report.getByText('Câu hỏi').closest('div')!).getByText('50')).toBeInTheDocument()
    expect(within(report.getByText('Đoạn văn').closest('div')!).getByText('12')).toBeInTheDocument()
    expect(within(report.getByText('Lựa chọn').closest('div')!).getByText('200')).toBeInTheDocument()
    expect(screen.queryByText(/Chưa ghi gì vào ngân hàng đề/)).not.toBeInTheDocument()
  })

  // The dry run is a step, not a suggestion: an import that turns out to
  // update two hundred questions the author thought were new is not undoable
  // by hand.
  it('TCCN-301-6: không chạy thật được trước khi đã chạy thử', async () => {
    const user = await pasteBundle()
    expect(screen.getByRole('button', { name: 'Chạy thật' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Chạy thử' }))
    await screen.findByText('Báo cáo chạy thử')
    // Still blocked here, because this bundle's dry run found blocking issues.
    expect(screen.getByRole('button', { name: 'Chạy thật' })).toBeDisabled()
  })
})
