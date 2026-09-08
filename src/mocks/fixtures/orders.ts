import type {
  AdminPaymentOrder,
  AdminUser,
  AdminUserSession,
  BankTransaction,
} from '../../api/gen/model'

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

/**
 * The directory both screens read.
 *
 * Deliberately not four copies of the same person: the row that matters on
 * Người dùng is the one that is unlike the others, so between them these cover
 * an account with no roles at all, one that only signs in through Google, one
 * that never verified its address, one already suspended, and the signed-in
 * admin themselves — which is the row whose own actions are refused.
 */
export const ADMIN_USERS: AdminUser[] = [
  {
    id: 'u-10',
    email: 'lan@example.com',
    displayName: 'Lan',
    status: 'ACTIVE',
    emailVerified: true,
    hasPassword: true,
    roles: ['learner'],
    createdAt: '2026-08-14T02:00:00Z',
    lastSeenAt: '2026-09-05T11:30:00Z',
    plan: { tier: 'basic' },
  },
  {
    id: 'u-12',
    email: 'minh@example.com',
    displayName: 'Minh',
    status: 'ACTIVE',
    emailVerified: true,
    hasPassword: false,
    roles: ['learner'],
    createdAt: '2026-07-02T04:15:00Z',
    lastSeenAt: '2026-09-07T08:05:00Z',
    plan: { tier: 'premium', premiumUntil: '2026-10-01T09:20:00Z' },
  },
  {
    id: 'u-20',
    email: 'chua-xac-minh@example.com',
    displayName: '',
    status: 'ACTIVE',
    emailVerified: false,
    hasPassword: true,
    roles: [],
    createdAt: '2026-09-06T22:40:00Z',
    plan: { tier: 'basic' },
  },
  {
    id: 'u-30',
    email: 'da-dinh-chi@example.com',
    displayName: 'Tài khoản bị đình chỉ',
    status: 'SUSPENDED',
    emailVerified: true,
    hasPassword: true,
    roles: ['learner'],
    createdAt: '2026-05-19T06:00:00Z',
    plan: { tier: 'basic' },
  },
  {
    id: 'u-1',
    email: 'bien-tap@kolearn.test',
    displayName: 'Biên tập viên',
    status: 'ACTIVE',
    emailVerified: true,
    hasPassword: true,
    roles: ['admin', 'content_admin'],
    createdAt: '2026-01-08T01:00:00Z',
    lastSeenAt: '2026-09-08T09:00:00Z',
    plan: { tier: 'basic' },
  },
]

/** `roles`, as `GET /admin/roles` answers it — 00003's five, by code. */
export const ADMIN_ROLES = [
  { code: 'admin', description: 'Quản trị hệ thống', requiresMfa: true },
  { code: 'content_admin', description: 'Quản lý ngân hàng đề: xuất bản, gỡ đề', requiresMfa: true },
  { code: 'content_editor', description: 'Soạn đề: tạo và sửa bản nháp', requiresMfa: true },
  { code: 'learner', description: 'Người học', requiresMfa: false },
  { code: 'support', description: 'Hỗ trợ người dùng: chỉ đọc', requiresMfa: true },
]

/** Two devices on one account, so "đăng xuất mọi thiết bị" has something to end. */
export const ADMIN_SESSIONS: Record<string, AdminUserSession[]> = {
  'u-10': [
    {
      id: '8f1b1f2e-0000-4000-8000-000000000001',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) Safari/605.1.15',
      startedAt: '2026-08-30T02:11:00Z',
      lastSeenAt: '2026-09-05T11:30:00Z',
    },
    {
      id: '8f1b1f2e-0000-4000-8000-000000000002',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0',
      startedAt: '2026-09-01T08:00:00Z',
      lastSeenAt: '2026-09-04T13:45:00Z',
    },
  ],
}
