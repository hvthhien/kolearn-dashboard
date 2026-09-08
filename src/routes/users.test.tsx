import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { renderRoute } from '../test/harness'
import { server } from '../mocks/server'
import { MOCK_USER } from '../mocks/handlers'
import { lastSeen } from '../features/users/format'

/**
 * Người dùng — the directory, and the three writes an admin makes from it.
 *
 * What is worth pinning here is not that the table renders. It is the set of
 * refusals the screen is built around, because each one is a way an admin can
 * lock themselves or somebody else out and each is stated in two places — here
 * and in the server — which is exactly the arrangement that drifts.
 *
 * Fixtures (src/mocks/fixtures/orders.ts): u-10 Lan, learner, two devices;
 * u-12 Minh, premium, Google-only; u-20 unverified with no roles; u-30
 * suspended; u-1 the signed-in admin.
 */

async function renderUsers() {
  const user = userEvent.setup()
  renderRoute('/users')
  await screen.findByRole('heading', { name: 'Người dùng' })
  await screen.findByText('lan@example.com')
  return user
}

function rowFor(email: string) {
  return screen.getByText(email).closest('tr')!
}

describe('danh sách', () => {
  it('shows what an admin decides from: roles, plan, status and last activity', async () => {
    await renderUsers()

    const lan = rowFor('lan@example.com')
    expect(within(lan).getByText('learner')).toBeInTheDocument()
    expect(within(lan).getByText('Cơ bản')).toBeInTheDocument()
    expect(within(lan).getByText('đang hoạt động')).toBeInTheDocument()

    const minh = rowFor('minh@example.com')
    expect(within(minh).getByText(/^Premium đến/)).toBeInTheDocument()
    // The two states that explain "mật khẩu đúng mà không vào được".
    expect(within(minh).getByText('chỉ đăng nhập bằng Google')).toBeInTheDocument()
    expect(
      within(rowFor('chua-xac-minh@example.com')).getByText('chưa xác minh email'),
    ).toBeInTheDocument()

    expect(within(rowFor('da-dinh-chi@example.com')).getByText('đã đình chỉ')).toBeInTheDocument()

    // An account holding no role is a real state, not a blank cell nobody can
    // tell from a loading one.
    expect(within(rowFor('chua-xac-minh@example.com')).getByText('—')).toBeInTheDocument()
  })

  it('counts every match, not the page', async () => {
    await renderUsers()
    expect(screen.getByText(/1–5 trong 5 tài khoản/)).toBeInTheDocument()
  })

  it('matches an email from the front and a name anywhere', async () => {
    const user = await renderUsers()
    const search = screen.getByLabelText(/^Tìm/)

    await user.type(search, 'lan@')
    await user.click(screen.getByRole('button', { name: 'Tìm' }))
    await waitFor(() => expect(screen.queryByText('minh@example.com')).not.toBeInTheDocument())
    expect(screen.getByText('lan@example.com')).toBeInTheDocument()

    // The middle of an address is not a match — the server matches the address
    // by prefix, and a screen that found it here would only work offline.
    await user.clear(search)
    await user.type(search, 'example.com')
    await user.click(screen.getByRole('button', { name: 'Tìm' }))
    await screen.findByText('Không có tài khoản nào khớp')
  })

  it('filters by status without stranding the operator on a later page', async () => {
    const user = await renderUsers()

    await user.click(screen.getByRole('button', { name: 'Đã đình chỉ' }))
    await waitFor(() => expect(screen.queryByText('lan@example.com')).not.toBeInTheDocument())
    expect(screen.getByText('da-dinh-chi@example.com')).toBeInTheDocument()
    expect(screen.getByText(/1–1 trong 1 tài khoản/)).toBeInTheDocument()
  })
})

describe('vai trò', () => {
  it('offers every role from the server, with the account’s own already ticked', async () => {
    const user = await renderUsers()
    await user.click(within(rowFor('lan@example.com')).getByRole('button', { name: 'Vai trò' }))

    const dialog = await screen.findByRole('dialog', { name: 'Vai trò' })
    // The codes come from GET /admin/roles rather than a list typed into the
    // client, so a role added by a migration appears without a deploy.
    for (const code of ['admin', 'content_admin', 'content_editor', 'learner', 'support']) {
      expect(within(dialog).getByText(code)).toBeInTheDocument()
    }
    expect(within(dialog).getByRole('checkbox', { name: /Người học/ })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /Quản trị hệ thống/ })).not.toBeChecked()
  })

  it('saves the whole set and shows it on the row', async () => {
    const user = await renderUsers()
    await user.click(within(rowFor('lan@example.com')).getByRole('button', { name: 'Vai trò' }))

    const dialog = await screen.findByRole('dialog', { name: 'Vai trò' })
    await user.click(within(dialog).getByRole('checkbox', { name: /Hỗ trợ người dùng/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Lưu vai trò' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() =>
      expect(within(rowFor('lan@example.com')).getByText('support')).toBeInTheDocument(),
    )
    // A put, not a diff — the role it already held is still there.
    expect(within(rowFor('lan@example.com')).getByText('learner')).toBeInTheDocument()
  })

  it('refuses to let an admin take admin off themselves, and says why', async () => {
    const user = await renderUsers()
    await user.click(within(rowFor(MOCK_USER.email)).getByRole('button', { name: 'Vai trò' }))

    const dialog = await screen.findByRole('dialog', { name: 'Vai trò' })
    await user.click(within(dialog).getByRole('checkbox', { name: /Quản trị hệ thống/ }))

    expect(within(dialog).getByText(/Nhờ một admin khác/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Lưu vai trò' })).toBeDisabled()
  })

  it('shows the server’s refusal when it is the server that refuses', async () => {
    server.use(
      http.put('/api/v1/admin/users/:userId/roles', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Dữ liệu không hợp lệ',
            status: 422,
            code: 'unknown_role',
            detail: 'Có vai trò không tồn tại trong danh sách vai trò.',
          },
          { status: 422 },
        ),
      ),
    )
    const user = await renderUsers()
    await user.click(within(rowFor('lan@example.com')).getByRole('button', { name: 'Vai trò' }))

    const dialog = await screen.findByRole('dialog', { name: 'Vai trò' })
    await user.click(within(dialog).getByRole('checkbox', { name: /Hỗ trợ người dùng/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Lưu vai trò' }))

    expect(await within(dialog).findByText(/không tồn tại trong danh sách/)).toBeInTheDocument()
  })
})

describe('đình chỉ', () => {
  it('needs a reason, then closes the account and empties its devices', async () => {
    const user = await renderUsers()
    await user.click(within(rowFor('lan@example.com')).getByRole('button', { name: 'Đình chỉ' }))

    const dialog = await screen.findByRole('dialog', { name: 'Đình chỉ tài khoản' })
    expect(within(dialog).getByRole('button', { name: 'Đình chỉ' })).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/^Lý do/), 'chia sẻ tài khoản')
    await user.click(within(dialog).getByRole('button', { name: 'Đình chỉ' }))

    await waitFor(() =>
      expect(within(rowFor('lan@example.com')).getByText('đã đình chỉ')).toBeInTheDocument(),
    )
    // The dialog says every device is signed out. This is that sentence, checked.
    expect(within(rowFor('lan@example.com')).getByText('không có thiết bị nào')).toBeInTheDocument()
  })

  it('offers Mở lại on a suspended account, with the reason optional', async () => {
    const user = await renderUsers()
    const row = rowFor('da-dinh-chi@example.com')
    await user.click(within(row).getByRole('button', { name: 'Mở lại' }))

    const dialog = await screen.findByRole('dialog', { name: 'Mở lại tài khoản' })
    expect(within(dialog).getByRole('button', { name: 'Mở lại' })).toBeEnabled()
    await user.click(within(dialog).getByRole('button', { name: 'Mở lại' }))

    await waitFor(() =>
      expect(
        within(rowFor('da-dinh-chi@example.com')).getByText('đang hoạt động'),
      ).toBeInTheDocument(),
    )
  })

  it('does not offer to suspend the account making the request', async () => {
    await renderUsers()
    const mine = rowFor(MOCK_USER.email)
    expect(within(mine).queryByRole('button', { name: 'Đình chỉ' })).not.toBeInTheDocument()
    expect(within(mine).getByText('(bạn)')).toBeInTheDocument()
  })
})

describe('thiết bị', () => {
  it('lists the devices before offering to end them, and warns about the 15 minutes', async () => {
    const user = await renderUsers()
    await user.click(within(rowFor('lan@example.com')).getByRole('button', { name: 'Thiết bị' }))

    const dialog = await screen.findByRole('dialog', { name: 'Thiết bị đang đăng nhập' })
    expect(await within(dialog).findByText(/iPhone/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Chrome/)).toBeInTheDocument()
    expect(within(dialog).getByText(/tối đa 15 phút/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Đăng xuất mọi thiết bị' }))
    expect(
      await within(dialog).findByText('Tài khoản này không có thiết bị nào đang đăng nhập.'),
    ).toBeInTheDocument()
    // Nothing left to end, so the button stops offering to.
    expect(within(dialog).getByRole('button', { name: 'Đăng xuất mọi thiết bị' })).toBeDisabled()
  })

  it('says so when an account has no devices rather than showing an empty list', async () => {
    const user = await renderUsers()
    await user.click(within(rowFor('minh@example.com')).getByRole('button', { name: 'Thiết bị' }))

    const dialog = await screen.findByRole('dialog', { name: 'Thiết bị đang đăng nhập' })
    expect(
      await within(dialog).findByText('Tài khoản này không có thiết bị nào đang đăng nhập.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Đăng xuất mọi thiết bị' })).toBeDisabled()
  })
})

/** Signs in as an account holding everything except the admin-only codes. */
function withoutUserAdmin(...dropped: string[]) {
  const user = {
    ...MOCK_USER,
    permissions: MOCK_USER.permissions.filter((p) => !dropped.includes(p)),
  }
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-access-token', expiresIn: 900, user }),
    ),
  )
}

describe('chỉ dành cho admin', () => {
  it('offers the nav link only to an account that can use it', async () => {
    await renderUsers()
    expect(screen.getByRole('link', { name: 'Người dùng' })).toBeInTheDocument()
  })

  it('hides the link and refuses the route without user:role:assign', async () => {
    withoutUserAdmin('user:role:assign', 'user:suspend')
    renderRoute('/users')

    // Refused, and told which permission is missing — a screen that simply
    // 403'd six times would read as broken rather than as forbidden.
    expect(
      await screen.findByRole('heading', { name: /dành cho admin/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('user:role:assign')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('offers the writes separately: roles without user:suspend leaves the rest', async () => {
    // The two permissions are separate on the server (00003 and 00055), so an
    // account holding one and not the other has to get a screen that says so
    // by offering less, not by failing.
    withoutUserAdmin('user:suspend')
    const user = userEvent.setup()
    renderRoute('/users')
    await screen.findByText('lan@example.com')

    const lan = rowFor('lan@example.com')
    expect(within(lan).getByRole('button', { name: 'Vai trò' })).toBeInTheDocument()
    expect(within(lan).queryByRole('button', { name: 'Thiết bị' })).not.toBeInTheDocument()
    expect(within(lan).queryByRole('button', { name: 'Đình chỉ' })).not.toBeInTheDocument()

    await user.click(within(lan).getByRole('button', { name: 'Vai trò' }))
    expect(await screen.findByRole('dialog', { name: 'Vai trò' })).toBeInTheDocument()
  })
})

describe('lastSeen', () => {
  it('never claims an account has never signed in', () => {
    // The field reads LIVE sessions, so absent means no device — not "never".
    expect(lastSeen(undefined)).toBe('không có thiết bị nào')
    expect(lastSeen(new Date().toISOString())).toBe('hôm nay')
    expect(lastSeen(new Date(Date.now() - 86400000).toISOString())).toBe('hôm qua')
    expect(lastSeen(new Date(Date.now() - 5 * 86400000).toISOString())).toBe('5 ngày trước')
    // Past a month it becomes a date: "63 ngày trước" is arithmetic nobody
    // wanted done for them.
    expect(lastSeen('2026-01-02T00:00:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })
})
