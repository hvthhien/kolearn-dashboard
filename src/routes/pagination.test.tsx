import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { renderRoute } from '../test/harness'

/**
 * Phân trang, on the three content lists.
 *
 * These lists grow without anybody deciding to grow them — every import adds
 * papers, sets and video — so the screen that showed all of them was going to
 * become a screen that renders a thousand rows to find one. What is worth
 * testing about a pager is not that two buttons exist:
 *
 *   - the window actually reaches the server, because a pager that renders a
 *     page-two label over page-one rows is the inert control this app keeps
 *     re-learning about;
 *   - the count is the size of the list and not of the page, because that is
 *     the only thing that can say whether there is a next page at all;
 *   - a new question starts at page one, or a filter comes back empty for a
 *     reason nobody can see;
 *   - and a page that stops existing under somebody does not leave them
 *     looking at "chưa có" with a dead Trang sau.
 */

/**
 * Serves `total` synthetic rows from one endpoint, honouring the window it is
 * asked for, and records those windows so a test can assert on what was sent
 * rather than only on what was rendered.
 */
function paged<T>(path: string, row: (n: number) => T, total: () => number) {
  const windows: string[] = []
  server.use(
    http.get(path, ({ request }) => {
      const params = new URL(request.url).searchParams
      windows.push(`${params.get('limit')}/${params.get('offset')}`)
      const limit = Number(params.get('limit') ?? '20')
      const offset = Number(params.get('offset') ?? '0')
      const all = Array.from({ length: total() }, (_, i) => row(i + 1))
      return HttpResponse.json({ items: all.slice(offset, offset + limit), totalCount: all.length })
    }),
  )
  return windows
}

const exam = (n: number) => ({
  id: `e-${n}`,
  code: `PAGE-${String(n).padStart(3, '0')}`,
  title: `Đề số ${n}`,
  level: 'TOPIK_II',
  status: 'DRAFT',
  origin: 'OFFICIAL',
  blueprintVersion: '2024.1',
  year: 2024,
  questionCount: 50,
  examReady: true,
  missingSections: [],
  premium: false,
})

const review = { total: 2, approved: 2, rejected: 0, unreviewed: 0 }

const set = (n: number) => ({
  id: `s-${n}`,
  title: `Bộ số ${n}`,
  level: 3,
  voice: 'Nữ',
  voiceKind: 'HUMAN',
  status: 'DRAFT',
  publishedAt: '',
  review,
  premium: false,
  categoryId: '',
  categoryName: '',
  tags: [],
})

const video = (n: number) => ({
  id: `v-${n}`,
  title: `Ngữ liệu số ${n}`,
  level: 3,
  status: 'DRAFT',
  publishedAt: '',
  durationMs: 21000,
  lineCount: 2,
  wordCount: 0,
  review,
  premium: false,
  categoryId: '',
  categoryName: '',
  tags: [],
})

describe('phân trang ngân hàng đề', () => {
  it('mở ở trang một, hai mươi dòng, và nói rõ tổng số', async () => {
    paged('/api/v1/admin/exams', exam, () => 45)
    renderRoute('/exams')

    await screen.findByRole('link', { name: 'PAGE-001' })
    expect(screen.getAllByRole('row')).toHaveLength(21) // 20 + header
    expect(screen.getByText('1–20 trong 45 đề')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled()
  })

  it('Trang sau xin đúng cửa sổ tiếp theo và đổi hẳn các dòng', async () => {
    const windows = paged('/api/v1/admin/exams', exam, () => 45)
    const user = userEvent.setup()
    renderRoute('/exams')
    await screen.findByRole('link', { name: 'PAGE-001' })

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    expect(await screen.findByRole('link', { name: 'PAGE-021' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'PAGE-001' })).not.toBeInTheDocument()
    expect(screen.getByText('21–40 trong 45 đề')).toBeInTheDocument()
    expect(windows).toContain('20/20')
  })

  it('trang cuối ngắn hơn, và Trang sau chết ở đó', async () => {
    const user = userEvent.setup()
    paged('/api/v1/admin/exams', exam, () => 45)
    renderRoute('/exams')
    await screen.findByRole('link', { name: 'PAGE-001' })

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await screen.findByRole('link', { name: 'PAGE-021' })
    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await screen.findByRole('link', { name: 'PAGE-041' })
    expect(screen.getByText('41–45 trong 45 đề')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(6) // 5 + header
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled()
  })

  it('đổi bộ lọc thì về trang một', async () => {
    const windows = paged('/api/v1/admin/exams', exam, () => 45)
    const user = userEvent.setup()
    renderRoute('/exams')
    await screen.findByRole('link', { name: 'PAGE-001' })

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await screen.findByRole('link', { name: 'PAGE-021' })
    windows.length = 0

    await user.click(screen.getByRole('button', { name: 'Đã xuất bản' }))

    await waitFor(() => expect(windows).toContain('20/0'))
    expect(await screen.findByRole('link', { name: 'PAGE-001' })).toBeInTheDocument()
  })

  // The list one row deep is where an off-by-one in the count line shows.
  it('một dòng vẫn nói đúng phạm vi, cả hai nút đều chết', async () => {
    paged('/api/v1/admin/exams', exam, () => 1)
    renderRoute('/exams')

    await screen.findByRole('link', { name: 'PAGE-001' })
    expect(screen.getByText('1–1 trong 1 đề')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
  })
})

describe('phân trang hai xưởng', () => {
  it('chép chính tả: trang sau đổi dòng và tổng số là cả kệ', async () => {
    paged('/api/v1/admin/dictation/sets', set, () => 25)
    const user = userEvent.setup()
    renderRoute('/dictation')
    await screen.findByRole('link', { name: 'Bộ số 1' })

    expect(screen.getByText('1–20 trong 25 bộ')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    expect(await screen.findByRole('link', { name: 'Bộ số 21' })).toBeInTheDocument()
    expect(screen.getByText('21–25 trong 25 bộ')).toBeInTheDocument()
    // The CLI empty state belongs to a shelf with nothing on it, not to a page.
    expect(screen.queryByText('Chưa có bộ nào.')).not.toBeInTheDocument()
  })

  it('nhại theo: trang sau đổi dòng và tổng số là cả ngân hàng', async () => {
    paged('/api/v1/admin/shadowing/videos', video, () => 25)
    const user = userEvent.setup()
    renderRoute('/videos')
    await screen.findByRole('link', { name: 'Ngữ liệu số 1' })

    expect(screen.getByText('1–20 trong 25 ngữ liệu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    expect(await screen.findByRole('link', { name: 'Ngữ liệu số 21' })).toBeInTheDocument()
    expect(screen.getByText('21–25 trong 25 ngữ liệu')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có ngữ liệu nào')).not.toBeInTheDocument()
  })

  // Removing the last row of the last page. The screen must not settle on an
  // empty page with "chưa có" and a dead Trang sau — it steps back to the last
  // page the list still has.
  it('trang cuối rỗng đi thì lùi lại trang trước đó', async () => {
    let total = 21
    paged('/api/v1/admin/shadowing/videos', video, () => total)
    const user = userEvent.setup()
    renderRoute('/videos')
    await screen.findByRole('link', { name: 'Ngữ liệu số 1' })

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    expect(await screen.findByRole('link', { name: 'Ngữ liệu số 21' })).toBeInTheDocument()

    // The twenty-first video is removed by somebody, and the refetch lands on
    // a page that no longer exists.
    total = 20
    await user.click(screen.getByRole('button', { name: 'Trang trước' }))
    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() => {
      expect(screen.getByText('1–20 trong 20 ngữ liệu')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
    expect(screen.queryByText('Chưa có ngữ liệu nào')).not.toBeInTheDocument()
  })
})

describe('người dùng dùng chung một cái pager', () => {
  // The pager on /users predates the other three and was inline markup; it is
  // the same component now, so this is the check that the extraction did not
  // change what that screen says.
  it('vẫn nói đúng phạm vi sau khi rút ra dùng chung', async () => {
    renderRoute('/users')
    await screen.findByText('lan@example.com')

    const rows = screen.getAllByRole('row').length - 1
    expect(screen.getByText(`1–${rows} trong ${rows} tài khoản`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
  })
})
