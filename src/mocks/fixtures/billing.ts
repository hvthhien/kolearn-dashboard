import type { CodeRedemption, PromoCode, PromoCodeUse, RedeemCode } from '../../api/gen/model'

/**
 * Mã nâng cấp, three of them in the three states a row can be in: a fresh
 * personal code, a campaign code part-way through its uses, and one that was
 * revoked. Every code is twelve characters of the server's alphabet (no O, I,
 * 0 or 1), because the screen formats them in groups of four and a fixture
 * the formatter would not accept is a fixture the test is lying about.
 */
export const REDEEM_CODES: RedeemCode[] = [
  {
    id: 'rc-1',
    code: 'ABCDEFGHJKLM',
    days: 30,
    maxUses: 1,
    uses: 0,
    note: 'Tặng thầy Minh',
    createdAt: '2026-08-30T09:00:00Z',
  },
  {
    id: 'rc-2',
    code: 'XYZXYZXYZXYZ',
    days: 90,
    maxUses: 100,
    uses: 12,
    expiresAt: '2026-12-31T16:59:59Z',
    note: 'Lớp TOPIK II mùa thu',
    createdAt: '2026-08-20T09:00:00Z',
  },
  {
    id: 'rc-3',
    code: 'REVKEDCDEXYZ',
    days: 7,
    maxUses: 1,
    uses: 0,
    revokedAt: '2026-08-25T09:00:00Z',
    note: 'Phát nhầm',
    createdAt: '2026-08-24T09:00:00Z',
  },
]

export const CODE_REDEMPTIONS: Record<string, CodeRedemption[]> = {
  'rc-2': [
    {
      userId: 'u-10',
      email: 'lan@example.com',
      displayName: 'Lan',
      redeemedAt: '2026-08-28T03:12:00Z',
      premiumUntil: '2026-11-26T03:12:00Z',
    },
    {
      userId: 'u-11',
      email: 'huy@example.com',
      displayName: 'Huy',
      redeemedAt: '2026-08-27T11:40:00Z',
      premiumUntil: '2026-11-25T11:40:00Z',
    },
  ],
}

/**
 * Mã khuyến mãi, one per state the row can be drawn in: a percentage running
 * now, a fixed-sum code fenced to the year and part-way through its uses, one
 * revoked, and one whose window has not opened. `scheduled` is the state no
 * mã nâng cấp has, so it needs a fixture of its own or the table's branch for
 * it is never rendered.
 */

/**
 * Relative to now, not written down.
 *
 * A campaign is defined by its window, and a fixture with a literal date in
 * it stops meaning what it was written to mean the moment that date passes —
 * "the running campaign" silently becomes "the expired one" and the table's
 * `active` branch stops being covered by anything. These two keep their
 * meaning on every future run.
 */
const inDays = (n: number): string => new Date(Date.now() + n * 86400000).toISOString()

export const PROMO_CODES: PromoCode[] = [
  {
    id: 'pc-1',
    code: 'TET2026',
    kind: 'PERCENT',
    percent: 20,
    maxUses: 500,
    uses: 37,
    productCodes: [],
    expiresAt: inDays(30),
    note: 'Chiến dịch Tết',
    createdAt: '2026-01-05T09:00:00Z',
  },
  {
    id: 'pc-2',
    code: 'NAMMOI50K',
    kind: 'AMOUNT',
    amountVnd: 50000,
    maxUses: 100,
    uses: 100,
    productCodes: ['premium_12m'],
    note: 'Giảm tiền mặt cho gói năm',
    createdAt: '2026-01-02T09:00:00Z',
  },
  {
    id: 'pc-3',
    code: 'SAIROI',
    kind: 'PERCENT',
    percent: 90,
    maxUses: 10,
    uses: 0,
    productCodes: [],
    revokedAt: '2026-01-04T09:00:00Z',
    note: 'Gõ nhầm 9 thành 90',
    createdAt: '2026-01-03T09:00:00Z',
  },
  {
    id: 'pc-4',
    code: 'HE2026',
    kind: 'PERCENT',
    percent: 15,
    maxUses: 200,
    uses: 0,
    productCodes: ['premium_3m', 'premium_6m'],
    startsAt: inDays(30),
    expiresAt: inDays(120),
    note: 'Đợt hè, chưa mở',
    createdAt: '2026-01-06T09:00:00Z',
  },
]

/** Who spent which promo. Keyed by promo id, the way CODE_REDEMPTIONS is. */
export const PROMO_USES: Record<string, PromoCodeUse[]> = {
  'pc-1': [
    {
      userId: 'u-1',
      email: 'minh@example.com',
      displayName: 'Nguyễn Minh',
      orderId: 'po-91',
      discountVnd: 23800,
      amountVnd: 95200,
      redeemedAt: '2026-01-20T03:00:00Z',
    },
  ],
}
