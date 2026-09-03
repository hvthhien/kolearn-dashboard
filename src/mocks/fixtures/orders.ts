import type { AdminPaymentOrder, AdminUser, BankTransaction } from '../../api/gen/model'

/**
 * Đơn chuyển khoản in the states the queue shows: one waiting, one that
 * arrived short, one paid. The memo on each is a real transfer code — XAMI
 * plus six of the server's alphabet — so a test that matches on it is
 * matching what a bank would carry.
 */
export const PAYMENT_ORDERS: AdminPaymentOrder[] = [
  {
    id: 'po-1',
    status: 'PENDING',
    productCode: 'premium_1m',
    productTitle: 'Premium 1 tháng',
    days: 30,
    amountVnd: 99000,
    expiresAt: '2026-09-04T09:00:00Z',
    createdAt: '2026-09-03T09:00:00Z',
    userId: 'u-10',
    email: 'lan@example.com',
    displayName: 'Lan',
    transferCode: 'XAMI7K3F9Q',
    note: '',
  },
  {
    id: 'po-2',
    status: 'REVIEW',
    productCode: 'premium_3m',
    productTitle: 'Premium 3 tháng',
    days: 90,
    amountVnd: 249000,
    expiresAt: '2026-09-03T20:00:00Z',
    createdAt: '2026-09-02T20:00:00Z',
    paidAmountVnd: 240000,
    userId: 'u-11',
    email: 'huy@example.com',
    displayName: 'Huy',
    transferCode: 'XAMIB2C3D4',
    note: '',
  },
  {
    id: 'po-3',
    status: 'PAID',
    productCode: 'premium_1m',
    productTitle: 'Premium 1 tháng',
    days: 30,
    amountVnd: 99000,
    expiresAt: '2026-09-02T09:00:00Z',
    createdAt: '2026-09-01T09:00:00Z',
    paidAt: '2026-09-01T09:20:00Z',
    paidAmountVnd: 99000,
    userId: 'u-12',
    email: 'minh@example.com',
    displayName: 'Minh',
    transferCode: 'XAMIE5F6G7',
    note: '',
  },
]

/** A stray and a matched transfer. */
export const BANK_TRANSACTIONS: BankTransaction[] = [
  {
    id: 'bt-1',
    provider: 'sepay',
    providerTxnId: '92704',
    amountVnd: 99000,
    memo: 'XAMI nang cap premium',
    reference: 'MBVCB.3278907687',
    occurredAt: '2026-09-03T09:10:00Z',
    receivedAt: '2026-09-03T09:10:05Z',
  },
  {
    id: 'bt-2',
    provider: 'sepay',
    providerTxnId: '92600',
    amountVnd: 99000,
    memo: 'XAMIE5F6G7',
    reference: 'MBVCB.3278900000',
    occurredAt: '2026-09-01T09:19:00Z',
    receivedAt: '2026-09-01T09:19:05Z',
    matchedOrderId: 'po-3',
  },
]

export const ADMIN_USERS: AdminUser[] = [
  { id: 'u-10', email: 'lan@example.com', displayName: 'Lan', plan: { tier: 'basic' } },
  {
    id: 'u-12',
    email: 'minh@example.com',
    displayName: 'Minh',
    plan: { tier: 'premium', premiumUntil: '2026-10-01T09:20:00Z' },
  },
]
