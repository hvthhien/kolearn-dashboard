import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { MOCK_USER } from '../mocks/handlers'
import { server } from '../mocks/server'
import { renderRoute } from '../test/harness'

/**
 * Truy cập sớm — the lock switch, the access codes and the waitlist.
 *
 * Fixtures (src/mocks/fixtures/earlyAccess.ts): the site open; TIKTOK100 full,
 * TOPIK100 at 83/100, WAITLIST01 a batch, XAMI-H7K92P personal; five waitlist
 * entries oldest first — one activated, one invited, three waiting.
 */

async function renderTab(tab?: 'Mã truy cập' | 'Danh sách chờ') {
  const user = userEvent.setup()
  renderRoute('/early-access')
  await screen.findByRole('heading', { name: 'Truy cập sớm', level: 1 })
  if (tab) await user.click(screen.getByRole('button', { name: tab }))
  return user
}

function rowFor(text: string) {
  return screen.getByText(text).closest('tr')!
}

describe('khoá trang', () => {
  it('turns the lock on only after saying what it will do', async () => {
    const user = await renderTab()
    expect(await screen.findByText('Đang mở cho mọi người')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bật khoá trang' }))
    const dialog = screen.getByRole('dialog', { name: 'Bật khoá trang?' })
    expect(within(dialog).getByText(/sẽ thấy trang khoá/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Bật khoá trang' }))

    expect(await screen.findByText('Đang khoá')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mở cho mọi người' })).toBeInTheDocument()
  })

  it('saves the release date and the capacity line without touching the lock', async () => {
    let sent: unknown
    server.use(
      http.put('/api/v1/admin/early-access/settings', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...(sent as object), updatedAt: new Date().toISOString() })
      }),
    )
    const user = await renderTab()
    const save = await screen.findByRole('button', { name: 'Lưu' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Ngày ra mắt chính thức'), '2026-10-01T09:00')
    await user.click(screen.getByRole('checkbox', { name: /Hiện số lượt mời còn lại/ }))
    await user.click(save)

    await waitFor(() => expect(sent).toBeDefined())
    expect(sent).toMatchObject({
      enabled: false,
      showCapacity: true,
      launchAt: new Date('2026-10-01T09:00').toISOString(),
    })
  })
})

describe('mã truy cập', () => {
  it('lists each code with what is used, what is left and its state', async () => {
    await renderTab('Mã truy cập')
    await screen.findByText('TIKTOK100')

    const tiktok = rowFor('TIKTOK100')
    expect(within(tiktok).getByText('100/100')).toBeInTheDocument()
    expect(within(tiktok).getByText('Hết lượt')).toBeInTheDocument()

    const topik = rowFor('TOPIK100')
    expect(within(topik).getByText('83/100')).toBeInTheDocument()
    expect(within(topik).getByText('17')).toBeInTheDocument()
    expect(within(topik).getByText('7 ngày Premium · giảm 50% tháng đầu')).toBeInTheDocument()
  })

  it('creates a campaign code with its benefits', async () => {
    const user = await renderTab('Mã truy cập')
    await screen.findByText('TIKTOK100')

    await user.click(screen.getByRole('button', { name: 'Tạo mã' }))
    const dialog = screen.getByRole('dialog', { name: 'Tạo mã truy cập' })
    await user.type(within(dialog).getByLabelText('Mã'), 'dictation100')
    await user.type(within(dialog).getByLabelText('Chiến dịch'), 'TikTok Dictation')
    await user.clear(within(dialog).getByLabelText('Số ngày dùng thử Premium'))
    await user.type(within(dialog).getByLabelText('Số ngày dùng thử Premium'), '14')
    await user.click(within(dialog).getByRole('button', { name: 'Tạo mã' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const row = rowFor('DICTATION100')
    expect(within(row).getByText('TikTok Dictation')).toBeInTheDocument()
    expect(within(row).getByText('14 ngày Premium · giảm 50% tháng đầu')).toBeInTheDocument()
    expect(within(row).getByText('Đang mở')).toBeInTheDocument()
  })

  it('shows the server’s refusal of a code that already exists', async () => {
    const user = await renderTab('Mã truy cập')
    await screen.findByText('TIKTOK100')

    await user.click(screen.getByRole('button', { name: 'Tạo mã' }))
    const dialog = screen.getByRole('dialog', { name: 'Tạo mã truy cập' })
    await user.type(within(dialog).getByLabelText('Mã'), 'TIKTOK100')
    await user.type(within(dialog).getByLabelText('Chiến dịch'), 'Lặp lại')
    await user.click(within(dialog).getByRole('button', { name: 'Tạo mã' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Đã có mã này')
  })

  it('does not ask a personal code for a limit', async () => {
    const user = await renderTab('Mã truy cập')
    await screen.findByText('TIKTOK100')
    await user.click(screen.getByRole('button', { name: 'Tạo mã' }))
    const dialog = screen.getByRole('dialog', { name: 'Tạo mã truy cập' })

    expect(within(dialog).getByLabelText('Số lượt kích hoạt tối đa')).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('Loại mã'), 'PERSONAL')
    expect(within(dialog).queryByLabelText('Số lượt kích hoạt tối đa')).not.toBeInTheDocument()
  })

  it('disables a code after confirming, and enables it again in one press', async () => {
    const user = await renderTab('Mã truy cập')
    await screen.findByText('TOPIK100')

    await user.click(within(rowFor('TOPIK100')).getByRole('button', { name: 'Tắt' }))
    const dialog = screen.getByRole('dialog', { name: 'Tắt mã truy cập' })
    expect(within(dialog).getByText(/83 người đã vào bằng mã này vẫn giữ/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Tắt mã' }))

    await waitFor(() => expect(within(rowFor('TOPIK100')).getByText('Đã tắt')).toBeInTheDocument())
    await user.click(within(rowFor('TOPIK100')).getByRole('button', { name: 'Bật lại' }))
    await waitFor(() => expect(within(rowFor('TOPIK100')).getByText('Đang mở')).toBeInTheDocument())
  })

  it('names who came in through a code', async () => {
    const user = await renderTab('Mã truy cập')
    await screen.findByText('TOPIK100')
    await user.click(within(rowFor('TOPIK100')).getByRole('button', { name: 'Người dùng' }))

    const list = await screen.findByRole('list', { name: 'Người đã kích hoạt mã' })
    expect(within(list).getByText('lan@hoc.vn')).toBeInTheDocument()
    expect(within(list).getByText(/đã dùng ưu đãi/)).toBeInTheDocument()
  })
})

describe('danh sách chờ', () => {
  it('shows the funnel and each entry’s status, oldest first', async () => {
    await renderTab('Danh sách chờ')
    await screen.findByText('cho-1@hoc.vn')

    const summary = screen.getByText('Chưa mời').closest('div')!
    expect(within(summary).getByText('3')).toBeInTheDocument()
    expect(within(rowFor('da-kich-hoat@hoc.vn')).getByText('Đã kích hoạt')).toBeInTheDocument()
    expect(within(rowFor('da-moi@hoc.vn')).getByText('XAMI-D5E6F7')).toBeInTheDocument()

    const emails = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent)
    expect(emails).toEqual(['da-kich-hoat@hoc.vn', 'da-moi@hoc.vn', 'cho-1@hoc.vn', 'cho-2@hoc.vn', 'cho-3@hoc.vn'])
  })

  it('invites the next people waiting, each with a personal code', async () => {
    let sent: unknown
    server.use(
      http.post('/api/v1/admin/early-access/waitlist/invite', async ({ request }) => {
        sent = await request.clone().json()
        return undefined
      }),
    )
    const user = await renderTab('Danh sách chờ')
    await screen.findByText('cho-1@hoc.vn')

    await user.click(screen.getByRole('button', { name: 'Tạo đợt mời' }))
    const dialog = screen.getByRole('dialog', { name: 'Mời người trong danh sách chờ' })
    const count = within(dialog).getByLabelText('Số người mời')
    await user.clear(count)
    await user.type(count, '2')
    await user.click(within(dialog).getByRole('button', { name: 'Mời 2 người' }))

    const invited = await within(dialog).findByRole('list', { name: 'Người vừa được mời' })
    expect(within(invited).getByText('cho-1@hoc.vn')).toBeInTheDocument()
    expect(within(invited).getByText('cho-2@hoc.vn')).toBeInTheDocument()
    expect(within(invited).getAllByText(/^XAMI-/)).toHaveLength(2)
    expect(sent).toMatchObject({ count: 2, trialDays: 7, discountPercent: 50 })

    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }))
    await waitFor(() =>
      expect(within(rowFor('cho-1@hoc.vn')).getByText('Đã mời')).toBeInTheDocument(),
    )
    expect(within(rowFor('cho-3@hoc.vn')).getByText('Đang chờ')).toBeInTheDocument()
  })

  it('removes an entry after confirming', async () => {
    const user = await renderTab('Danh sách chờ')
    await screen.findByText('cho-3@hoc.vn')

    await user.click(within(rowFor('cho-3@hoc.vn')).getByRole('button', { name: 'Xoá' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Xoá khỏi danh sách chờ' })).getByRole('button', {
        name: 'Xoá',
      }),
    )
    await waitFor(() => expect(screen.queryByText('cho-3@hoc.vn')).not.toBeInTheDocument())
  })
})

describe('chỉ dành cho admin', () => {
  it('offers the nav link to an account holding early_access:manage', async () => {
    await renderTab()
    expect(screen.getByRole('link', { name: 'Truy cập sớm' })).toBeInTheDocument()
  })

  it('hides the link and refuses the route without it', async () => {
    const user = {
      ...MOCK_USER,
      permissions: MOCK_USER.permissions.filter((p) => p !== 'early_access:manage'),
    }
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-access-token', expiresIn: 900, user }),
      ),
    )
    renderRoute('/early-access')

    expect(await screen.findByRole('heading', { name: /dành cho admin/ })).toBeInTheDocument()
    expect(screen.getByText('early_access:manage')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Truy cập sớm' })).not.toBeInTheDocument()
  })
})
