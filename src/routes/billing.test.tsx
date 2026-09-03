import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/harness'
import { codeState, formatCode } from './BillingPage'
import type { RedeemCode } from '../api/gen/model'

/**
 * Thanh toán — mã nâng cấp.
 *
 * The state column is the thing worth testing: it is computed here from the
 * same fields the server reads, in the same order, so that what the operator
 * sees is what the learner was told. A screen that showed "còn hiệu lực" on a
 * revoked code would send support chasing a bug that is not there.
 *
 * Fixtures: rc-1 fresh, rc-2 a campaign part-way through, rc-3 revoked.
 */

/** The codes live on their own tab; open it the way an operator does. */
async function renderCodes() {
  const user = userEvent.setup()
  renderRoute('/billing')
  await screen.findByRole('heading', { name: 'Thanh toán' })
  await user.click(screen.getByRole('button', { name: 'Mã nâng cấp' }))
  return user
}

function rowFor(code: string) {
  return screen.getByText(formatCode(code)).closest('tr')!
}

describe('trạng thái của một mã', () => {
  const base: RedeemCode = {
    id: 'x',
    code: 'ABCDEFGHJKLM',
    days: 1,
    maxUses: 1,
    uses: 0,
    note: '',
    createdAt: '2026-01-01T00:00:00Z',
  }
  const now = new Date('2026-09-01T00:00:00Z')

  it('reads the fields in the server’s order', () => {
    expect(codeState(base, now)).toBe('active')
    expect(codeState({ ...base, uses: 1 }, now)).toBe('exhausted')
    expect(codeState({ ...base, expiresAt: '2026-08-31T00:00:00Z' }, now)).toBe('expired')
    expect(codeState({ ...base, expiresAt: '2026-09-02T00:00:00Z' }, now)).toBe('active')
    // Revoked wins over everything, because the server checks it first.
    expect(codeState({ ...base, uses: 1, revokedAt: '2026-08-01T00:00:00Z' }, now)).toBe('revoked')
  })

  it('formats a code the way it is handed out', () => {
    expect(formatCode('ABCDEFGHJKLM')).toBe('ABCD-EFGH-JKLM')
  })
})

describe('danh sách mã', () => {
  it('lists every code with its state, and offers Thu hồi only where it applies', async () => {
    await renderCodes()

    expect(await screen.findByRole('heading', { name: 'Thanh toán' })).toBeInTheDocument()
    await screen.findByText('ABCD-EFGH-JKLM')

    expect(within(rowFor('ABCDEFGHJKLM')).getByText('còn hiệu lực')).toBeInTheDocument()
    expect(within(rowFor('ABCDEFGHJKLM')).getByRole('button', { name: 'Thu hồi' })).toBeInTheDocument()

    expect(within(rowFor('XYZXYZXYZXYZ')).getByText('12/100')).toBeInTheDocument()

    const revoked = rowFor('REVKEDCDEXYZ')
    expect(within(revoked).getByText('đã thu hồi')).toBeInTheDocument()
    expect(within(revoked).queryByRole('button', { name: 'Thu hồi' })).not.toBeInTheDocument()
  })

  it('shows who used a campaign code', async () => {
    const user = userEvent.setup()
    await renderCodes()

    await screen.findByText('XYZX-YZXY-ZXYZ')
    await user.click(within(rowFor('XYZXYZXYZXYZ')).getByRole('button', { name: 'Ai đã dùng' }))

    const dialog = await screen.findByRole('dialog')
    const list = await within(dialog).findByRole('list', { name: 'Người đã dùng mã' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('lan@example.com')).toBeInTheDocument()
  })
})

describe('phát hành mã', () => {
  it('mints a batch and keeps the codes on screen to copy', async () => {
    const user = userEvent.setup()
    await renderCodes()

    await screen.findByText('ABCD-EFGH-JKLM')
    await user.click(screen.getByRole('button', { name: 'Phát hành mã' }))

    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Số ngày Premium'))
    await user.type(within(dialog).getByLabelText('Số ngày Premium'), '90')
    await user.clear(within(dialog).getByLabelText('Số mã cần phát hành'))
    await user.type(within(dialog).getByLabelText('Số mã cần phát hành'), '2')
    await user.type(within(dialog).getByLabelText('Ghi chú'), 'Lớp thử')
    await user.click(within(dialog).getByRole('button', { name: 'Phát hành' }))

    const minted = await within(dialog).findByRole('list', { name: 'Mã vừa phát hành' })
    const items = within(minted).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // Each is a real code in the handed-out shape.
    for (const item of items) {
      expect(within(item).getByText(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)).toBeInTheDocument()
    }

    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }))

    // And the list has them, newest first, with the terms that were asked for.
    await waitFor(() => {
      expect(screen.getAllByText('Lớp thử')).toHaveLength(2)
    })
    const [first] = screen.getAllByText('Lớp thử')
    expect(within(first!.closest('tr')!).getByText('90')).toBeInTheDocument()
  })

  it('refuses to submit nonsense numbers', async () => {
    const user = userEvent.setup()
    await renderCodes()

    await screen.findByText('ABCD-EFGH-JKLM')
    await user.click(screen.getByRole('button', { name: 'Phát hành mã' }))

    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Số ngày Premium'))
    expect(within(dialog).getByRole('button', { name: 'Phát hành' })).toBeDisabled()
  })
})

describe('thu hồi mã', () => {
  it('asks first, says what survives, and then the row reads đã thu hồi', async () => {
    const user = userEvent.setup()
    await renderCodes()

    await screen.findByText('ABCD-EFGH-JKLM')
    await user.click(within(rowFor('ABCDEFGHJKLM')).getByRole('button', { name: 'Thu hồi' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/vẫn giữ nguyên số ngày/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Thu hồi mã' }))

    await waitFor(() => {
      expect(within(rowFor('ABCDEFGHJKLM')).getByText('đã thu hồi')).toBeInTheDocument()
    })
    expect(within(rowFor('ABCDEFGHJKLM')).queryByRole('button', { name: 'Thu hồi' })).not.toBeInTheDocument()
  })
})
