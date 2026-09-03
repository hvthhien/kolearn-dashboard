import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/harness'

/**
 * Thanh toán — the two queues and the support lookup.
 *
 * What an operator does here is irreversible for the learner in the good
 * direction (days are granted and never taken back), so each path is tested
 * for offering the right control on the right row and for the row reading
 * settled afterwards. Fixtures: po-1 waiting, po-2 arrived short, po-3 paid;
 * bt-1 a stray transfer; Lan basic, Minh premium.
 */

async function openTab(name: string) {
  const user = userEvent.setup()
  renderRoute('/billing')
  await screen.findByRole('heading', { name: 'Thanh toán' })
  await user.click(screen.getByRole('button', { name }))
  return user
}

function rowFor(text: string) {
  return screen.getByText(text).closest('tr')!
}

describe('đơn chuyển khoản', () => {
  it('opens on the waiting queue, with confirmation offered on the rows that can take it', async () => {
    renderRoute('/billing')

    await screen.findByText('XAMI7K3F9Q')
    expect(within(rowFor('XAMI7K3F9Q')).getByText('chờ tiền')).toBeInTheDocument()
    expect(within(rowFor('XAMIB2C3D4')).getByText('chuyển thiếu')).toBeInTheDocument()
    expect(within(rowFor('XAMIB2C3D4')).getByText('nhận 240.000 ₫')).toBeInTheDocument()
    // Paid is history, not the queue.
    expect(screen.queryByText('XAMIE5F6G7')).not.toBeInTheDocument()
  })

  it('confirms by hand and the row reads paid', async () => {
    const user = await openTab('Đơn chuyển khoản')

    await screen.findByText('XAMI7K3F9Q')
    await user.click(within(rowFor('XAMI7K3F9Q')).getByRole('button', { name: 'Đã nhận tiền' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Chỉ xác nhận khi đã thấy tiền/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Mã giao dịch trên sao kê'), 'MB123')
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận và cộng ngày' }))

    // Out of the waiting queue…
    await waitFor(() => {
      expect(screen.queryByText('XAMI7K3F9Q')).not.toBeInTheDocument()
    })
    // …and into history.
    await user.click(screen.getByRole('button', { name: 'Đã thanh toán' }))
    await screen.findByText('XAMI7K3F9Q')
    expect(within(rowFor('XAMI7K3F9Q')).getByText('đã thanh toán')).toBeInTheDocument()
    expect(within(rowFor('XAMI7K3F9Q')).queryByRole('button', { name: 'Đã nhận tiền' })).not.toBeInTheDocument()
  })
})

describe('giao dịch chưa khớp', () => {
  it('lists only the strays and matches one to an order', async () => {
    const user = await openTab('Chưa khớp')

    await screen.findByText('XAMI nang cap premium')
    expect(screen.queryByText('XAMIE5F6G7')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Khớp với đơn' }))
    const dialog = await screen.findByRole('dialog')
    const picker = within(dialog).getByLabelText('Đơn của người chuyển')
    // Only orders still able to take money are offered.
    const options = within(picker).getAllByRole('option').map((o) => o.textContent)
    expect(options.some((t) => t?.includes('XAMI7K3F9Q'))).toBe(true)
    expect(options.some((t) => t?.includes('XAMIE5F6G7'))).toBe(false)

    await user.selectOptions(picker, 'po-1')
    await user.click(within(dialog).getByRole('button', { name: 'Khớp và cộng ngày' }))

    await waitFor(() => {
      expect(screen.queryByText('XAMI nang cap premium')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Không có giao dịch lạc')).toBeInTheDocument()
  })
})

describe('người dùng', () => {
  it('finds by email, shows the plan, and gifts days with a reason', async () => {
    const user = await openTab('Người dùng')

    await user.type(screen.getByLabelText('Email'), 'lan')
    await user.click(screen.getByRole('button', { name: 'Tìm' }))

    await screen.findByText('lan@example.com')
    expect(within(rowFor('lan@example.com')).getByText('Cơ bản')).toBeInTheDocument()

    await user.click(within(rowFor('lan@example.com')).getByRole('button', { name: 'Tặng ngày' }))
    const dialog = await screen.findByRole('dialog')
    // No reason, no button: the audit row needs one.
    expect(within(dialog).getByRole('button', { name: 'Cộng ngày' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Lý do'), 'Chuyển khoản không qua SePay')
    await user.click(within(dialog).getByRole('button', { name: 'Cộng ngày' }))

    await waitFor(() => {
      expect(within(rowFor('lan@example.com')).getByText(/Premium đến/)).toBeInTheDocument()
    })
  })
})
