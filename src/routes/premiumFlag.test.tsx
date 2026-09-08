import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { MOCK_USER } from '../mocks/handlers'
import { renderRoute } from '../test/harness'

const BASE = '/api/v1'

/**
 * The account without `billing:manage` — every other permission intact.
 *
 * Overridden on `/auth/refresh` and not only on `/me`: the app starts every
 * session by rotating the cookie, and the user it renders comes from that
 * response.
 */
function asContentEditor() {
  const user = {
    ...MOCK_USER,
    roles: ['content_admin'],
    permissions: MOCK_USER.permissions.filter((p) => p !== 'billing:manage'),
  }
  server.use(
    http.post(`${BASE}/auth/refresh`, () =>
      HttpResponse.json({ accessToken: 'mock-access-token', expiresIn: 900, user }),
    ),
    http.get(`${BASE}/me`, () => HttpResponse.json(user)),
  )
}

async function switchIn(rowName: string | RegExp) {
  const link = await screen.findByRole('link', { name: rowName })
  return within(link.closest('tr')!).getByRole('switch')
}

/**
 * Nội dung nào dành cho gói Premium.
 *
 * Three shelves, one control, and the two things worth pinning on each: the
 * flag is READ on the row — which is the whole reason it is on the list rather
 * than in an editor — and it is WRITTEN only by an account holding
 * `billing:manage`.
 *
 * The write test asserts the row afterwards rather than the request, because
 * a toggle that fires the right call and leaves the screen showing the old
 * answer is the failure this project keeps meeting.
 */
describe('gói Premium của nội dung', () => {
  it('đề: đọc được cả hai trạng thái ngay trên hàng', async () => {
    renderRoute('/exams')

    expect(await switchIn('SEED-TOPIK-II-83')).toBeChecked()
    expect(await switchIn('SEED-TOPIK-I-64')).not.toBeChecked()
  })

  it('đề: bật tắt tại chỗ, và hàng đọc lại theo câu trả lời của máy chủ', async () => {
    const user = userEvent.setup()
    renderRoute('/exams')

    const toggle = await switchIn('SEED-TOPIK-I-64')
    await user.click(toggle)

    expect(await switchIn('SEED-TOPIK-I-64')).toBeChecked()
    expect(within((await screen.findByRole('link', { name: 'SEED-TOPIK-I-64' })).closest('tr')!)
      .getByText('Premium')).toBeInTheDocument()
  })

  it('nhại theo: bật tắt tại chỗ', async () => {
    const user = userEvent.setup()
    renderRoute('/videos')

    const toggle = await switchIn('Đặt bàn nhà hàng')
    expect(toggle).not.toBeChecked()

    await user.click(toggle)
    expect(await switchIn('Đặt bàn nhà hàng')).toBeChecked()
  })

  it('chép chính tả: bật tắt tại chỗ', async () => {
    const user = userEvent.setup()
    renderRoute('/dictation')

    const toggle = await switchIn('Chào hỏi hằng ngày')
    expect(toggle).not.toBeChecked()

    await user.click(toggle)
    expect(await switchIn('Chào hỏi hằng ngày')).toBeChecked()
  })

  // `billing:manage` is admin's alone. A content editor still READS the column
  // — hiding it would make the shelf's most consequential fact invisible to
  // the people publishing to it — and cannot move it.
  it('thiếu billing:manage thì chỉ đọc, không đổi được', async () => {
    asContentEditor()
    renderRoute('/exams')

    const toggle = await switchIn('SEED-TOPIK-II-83')
    expect(toggle).toBeDisabled()
    expect(toggle).toBeChecked()
  })

  // The refusal a client cannot prevent: rbac is the rule, the disabled
  // attribute is the courtesy, and a 403 from anywhere else has to be said out
  // loud rather than swallowed into a row that silently did not change.
  it('máy chủ từ chối thì nói ra, và hàng giữ nguyên', async () => {
    const user = userEvent.setup()
    server.use(
      http.put(`${BASE}/admin/exams/:examId/premium`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Forbidden',
            status: 403,
            code: 'forbidden',
            detail: 'Bạn không có quyền đổi gói của nội dung.',
          },
          { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    renderRoute('/exams')

    await user.click(await switchIn('SEED-TOPIK-I-64'))

    expect(await screen.findByText('Bạn không có quyền đổi gói của nội dung.')).toBeInTheDocument()
    expect(await switchIn('SEED-TOPIK-I-64')).not.toBeChecked()
  })
})
