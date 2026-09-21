import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/harness'
import { promoState, promoValue } from './PromotionsPage'
import type { PromoCode } from '../api/gen/model'

/**
 * Khuyến mãi — the codes that discount an order.
 *
 * Two things are worth testing here and they are the two that would quietly
 * mislead an operator:
 *
 *   the STATE column, computed from the same fields the server reads, in the
 *   same order — a row reading "đang chạy" on a code the learner is being
 *   refused sends support chasing a bug that is not there; and
 *
 *   the "Áp dụng cho" column, where an EMPTY product list means EVERY term.
 *   A blank cell there reads as the opposite of what it means, and the cost
 *   of the misreading is a campaign nobody thinks is live.
 *
 * Fixtures: pc-1 running, pc-2 exhausted and fenced to the year, pc-3
 * revoked, pc-4 scheduled.
 */

async function renderPromotions() {
  const user = userEvent.setup()
  renderRoute('/promotions')
  await screen.findByRole('heading', { name: 'Khuyến mãi' })
  // The heading paints before the list; `rowFor` below is synchronous, so the
  // table has to be on screen before any test reaches for a row.
  await screen.findByText('TET2026')
  return user
}

function rowFor(code: string) {
  return screen.getByText(code).closest('tr')!
}

describe('trạng thái của một mã khuyến mãi', () => {
  const base: PromoCode = {
    id: 'x',
    code: 'TEST2026',
    kind: 'PERCENT',
    percent: 10,
    maxUses: 10,
    uses: 0,
    productCodes: [],
    note: '',
    createdAt: '2026-01-01T00:00:00Z',
  }
  const now = new Date('2026-09-01T00:00:00Z')

  it('reads the fields in the server’s order', () => {
    expect(promoState(base, now)).toBe('active')
    expect(promoState({ ...base, uses: 10 }, now)).toBe('exhausted')
    expect(promoState({ ...base, expiresAt: '2026-08-31T00:00:00Z' }, now)).toBe('expired')
    expect(promoState({ ...base, expiresAt: '2026-09-02T00:00:00Z' }, now)).toBe('active')
    // A campaign written the week before it opens.
    expect(promoState({ ...base, startsAt: '2026-09-02T00:00:00Z' }, now)).toBe('scheduled')
    expect(promoState({ ...base, startsAt: '2026-08-01T00:00:00Z' }, now)).toBe('active')
    // Revoked wins over everything, because `loadUsablePromo` checks it first
    // and answers `promo_invalid` whatever else is true of the row.
    expect(
      promoState({ ...base, uses: 10, startsAt: '2026-09-02T00:00:00Z', revokedAt: '2026-08-01T00:00:00Z' }, now),
    ).toBe('revoked')
  })

  it('spells both kinds of discount', () => {
    expect(promoValue({ kind: 'PERCENT', percent: 20 })).toBe('-20%')
    expect(promoValue({ kind: 'AMOUNT', amountVnd: 50000 })).toBe('-50.000 ₫')
  })
})

describe('danh sách mã khuyến mãi', () => {
  it('lists every code with its state, and offers Thu hồi only where it applies', async () => {
    await renderPromotions()

    expect(within(rowFor('TET2026')).getByText('đang chạy')).toBeInTheDocument()
    expect(within(rowFor('NAMMOI50K')).getByText('hết lượt')).toBeInTheDocument()
    expect(within(rowFor('SAIROI')).getByText('đã thu hồi')).toBeInTheDocument()
    expect(within(rowFor('HE2026')).getByText('chưa bắt đầu')).toBeInTheDocument()

    // An exhausted or scheduled code can still be pulled; a revoked one is
    // already pulled, so offering the button again would be a no-op that
    // answers 409.
    expect(within(rowFor('TET2026')).getByRole('button', { name: 'Thu hồi' })).toBeInTheDocument()
    expect(within(rowFor('HE2026')).getByRole('button', { name: 'Thu hồi' })).toBeInTheDocument()
    expect(within(rowFor('SAIROI')).queryByRole('button', { name: 'Thu hồi' })).toBeNull()
  })

  it('says "mọi thời hạn" where the product list is empty, and names the terms otherwise', async () => {
    await renderPromotions()
    // The cell that would otherwise be blank and read as "no terms".
    expect(within(rowFor('TET2026')).getByText('Mọi thời hạn')).toBeInTheDocument()
    expect(within(rowFor('NAMMOI50K')).getByText('premium_12m')).toBeInTheDocument()
  })

  it('shows each discount in its own units', async () => {
    await renderPromotions()
    expect(within(rowFor('TET2026')).getByText('-20%')).toBeInTheDocument()
    expect(within(rowFor('NAMMOI50K')).getByText('-50.000 ₫')).toBeInTheDocument()
  })
})

describe('tạo mã', () => {
  it('normalises what the operator typed and lists the new code', async () => {
    const user = await renderPromotions()
    await user.click(screen.getByRole('button', { name: 'Tạo mã' }))

    // Typed with a dash and in lower case, the way somebody writes a campaign
    // name; the server stores it folded, so the screen must send it folded.
    await user.type(screen.getByLabelText('Mã'), 'thu-2026')
    await user.clear(screen.getByLabelText('Giảm bao nhiêu phần trăm'))
    await user.type(screen.getByLabelText('Giảm bao nhiêu phần trăm'), '25')
    // Scoped: the page's own "Tạo mã" is still mounted behind the dialog.
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tạo mã' }))

    // The dialog stays open holding the code, because this is the moment the
    // operator copies it out. Scoped to the dialog: the list behind it has
    // already refreshed and carries the same code.
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('THU2026')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }))

    await waitFor(() => expect(within(rowFor('THU2026')).getByText('-25%')).toBeInTheDocument())
    expect(within(rowFor('THU2026')).getByText('Mọi thời hạn')).toBeInTheDocument()
  })

  it('refuses a code that already exists', async () => {
    const user = await renderPromotions()
    await user.click(screen.getByRole('button', { name: 'Tạo mã' }))
    // The same code as the fixture, respelt — normalisation folds it onto the
    // existing row, and the server's unique index refuses it.
    await user.type(screen.getByLabelText('Mã'), 'tet-2026')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tạo mã' }))

    expect(await screen.findByText(/đã tồn tại/)).toBeInTheDocument()
  })

  it('will not submit a code too short to be one', async () => {
    const user = await renderPromotions()
    await user.click(screen.getByRole('button', { name: 'Tạo mã' }))
    await user.type(screen.getByLabelText('Mã'), 'ab')

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Tạo mã' })).toBeDisabled()
  })
})

describe('thu hồi', () => {
  it('pulls a code and says the open orders keep their price', async () => {
    const user = await renderPromotions()
    await user.click(within(rowFor('TET2026')).getByRole('button', { name: 'Thu hồi' }))

    // The reassurance an operator needs before pressing: revoking does not
    // reprice a memo somebody is already holding.
    expect(screen.getByText(/vẫn giữ nguyên giá đã báo/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thu hồi mã' }))

    await waitFor(() =>
      expect(within(rowFor('TET2026')).getByText('đã thu hồi')).toBeInTheDocument(),
    )
  })
})

describe('ai đã dùng', () => {
  it('lists who spent it and what it cost them', async () => {
    const user = await renderPromotions()
    await user.click(within(rowFor('TET2026')).getByRole('button', { name: 'Ai đã dùng' }))

    expect(await screen.findByText('Nguyễn Minh')).toBeInTheDocument()
    expect(screen.getByText(/giảm 23\.800 ₫ · trả 95\.200 ₫/)).toBeInTheDocument()
  })

  it('explains an empty list rather than leaving it blank', async () => {
    const user = await renderPromotions()
    await user.click(within(rowFor('HE2026')).getByRole('button', { name: 'Ai đã dùng' }))

    // "Nobody yet" and "the pending orders are not counted here" are two
    // different facts, and an operator watching a campaign needs the second.
    expect(await screen.findByText(/chỉ tính lượt khi tiền về/)).toBeInTheDocument()
  })
})
