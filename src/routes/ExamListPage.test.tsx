import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { renderRoute } from '../test/harness'

async function rowFor(code: string) {
  const cell = await screen.findByRole('link', { name: code })
  return within(cell.closest('tr')!)
}

describe('YC-302: danh sách đề', () => {
  // TCCN-302-4 (drafted): "danh sách đề nói rõ điều đó **trước khi** người học
  // chọn, không phải sau khi họ bắt đầu". The exam detail screen says it too,
  // but by then the choice is made — this is the criterion's actual location.
  it('TCCN-302-4: đề thiếu phần được đánh dấu ngay trong danh sách', async () => {
    renderRoute('/exams')
    const row = await rowFor('SEED-TOPIK-II-84')

    const notice = row.getByText(/Không dùng cho Thi thử/)
    expect(notice).toHaveTextContent('thiếu phần Viết')
    expect(notice).toHaveTextContent(/Chỉ dùng để Luyện tập/)
  })

  it('TCCN-302-4: đề đủ phần không mang cảnh báo nào', async () => {
    renderRoute('/exams')
    const row = await rowFor('SEED-TOPIK-II-83')

    expect(row.queryByText(/Không dùng cho Thi thử/)).not.toBeInTheDocument()
  })

  it('hiện cả bản nháp — đây là ngân hàng đề, không phải danh sách của người học', async () => {
    renderRoute('/exams')
    const row = await rowFor('SEED-TOPIK-II-83')

    expect(row.getByText('Bản nháp')).toBeInTheDocument()
  })

  it('lọc theo trạng thái', async () => {
    const user = userEvent.setup()
    renderRoute('/exams')
    await rowFor('SEED-TOPIK-II-83')

    await user.click(screen.getByRole('button', { name: 'Đã xuất bản' }))

    expect(await screen.findByRole('link', { name: 'SEED-TOPIK-II-84' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'SEED-TOPIK-II-83' })).not.toBeInTheDocument()
  })

  // R-13: an empty list is its own state with something to do next — never a
  // table of zeroes, and never the error screen.
  it('R-13: danh sách rỗng có trạng thái riêng kèm một hành động', async () => {
    server.use(http.get('/api/v1/admin/exams', () => HttpResponse.json({ items: [] })))
    renderRoute('/exams')

    expect(await screen.findByText('Chưa có đề nào ở trạng thái này')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nhập lô đề mới' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
