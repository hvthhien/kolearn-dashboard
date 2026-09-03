import type { CodeRedemption, RedeemCode } from '../../api/gen/model'

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
