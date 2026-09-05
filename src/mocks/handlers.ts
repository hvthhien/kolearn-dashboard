import { http, HttpResponse } from 'msw'
import type {
  AdminDictationApprovalRequest,
  AdminDictationPublishReport,
  AdminDictationSetDetail,
  AdminExamDetail,
  AdminShadowVideoDetail,
  ShadowPublishReport,
  CreateRedeemCodesRequest,
  RedeemCode,
  AdminPaymentOrder,
  AdminUser,
  BankTransaction,
  ConfirmPaymentOrderRequest,
  GrantPlanRequest,
  MatchBankTransactionRequest,
  AdminQuestion,
  AdminQuestionRow,
  AuthTokens,
  ImportReport,
  PublishReport,
  SaveQuestionRequest,
  UpdateExamRequest,
} from '../api/gen/model'
import { BLUEPRINTS } from './fixtures/blueprints'
import { TOPICS } from './fixtures/topics'
import { EXAMS, LISTENING_PASSAGE, QUESTIONS, READING_PASSAGE, layers } from './fixtures/bank'
import { SHADOW_VIDEOS } from './fixtures/shadowing'
import { DICTATION_SETS } from './fixtures/dictation'
import { CODE_REDEMPTIONS, REDEEM_CODES } from './fixtures/billing'
import { ADMIN_USERS, BANK_TRANSACTIONS, PAYMENT_ORDERS } from './fixtures/orders'

/**
 * The mock backend, shared by `npm run dev` and by the test suite.
 *
 * One set of handlers rather than two, because the alternative is a dev server
 * and a test suite that disagree about what the API does — and the one that
 * disagrees with the eventual server is whichever nobody was looking at.
 *
 * It holds mutable state on purpose. A save that does not change what the next
 * GET returns cannot demonstrate that a save works, and three of the criteria
 * (301-3, 301-6, 301-8) are statements about what happens *after* a write.
 */

const BASE = '/api/v1'

interface State {
  exams: AdminExamDetail[]
  questions: AdminQuestion[]
  /** The publish gate's verdict is computed, not stored — see `gate` below. */
  published: Set<string>
  videos: AdminShadowVideoDetail[]
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

let state: State = {
  exams: clone(EXAMS),
  questions: clone(QUESTIONS),
  published: new Set(EXAMS.filter((e) => e.status === 'PUBLISHED').map((e) => e.id)),
  videos: clone(SHADOW_VIDEOS),
}

/** Tests call this so one test's save is not the next test's starting point. */
/**
 * Mutable dictation state.
 *
 * Reset by resetMockBank, which src/test/setup.ts runs after every test — a
 * verdict recorded by one test would otherwise be the next test's starting
 * point, which is the coupling that makes a suite pass in order and fail alone.
 */
const dictationState = {
  sets: clone(DICTATION_SETS) as Record<string, AdminDictationSetDetail>,
}

/**
 * The two category vocabularies, separate here exactly as they are in the
 * database (migration 00035). Seeded with a couple of the names the migration
 * inserts, so the picker is not empty on a screen nobody has set up.
 */
interface MockCategory {
  id: string
  slug: string
  name: string
  ordinal: number
}

const SHADOW_CATEGORIES: MockCategory[] = [
  { id: 'sc-1', slug: 'hoi-thoai-hang-ngay', name: 'Hội thoại hàng ngày', ordinal: 10 },
  { id: 'sc-2', slug: 'tin-tuc', name: 'Tin tức', ordinal: 20 },
]

const DICTATION_CATEGORIES: MockCategory[] = [
  { id: 'dc-1', slug: 'cong-viec', name: 'Công việc', ordinal: 10 },
  { id: 'dc-2', slug: 'tin-tuc', name: 'Tin tức', ordinal: 20 },
]

const categoryState = {
  shadow: clone(SHADOW_CATEGORIES) as MockCategory[],
  dictation: clone(DICTATION_CATEGORIES) as MockCategory[],
}

/**
 * Mã nâng cấp. Mutable for the same reason the bank is: issuing and revoking
 * are writes, and a write the next GET does not reflect proves nothing.
 */
const billingState = {
  codes: clone(REDEEM_CODES) as RedeemCode[],
  orders: clone(PAYMENT_ORDERS) as AdminPaymentOrder[],
  transactions: clone(BANK_TRANSACTIONS) as BankTransaction[],
  users: clone(ADMIN_USERS) as AdminUser[],
}

/** Pays an order the way the server does: status, amounts, and the learner's plan. */
function settleOrder(order: AdminPaymentOrder, paid: number): void {
  order.status = 'PAID'
  order.paidAt = new Date().toISOString()
  order.paidAmountVnd = paid
  const u = billingState.users.find((x) => x.id === order.userId)
  if (u) {
    const from = u.plan.premiumUntil ? new Date(u.plan.premiumUntil) : new Date()
    const until = new Date(Math.max(from.getTime(), Date.now()) + order.days * 86400000)
    u.plan = { tier: 'premium', premiumUntil: until.toISOString() }
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Twelve characters of the server's alphabet, the way the server mints one. */
function mintCode(): string {
  let out = ''
  for (let i = 0; i < 12; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

export function resetMockBank(): void {
  billingState.codes = clone(REDEEM_CODES)
  billingState.orders = clone(PAYMENT_ORDERS)
  billingState.transactions = clone(BANK_TRANSACTIONS)
  billingState.users = clone(ADMIN_USERS)
  state = {
    exams: clone(EXAMS),
    questions: clone(QUESTIONS),
    published: new Set(EXAMS.filter((e) => e.status === 'PUBLISHED').map((e) => e.id)),
    videos: clone(SHADOW_VIDEOS),
  }
  dictationState.sets = clone(DICTATION_SETS)
  categoryState.shadow = clone(SHADOW_CATEGORIES)
  categoryState.dictation = clone(DICTATION_CATEGORIES)
}

/** The studio's copy of a video, for a test that wants to read what a save did. */
export function mockShadowVideo(id: string): AdminShadowVideoDetail | undefined {
  return state.videos.find((v) => v.id === id)
}

/**
 * The studio's half of the gate, computed the way the server computes it so the
 * dialog is exercised against the same rules rather than a fixture of them.
 */
function summarise(video: AdminShadowVideoDetail) {
  let approved = 0
  let rejected = 0
  let unreviewed = 0
  for (const l of video.lines) {
    if (l.approval.verdict === 'APPROVED' && !l.approval.stale) approved++
    else if (l.approval.verdict === 'REJECTED') rejected++
    else unreviewed++
  }
  return { total: video.lines.length, approved, rejected, unreviewed }
}

function shadowGate(video: AdminShadowVideoDetail): ShadowPublishReport {
  const blockers: string[] = []
  const warnings: string[] = []

  if (!video.asset) blockers.push('Chưa có video.')
  if (video.lines.length === 0) blockers.push('Chưa có lời thoại chia câu.')

  for (const line of video.lines) {
    if (line.approval.verdict === 'REJECTED') {
      blockers.push(`Câu ${line.ordinal}: chưa đạt — ${line.approval.note ?? ''}.`)
    } else if (line.approval.verdict === 'UNREVIEWED') {
      blockers.push(`Câu ${line.ordinal}: chưa nghe duyệt.`)
    } else if (line.approval.stale) {
      blockers.push(`Câu ${line.ordinal}: đã sửa sau khi duyệt, cần nghe lại.`)
    }
    if (!line.textVi) warnings.push(`Câu ${line.ordinal}: chưa có bản dịch tiếng Việt.`)
  }

  for (const entry of video.glossary) {
    if (!entry.contextSettled) {
      blockers.push(`Từ "${entry.headwordKo}": chưa chốt nghĩa trong ngữ cảnh.`)
    }
  }

  return { published: false, blockers, warnings }
}

export function mockQuestion(id: string): AdminQuestion | undefined {
  return state.questions.find((q) => q.id === id)
}

export const MOCK_USER: AuthTokens['user'] = {
  id: 'u-1',
  email: 'bien-tap@kolearn.test',
  emailVerified: true,
  hasPassword: true,
  displayName: 'Biên tập viên',
  locale: 'vi',
  // A staff account has no plan worth showing, but the field is required on
  // every CurrentUser and a mock that omits it is a client that never
  // learns to read it.
  plan: { tier: 'basic' },
  roles: ['content_admin', 'admin'],
  permissions: [
    // Billing. Held by admin alone in 00046, so the mock account wears both
    // hats — otherwise the Thanh toán screen would be unreachable offline.
    'billing:manage',
    'exam:read',
    'exam:write',
    'exam:publish',
    'question:write',
    'passage:write',
    'asset:write',
    'topic:manage',
    'import:manage',
    // Nhại theo. content_admin holds all four in 00022's seed, including
    // shadowing:approve — which is the same account editing and passing its own
    // lines, and is why the publish gate reports self-approval as a warning.
    'shadowing:read:any',
    'shadowing:write',
    'shadowing:approve',
    'shadowing:publish',
    // Chép chính tả. content_admin holds all four in 00023's seed, and this
    // list was one short of it until the studio grew a write of its own —
    // dictation:write had been seeded and mounted on no route, so nothing
    // noticed. A permission the mock omits is a button the tests never see.
    'dictation:read:any',
    'dictation:write',
    'dictation:approve',
    'dictation:publish',
  ],
}

const TOKENS: AuthTokens = { accessToken: 'mock-access-token', expiresIn: 900, user: MOCK_USER }

function row(q: AdminQuestion): AdminQuestionRow {
  return {
    id: q.id,
    ordinal: q.ordinal,
    displayOrdinal: q.displayOrdinal,
    sectionKind: q.sectionKind,
    type: q.type,
    stemKo: q.stemKo,
    layerStatus: layers(q),
    difficultyManual: q.difficultyManual,
    choiceCount: q.choices.length,
    correctChoiceCount: q.choices.filter((c) => c.isCorrect).length,
    attemptedCount: q.attemptedCount,
  }
}

/**
 * The release gate, the same split `bank.Publish` makes: a blocker refuses,
 * a warning does not (TCCN-301-7). GĐ-4's two halves are both here and land
 * on different sides of the line by design — the wrong shape of a question is
 * blocking, an unassigned difficulty is not (TCCN-301-10, TCCN-303-3).
 */
function gate(exam: AdminExamDetail): PublishReport {
  const questions = state.questions.filter((q) => q.examId === exam.id)
  const blockers: string[] = []
  const warnings: string[] = []

  for (const q of questions) {
    if (q.type !== 'MCQ') continue
    // Named per question, not counted in aggregate: "3 câu hỏng" sends the
    // author back through fifty questions to find which three.
    if (q.choices.length !== 4) {
      blockers.push(`Câu ${q.ordinal}: có ${q.choices.length} lựa chọn, phải đúng 4 (GĐ-4).`)
    }
    const correct = q.choices.filter((c) => c.isCorrect).length
    if (correct !== 1) {
      blockers.push(`Câu ${q.ordinal}: có ${correct} đáp án đúng, phải đúng 1 (GĐ-4).`)
    }
    if (!q.explanationCorrectKo) {
      warnings.push(`Câu ${q.ordinal}: chưa soạn tầng 2 — vì sao đáp án đúng là đúng.`)
    }
    if (!q.stemVi || q.choices.some((c) => !c.textVi)) {
      warnings.push(`Câu ${q.ordinal}: chưa có bản dịch tiếng Việt đầy đủ (YC-121).`)
    }
  }

  for (const section of exam.sections) {
    if (section.authoredCount === 0) {
      warnings.push(
        `Phần ${section.kind} chưa có câu nào — đề này xuất bản được để Luyện tập, ` +
          'nhưng không dùng cho Thi thử.',
      )
    }
  }

  const unassigned = questions.filter((q) => q.difficultyManual == null).length
  if (unassigned > 0) {
    warnings.push(`${unassigned} câu chưa gắn độ khó (YC-303).`)
  }

  return {
    examCode: exam.code,
    published: false,
    blockers,
    warnings,
    unassignedDifficultyCount: unassigned,
  }
}

/** `null` for anything blank. An empty string is not an unwritten layer. */
function nullIfBlank(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

const SHADOW_UPLOAD_ORIGIN = 'https://media.mock.local'


/**
 * `unreviewed` counts STALE approvals, exactly as the server does — a verdict
 * about a sentence that has since been edited is not a verdict, and the counter
 * has to agree with the gate about that.
 */
function summariseDictation(set: AdminDictationSetDetail) {
  let approved = 0
  let rejected = 0
  let unreviewed = 0
  for (const item of set.items) {
    if (item.approval.verdict === 'APPROVED' && !item.approval.stale) approved++
    else if (item.approval.verdict === 'REJECTED') rejected++
    else unreviewed++
  }
  return { total: set.items.length, approved, rejected, unreviewed }
}

function dictationGate(set: AdminDictationSetDetail): AdminDictationPublishReport {
  const blockers: string[] = []
  const warnings: string[] = []

  for (const item of set.items) {
    if (item.approval.verdict === 'REJECTED') {
      blockers.push(`Câu ${item.ordinal}: chưa đạt — ${item.approval.note ?? ''}.`)
    } else if (item.approval.verdict === 'UNREVIEWED') {
      blockers.push(`Câu ${item.ordinal}: chưa nghe duyệt.`)
    } else if (item.approval.stale) {
      blockers.push(`Câu ${item.ordinal}: đã sửa sau khi duyệt, cần nghe lại.`)
    }
    if (item.textVi.trim() === '') {
      warnings.push(`Câu ${item.ordinal}: chưa có bản dịch tiếng Việt.`)
    }
  }
  for (const entry of set.glossary) {
    if (!entry.contextSettled) {
      blockers.push(`Từ "${entry.headwordKo}": chưa chốt nghĩa trong ngữ cảnh.`)
    }
  }
  return { published: false, blockers, warnings }
}

/**
 * The server's tag rule, in the shape the screens depend on: trim, collapse
 * whitespace, drop blanks, de-duplicate case-insensitively, cap at twelve.
 *
 * Repeated here rather than stubbed, because the whole reason the studio can
 * offer a plain comma-separated text field is that this normalisation happens
 * on the way in — a mock that stored what it was handed would let a test pass
 * on an interface the real server would have tidied underneath.
 */
function normaliseTags(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ')
    if (name === '' || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
    if (out.length === 12) break
  }
  return out.sort((a, b) => a.localeCompare(b, 'vi'))
}

/** The server's Slugify, for the create endpoint's derived slug. Vietnamese
 *  diacritics come off by table because đ is not a d with a mark on it. */
function slugify(name: string): string {
  const from = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ'
  const to = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  return name
    .toLowerCase()
    .split('')
    .map((ch) => {
      const i = from.indexOf(ch)
      if (i >= 0) return to[i]
      return /[a-z0-9]/.test(ch) ? ch : '-'
    })
    .join('')
    .split('-')
    .filter(Boolean)
    .join('-')
}

/**
 * One feature's category CRUD, since the two differ only in their URL prefix
 * and in what they count.
 *
 * `decorate` is the whole difference: shadowing counts videos, dictation counts
 * sets, and each names its counts after its own noun. A shared field would have
 * to be called something neither screen says.
 *
 * `read` is a thunk rather than an array so `resetMockBank` can replace the
 * array wholesale between tests without these closures holding the old one.
 */
function categoryRoutes(
  feature: 'shadowing' | 'dictation',
  read: () => MockCategory[],
  decorate: (c: MockCategory) => Record<string, unknown>,
) {
  const path = `${BASE}/admin/${feature}/categories`
  const ordered = () => [...read()].sort((a, b) => a.ordinal - b.ordinal || a.name.localeCompare(b.name, 'vi'))

  const taken = (slug: string, exceptId?: string) =>
    read().some((c) => c.slug === slug && c.id !== exceptId)

  const conflict = () =>
    HttpResponse.json(
      {
        title: 'Xung đột',
        status: 409,
        code: `${feature}_category_slug_taken`,
        detail: 'Đường dẫn này đã có chủ đề khác dùng',
      },
      { status: 409 },
    )

  const unprocessable = (code: string, detail: string) =>
    HttpResponse.json({ title: 'Dữ liệu không hợp lệ', status: 422, code, detail }, { status: 422 })

  return [
    http.get(path, () => HttpResponse.json({ items: ordered().map(decorate) })),

    http.post(path, async ({ request }) => {
      const body = (await request.json()) as { name: string; slug?: string; ordinal?: number }
      const name = body.name.trim()
      if (name === '') {
        return unprocessable(`${feature}_category_name_required`, 'Chủ đề phải có tên')
      }
      // Derived when absent, which is why a one-field form never mentions a
      // slug. A name with no ASCII left in it yields nothing, and the server
      // asks for one rather than writing a row its own CHECK would refuse.
      const slug = (body.slug ?? '').trim() || slugify(name)
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
        return unprocessable(`${feature}_bad_category_slug`, 'Đường dẫn chủ đề không hợp lệ')
      }
      if (taken(slug)) return conflict()

      const created: MockCategory = {
        id: `${feature[0]}c-${slug}`,
        slug,
        name,
        ordinal: body.ordinal ?? 0,
      }
      read().push(created)
      return HttpResponse.json(decorate(created), { status: 201 })
    }),

    http.put(`${path}/:categoryId`, async ({ params, request }) => {
      const category = read().find((c) => c.id === params.categoryId)
      if (!category) return new HttpResponse(null, { status: 404 })

      const body = (await request.json()) as { name: string; slug?: string; ordinal?: number }
      const name = body.name.trim()
      if (name === '') {
        return unprocessable(`${feature}_category_name_required`, 'Chủ đề phải có tên')
      }
      const slug = (body.slug ?? '').trim() || slugify(name)
      if (taken(slug, category.id)) return conflict()

      category.name = name
      category.slug = slug
      category.ordinal = body.ordinal ?? category.ordinal
      return HttpResponse.json(decorate(category))
    }),

    http.delete(`${path}/:categoryId`, ({ params }) => {
      const list = read()
      const at = list.findIndex((c) => c.id === params.categoryId)
      if (at < 0) return new HttpResponse(null, { status: 404 })
      list.splice(at, 1)

      // ON DELETE SET NULL, and never a refusal: the lessons survive and become
      // uncategorised. Refusing would mean an author cannot retire a shelf
      // without re-filing every lesson on it first.
      if (feature === 'shadowing') {
        for (const v of state.videos) {
          if (v.categoryId === params.categoryId) {
            v.categoryId = undefined
            v.categoryName = undefined
          }
        }
      } else {
        for (const st of Object.values(dictationState.sets)) {
          if (st.categoryId === params.categoryId) {
            st.categoryId = undefined
            st.categoryName = undefined
          }
        }
      }
      return new HttpResponse(null, { status: 204 })
    }),
  ]
}

export const handlers = [
  /* ── Thanh toán: đơn chuyển khoản, giao dịch, người dùng (00048) ──────── */
  http.get(`${BASE}/admin/billing/orders`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('status')
    const items = billingState.orders
      .filter((o) => status === null || o.status === status)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    return HttpResponse.json({ items })
  }),
  http.post(`${BASE}/admin/billing/orders/:orderId/confirm`, async ({ params, request }) => {
    const order = billingState.orders.find((o) => o.id === params.orderId)
    if (!order) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Không tìm thấy', status: 404, code: 'order_not_found' },
        { status: 404 },
      )
    }
    if (order.status === 'PAID' || order.status === 'CANCELLED') {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Xung đột trạng thái', status: 409, code: 'order_not_payable' },
        { status: 409 },
      )
    }
    const body = (await request.json()) as ConfirmPaymentOrderRequest
    settleOrder(order, body.paidAmountVnd ?? order.amountVnd)
    order.note = body.note ?? ''
    return HttpResponse.json(order)
  }),
  http.get(`${BASE}/admin/billing/transactions`, ({ request }) => {
    const matched = new URL(request.url).searchParams.get('matched')
    const items = billingState.transactions.filter(
      (t) => matched !== 'false' || t.matchedOrderId === undefined,
    )
    return HttpResponse.json({ items })
  }),
  http.post(
    `${BASE}/admin/billing/transactions/:transactionId/match`,
    async ({ params, request }) => {
      const txn = billingState.transactions.find((t) => t.id === params.transactionId)
      if (!txn) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Không tìm thấy', status: 404, code: 'transaction_not_found' },
          { status: 404 },
        )
      }
      if (txn.matchedOrderId !== undefined) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Xung đột trạng thái', status: 409, code: 'transaction_already_matched' },
          { status: 409 },
        )
      }
      const body = (await request.json()) as MatchBankTransactionRequest
      const order = billingState.orders.find((o) => o.id === body.orderId)
      if (!order || order.status === 'PAID' || order.status === 'CANCELLED') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Xung đột trạng thái', status: 409, code: 'order_not_payable' },
          { status: 409 },
        )
      }
      settleOrder(order, txn.amountVnd)
      txn.matchedOrderId = order.id
      return HttpResponse.json(order)
    },
  ),
  http.get(`${BASE}/admin/users`, ({ request }) => {
    const email = (new URL(request.url).searchParams.get('email') ?? '').toLowerCase()
    return HttpResponse.json({
      items: email === '' ? [] : billingState.users.filter((u) => u.email.startsWith(email)),
    })
  }),
  http.post(`${BASE}/admin/users/:userId/plan`, async ({ params, request }) => {
    const u = billingState.users.find((x) => x.id === params.userId)
    if (!u) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Không tìm thấy', status: 404, code: 'user_not_found' },
        { status: 404 },
      )
    }
    const body = (await request.json()) as GrantPlanRequest
    const from = u.plan.premiumUntil ? new Date(u.plan.premiumUntil) : new Date()
    const until = new Date(Math.max(from.getTime(), Date.now()) + body.days * 86400000)
    u.plan = { tier: 'premium', premiumUntil: until.toISOString() }
    return HttpResponse.json(u)
  }),

  /* ── Thanh toán: mã nâng cấp (00046) ──────────────────────────────────── */
  http.get(`${BASE}/admin/billing/codes`, () =>
    HttpResponse.json({
      items: [...billingState.codes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    }),
  ),
  http.post(`${BASE}/admin/billing/codes`, async ({ request }) => {
    const body = (await request.json()) as CreateRedeemCodesRequest
    const count = body.count ?? 1
    const minted: RedeemCode[] = []
    for (let i = 0; i < count; i++) {
      minted.push({
        id: `rc-${Date.now()}-${i}`,
        code: mintCode(),
        days: body.days,
        maxUses: body.maxUses,
        uses: 0,
        expiresAt: body.expiresAt,
        note: body.note ?? '',
        // A millisecond apart so "newest first" holds inside a batch too.
        createdAt: new Date(Date.now() + i).toISOString(),
      })
    }
    billingState.codes.push(...minted)
    return HttpResponse.json({ items: minted }, { status: 201 })
  }),
  http.post(`${BASE}/admin/billing/codes/:codeId/revoke`, ({ params }) => {
    const code = billingState.codes.find((c) => c.id === params.codeId)
    if (!code) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Không tìm thấy', status: 404, code: 'code_not_found' },
        { status: 404 },
      )
    }
    if (code.revokedAt) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Xung đột trạng thái', status: 409, code: 'code_already_revoked' },
        { status: 409 },
      )
    }
    code.revokedAt = new Date().toISOString()
    return HttpResponse.json(code)
  }),
  http.get(`${BASE}/admin/billing/codes/:codeId/redemptions`, ({ params }) => {
    if (!billingState.codes.some((c) => c.id === params.codeId)) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Không tìm thấy', status: 404, code: 'code_not_found' },
        { status: 404 },
      )
    }
    return HttpResponse.json({ items: CODE_REDEMPTIONS[String(params.codeId)] ?? [] })
  }),

  /* ── Chủ đề (00035) ──────────────────────────────────────────────────── */
  //
  // Two vocabularies, never one, because the server keeps them apart: R-36's
  // two features have different corpora, and a shared shelf would give one
  // screen a chip whose count came from the other's material.

  ...categoryRoutes('shadowing', () => categoryState.shadow, (c) => ({
    ...c,
    videoCount: state.videos.filter((v) => v.categoryId === c.id && v.status === 'PUBLISHED').length,
    totalVideoCount: state.videos.filter((v) => v.categoryId === c.id).length,
  })),

  ...categoryRoutes('dictation', () => categoryState.dictation, (c) => ({
    ...c,
    setCount: Object.values(dictationState.sets).filter(
      (st) => st.categoryId === c.id && st.status === 'PUBLISHED',
    ).length,
    totalSetCount: Object.values(dictationState.sets).filter((st) => st.categoryId === c.id).length,
  })),

  /* ── Xưởng video (SC-VIDEO-STUDIO) ───────────────────────────────────── */

  http.get(`${BASE}/admin/shadowing/videos`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('status')
    const items = state.videos
      .filter((v) => status === null || v.status === status)
      .map((v) => ({
        id: v.id,
        title: v.title,
        level: v.level,
        status: v.status,
        // The field the remove button reads. Omitting it here would make every
        // row look deletable, including the ones learners have practised with.
        publishedAt: v.publishedAt,
        durationMs: v.asset?.durationMs ?? 0,
        lineCount: v.lines.length,
        wordCount: v.glossary.length,
        review: v.review,
        categoryId: v.categoryId,
        categoryName: v.categoryName,
        tags: v.tags,
      }))
    return HttpResponse.json({ items })
  }),

  http.post(`${BASE}/admin/shadowing/videos`, async ({ request }) => {
    const body = (await request.json()) as { title: string; level: number }
    const created: AdminShadowVideoDetail = {
      id: `sv-${state.videos.length + 1}-${body.title.length}`,
      title: body.title,
      level: body.level,
      status: 'DRAFT',
      voice: '',
      voiceKind: 'SYNTHETIC',
      topics: [],
      tags: [],
      lines: [],
      glossary: [],
      review: { total: 0, approved: 0, rejected: 0, unreviewed: 0 },
    }
    state.videos.push(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get(`${BASE}/admin/shadowing/videos/:videoId`, ({ params }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    return video ? HttpResponse.json(video) : new HttpResponse(null, { status: 404 })
  }),

  http.put(`${BASE}/admin/shadowing/videos/:videoId`, async ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      title: string
      level: number
      voice?: string
      voiceKind?: 'HUMAN' | 'SYNTHETIC'
      categoryId?: string
      tags?: string[]
    }
    video.title = body.title
    video.level = body.level
    video.voice = body.voice ?? ''
    video.voiceKind = body.voiceKind ?? 'SYNTHETIC'
    if (body.categoryId !== undefined && body.categoryId !== '') {
      const category = categoryState.shadow.find((c) => c.id === body.categoryId)
      if (!category) {
        return HttpResponse.json(
          {
            title: 'Không tìm thấy',
            status: 404,
            code: 'shadowing_category_not_found',
            detail: 'Không tìm thấy chủ đề này',
          },
          { status: 404 },
        )
      }
      video.categoryId = category.id
      video.categoryName = category.name
    } else {
      // An empty categoryId clears it. There is no "leave it alone": the
      // request is the whole metadata record.
      video.categoryId = undefined
      video.categoryName = undefined
    }
    video.tags = normaliseTags(body.tags ?? [])
    return HttpResponse.json(video)
  }),

  http.put(`${BASE}/admin/shadowing/videos/:videoId/lines`, async ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })

    const body = (await request.json()) as {
      lines: {
        id?: string
        startMs: number
        endMs: number
        textKo: string
        textVi: string
        transcription?: string
        speaker: string
        chunks?: { startMs: number; endMs: number; charStart: number; charEnd: number }[]
      }[]
    }

    video.lines = body.lines.map((incoming, i) => {
      const before = incoming.id ? video.lines.find((l) => l.id === incoming.id) : undefined
      // Only the timing and the Korean retire a verdict: those are the audio a
      // native speaker listened to. Neither a translation edit nor a phiên âm
      // one is — both describe the audio rather than change it.
      const changed =
        before !== undefined &&
        (before.startMs !== incoming.startMs ||
          before.endMs !== incoming.endMs ||
          before.textKo !== incoming.textKo)
      const revision = (before?.revision ?? 0) + (changed ? 1 : 0) || 1

      return {
        id: incoming.id ?? `sl-new-${i}`,
        ordinal: i + 1,
        startMs: incoming.startMs,
        endMs: incoming.endMs,
        textKo: incoming.textKo,
        textVi: incoming.textVi,
        // Absent and empty mean the same thing here, exactly as the API says.
        transcription: incoming.transcription ?? '',
        speaker: incoming.speaker,
        revision,
        approval: before
          ? { ...before.approval, stale: changed || before.approval.stale }
          : { verdict: 'UNREVIEWED' as const, stale: false },
        // The surface is sliced by the server, never sent — so the mock slices
        // it too, or the studio would round-trip a field the real API fills in.
        chunks: (incoming.chunks ?? []).map((c, n) => ({
          ordinal: n + 1,
          startMs: c.startMs,
          endMs: c.endMs,
          charStart: c.charStart,
          charEnd: c.charEnd,
          surfaceKo: [...incoming.textKo].slice(c.charStart, c.charEnd).join(''),
        })),
      }
    })
    video.review = summarise(video)
    return HttpResponse.json(video)
  }),

  http.put(
    `${BASE}/admin/shadowing/videos/:videoId/lines/:lineId/approval`,
    async ({ params, request }) => {
      const video = state.videos.find((v) => v.id === params.videoId)
      const line = video?.lines.find((l) => l.id === params.lineId)
      if (!video || !line) return new HttpResponse(null, { status: 404 })

      const body = (await request.json()) as { verdict: string; note?: string }
      if (body.verdict === 'REJECTED' && !body.note?.trim()) {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Câu chưa đạt phải kèm lý do',
            status: 422,
            code: 'shadowing_reason_required',
            detail: 'Câu chưa đạt phải kèm lý do.',
          },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        )
      }

      line.approval =
        body.verdict === 'UNREVIEWED'
          ? { verdict: 'UNREVIEWED', stale: false }
          : {
              verdict: body.verdict as 'APPROVED' | 'REJECTED',
              note: body.note,
              reviewedAt: '2026-08-21T00:00:00Z',
              reviewedByName: 'Người duyệt',
              // Recorded against the current revision, so it is current.
              stale: false,
            }
      video.review = summarise(video)
      return HttpResponse.json(line)
    },
  ),

  http.put(`${BASE}/admin/shadowing/videos/:videoId/glossary`, async ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })

    const body = (await request.json()) as {
      entries: {
        id?: string
        headwordKo: string
        meaningVi: string
        contextMeaningVi: string
        contextSettled: boolean
        partOfSpeech: string
        readingLatin?: string
        occurrences: { lineId: string; charStart: number; charEnd: number; surfaceKo: string }[]
      }[]
    }

    // The server's rule, mirrored so the 422 path is exercised rather than
    // assumed (TCCN-354-3).
    const norm = (v: string) => v.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
    const offender = body.entries.find(
      (e) => e.contextSettled && norm(e.contextMeaningVi) === norm(e.meaningVi),
    )
    if (offender) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Nghĩa trong ngữ cảnh đang trùng nghĩa chung',
          status: 422,
          code: 'shadowing_context_meaning_repeated',
          detail: `Từ “${offender.headwordKo}”: nghĩa trong ngữ cảnh giống hệt nghĩa chung, không chốt được.`,
        },
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }

    video.glossary = body.entries.map((e, i) => ({
      id: e.id || `sg-new-${i}`,
      headwordKo: e.headwordKo,
      readingLatin: e.readingLatin ?? '',
      partOfSpeech: e.partOfSpeech as AdminShadowVideoDetail['glossary'][number]['partOfSpeech'],
      meaningVi: e.meaningVi,
      contextMeaningVi: e.contextMeaningVi,
      contextSettled: e.contextSettled,
      occurrences: e.occurrences,
    }))
    return HttpResponse.json(video)
  }),

  http.post(`${BASE}/admin/shadowing/videos/:videoId/upload-target`, ({ params }) => {
    return HttpResponse.json({
      url: `${SHADOW_UPLOAD_ORIGIN}/shadowing/${String(params.videoId)}/mock.mp4`,
      method: 'PUT',
      // Opaque to the client: it echoes what was signed.
      headers: { 'Content-Type': 'video/mp4' },
      objectKey: `shadowing/${String(params.videoId)}/mock.mp4`,
      expiresAt: '2026-08-21T00:15:00Z',
    })
  }),

  /* The direct-to-storage PUT. Required rather than optional: `src/test/setup.ts`
     runs with `onUnhandledRequest: 'error'`, and this request deliberately goes
     to a third-party origin rather than through the API. */
  http.put(`${SHADOW_UPLOAD_ORIGIN}/*`, () => new HttpResponse(null, { status: 200 })),

  http.post(`${BASE}/admin/shadowing/videos/:videoId/uploaded`, async ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { objectKey: string; durationMs: number }

    video.asset = {
      assetId: `a-${video.id}`,
      playbackUrl: `https://media.test/${body.objectKey}`,
      objectKey: body.objectKey,
      byteSize: 3_601_997,
      mimeType: 'video/mp4',
      durationMs: body.durationMs,
    }
    // Every line now describes audio nobody has heard.
    video.lines = video.lines.map((l) => ({
      ...l,
      revision: l.revision + 1,
      approval: { ...l.approval, stale: l.approval.verdict !== 'UNREVIEWED' },
    }))
    video.review = summarise(video)
    return HttpResponse.json(video)
  }),

  /* Removing a video is two operations, and which one applies is decided by
     published_at rather than by the caller. The mock enforces the same refusal
     the server does, because a screen tested against a mock that let a
     published row be deleted is a screen tested against fiction. */

  http.delete(`${BASE}/admin/shadowing/videos/:videoId`, ({ params }) => {
    const i = state.videos.findIndex((v) => v.id === params.videoId)
    const video = state.videos[i]
    if (!video) return new HttpResponse(null, { status: 404 })
    if (video.publishedAt) {
      return HttpResponse.json(
        {
          title: 'Xung đột trạng thái',
          status: 409,
          code: 'shadowing_video_published',
          detail: 'Video này đã từng xuất bản nên không xoá được — hãy gỡ khỏi ngân hàng',
        },
        { status: 409 },
      )
    }
    state.videos.splice(i, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${BASE}/admin/shadowing/videos/:videoId/retire`, ({ params }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })
    if (!video.publishedAt) {
      return HttpResponse.json(
        {
          title: 'Xung đột trạng thái',
          status: 409,
          code: 'shadowing_video_never_published',
          detail:
            'Video này chưa từng xuất bản nên không có gì để gỡ — xoá hẳn nếu không cần nữa',
        },
        { status: 409 },
      )
    }
    video.status = 'RETIRED'
    // publishedAt survives. It is the record that this video once went out, and
    // it is what keeps the delete above refusing afterwards.
    return HttpResponse.json(video)
  }),

  http.post(`${BASE}/admin/shadowing/videos/:videoId/publish`, ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })

    const url = new URL(request.url)
    const report = shadowGate(video)
    if (url.searchParams.get('dryRun') === 'true' || report.blockers.length > 0) {
      return HttpResponse.json(report)
    }
    if (report.warnings.length > 0 && url.searchParams.get('acceptWarnings') !== 'true') {
      return HttpResponse.json(report)
    }
    video.status = 'PUBLISHED'
    // Stamped, not merely flagged. published_at is what the server's delete
    // gate reads, so a mock that only moved `status` would let the screen offer
    // "Xoá" on a video the real backend refuses to delete.
    video.publishedAt = '2026-08-23T09:00:00Z'
    return HttpResponse.json({ ...report, published: true })
  }),

  // ── chép chính tả ────────────────────────────────────────────────────────
  //
  // Read-only about the content on purpose, matching the real surface: sets
  // arrive through cmd/dictation-import and the only write here is the verdict.

  http.get(`${BASE}/admin/dictation/sets`, ({ request }) => {
    const wanted = new URL(request.url).searchParams.get('status')
    const items = Object.values(dictationState.sets)
      .filter((set) => !wanted || set.status === wanted)
      .map((set) => ({
        id: set.id,
        title: set.title,
        level: set.level,
        voice: set.voice,
        voiceKind: set.voiceKind,
        status: set.status,
        publishedAt: set.publishedAt,
        review: summariseDictation(set),
        categoryId: set.categoryId,
        categoryName: set.categoryName,
        tags: set.tags,
      }))
    return HttpResponse.json({ items })
  }),

  http.get(`${BASE}/admin/dictation/sets/:setId`, ({ params }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json({ ...set, review: summariseDictation(set) })
  }),

  http.put(
    `${BASE}/admin/dictation/sets/:setId/items/:itemId/approval`,
    async ({ params, request }) => {
      const set = dictationState.sets[params.setId as string]
      const item = set?.items.find((i) => i.id === params.itemId)
      if (!set || !item) return new HttpResponse(null, { status: 404 })

      const body = (await request.json()) as AdminDictationApprovalRequest
      if (body.verdict === 'REJECTED' && (body.note ?? '').trim() === '') {
        // The server 422s this, and the mock has to as well — a rejection with
        // no reason is a sentence nobody can fix.
        return HttpResponse.json(
          { title: 'Dữ liệu không hợp lệ', status: 422, code: 'dictation_reason_required' },
          { status: 422 },
        )
      }

      item.approval =
        body.verdict === 'UNREVIEWED'
          ? { verdict: 'UNREVIEWED', stale: false }
          : {
              verdict: body.verdict,
              note: body.note ?? '',
              stale: false,
              reviewedByName: 'Người duyệt',
              reviewedAt: '2026-08-22T10:00:00Z',
            }
      set.review = summariseDictation(set)
      return HttpResponse.json(item)
    },
  ),

  /* The metadata, and only the metadata. Sentences and the dictionary still
     come from cmd/dictation-import — a mock that accepted them would be
     describing an endpoint the server does not have. */

  http.put(`${BASE}/admin/dictation/sets/:setId`, async ({ params, request }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })

    const body = (await request.json()) as {
      title: string
      level: number
      voice?: string
      voiceKind?: 'HUMAN' | 'SYNTHETIC'
      categoryId?: string
      tags?: string[]
    }
    if (body.title.trim() === '') {
      return HttpResponse.json(
        {
          title: 'Dữ liệu không hợp lệ',
          status: 422,
          code: 'dictation_title_required',
          detail: 'Bộ phải có tên',
        },
        { status: 422 },
      )
    }
    set.title = body.title.trim()
    set.level = body.level
    set.voice = body.voice ?? ''
    set.voiceKind = body.voiceKind ?? 'SYNTHETIC'
    if (body.categoryId !== undefined && body.categoryId !== '') {
      const category = categoryState.dictation.find((c) => c.id === body.categoryId)
      if (!category) {
        return HttpResponse.json(
          {
            title: 'Không tìm thấy',
            status: 404,
            code: 'dictation_category_not_found',
            detail: 'Không tìm thấy chủ đề này',
          },
          { status: 404 },
        )
      }
      set.categoryId = category.id
      set.categoryName = category.name
    } else {
      set.categoryId = undefined
      set.categoryName = undefined
    }
    set.tags = normaliseTags(body.tags ?? [])
    // Not a verdict in sight, which is the whole contract of this endpoint: a
    // rename is the same audio saying the same sentences.
    return HttpResponse.json({ ...set, review: summariseDictation(set) })
  }),

  http.delete(`${BASE}/admin/dictation/sets/:setId`, ({ params }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })
    if (set.publishedAt) {
      return HttpResponse.json(
        {
          title: 'Xung đột trạng thái',
          status: 409,
          code: 'dictation_set_published',
          detail: 'Bộ này đã từng xuất bản nên không xoá được — hãy gỡ khỏi ngân hàng',
        },
        { status: 409 },
      )
    }
    delete dictationState.sets[params.setId as string]
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${BASE}/admin/dictation/sets/:setId/retire`, ({ params }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })
    if (!set.publishedAt) {
      return HttpResponse.json(
        {
          title: 'Xung đột trạng thái',
          status: 409,
          code: 'dictation_set_never_published',
          detail: 'Bộ này chưa từng xuất bản nên không có gì để gỡ — xoá hẳn nếu không cần nữa',
        },
        { status: 409 },
      )
    }
    set.status = 'RETIRED'
    // publishedAt survives — see the shadowing retire handler above.
    return HttpResponse.json({ ...set, review: summariseDictation(set) })
  }),

  http.post(`${BASE}/admin/dictation/sets/:setId/publish`, ({ params, request }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })

    const url = new URL(request.url)
    const report = dictationGate(set)
    if (url.searchParams.get('dryRun') === 'true' || report.blockers.length > 0) {
      return HttpResponse.json(report)
    }
    if (report.warnings.length > 0 && url.searchParams.get('acceptWarnings') !== 'true') {
      return HttpResponse.json(report)
    }
    set.status = 'PUBLISHED'
    // Stamped, not merely flagged — see the shadowing publish handler above.
    set.publishedAt = '2026-08-23T09:00:00Z'
    return HttpResponse.json({ ...report, published: true })
  }),

  http.post(`${BASE}/auth/login`, () => HttpResponse.json(TOKENS)),
  http.post(`${BASE}/auth/refresh`, () => HttpResponse.json(TOKENS)),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/me`, () => HttpResponse.json(MOCK_USER)),

  http.get(`${BASE}/admin/blueprints`, () => HttpResponse.json({ items: BLUEPRINTS })),

  http.get(`${BASE}/admin/exams`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const level = url.searchParams.get('level')
    const items = state.exams
      .filter((e) => !status || e.status === status)
      .filter((e) => !level || e.level === level)
    return HttpResponse.json({ items })
  }),

  http.get(`${BASE}/admin/exams/:examId`, ({ params }) => {
    const exam = state.exams.find((e) => e.id === params.examId)
    if (!exam) return notFound('Không tìm thấy đề này.')
    return HttpResponse.json(exam)
  }),

  // The rename, mirroring the server's refusals rather than only its success:
  // a mock that always says yes cannot demonstrate that the screen renders a
  // 422, which is the half of this form worth testing.
  http.patch(`${BASE}/admin/exams/:examId`, async ({ params, request }) => {
    const exam = state.exams.find((e) => e.id === params.examId)
    if (!exam) return notFound('Không tìm thấy đề này.')

    const body = (await request.json()) as UpdateExamRequest
    const title = body.title.trim()
    if (title === '') {
      return problem(422, 'exam_title_required', 'Đề phải có tên')
    }
    if ([...title].length > MAX_EXAM_TITLE_LENGTH) {
      return problem(422, 'exam_title_too_long',
        `Tên đề dài quá ${MAX_EXAM_TITLE_LENGTH} ký tự`)
    }

    // Written into the shared fixture, so the list screen and a re-fetch of the
    // detail both see the new name — a rename the next GET does not report is
    // not a rename.
    exam.title = title
    return HttpResponse.json(exam)
  }),

  http.get(`${BASE}/admin/exams/:examId/questions`, ({ params }) => {
    const exam = state.exams.find((e) => e.id === params.examId)
    if (!exam) return notFound('Không tìm thấy đề này.')
    const items = state.questions
      .filter((q) => q.examId === exam.id)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map(row)
    return HttpResponse.json({ items })
  }),

  http.post(`${BASE}/admin/exams/:examId/publish`, ({ params, request }) => {
    const exam = state.exams.find((e) => e.id === params.examId)
    if (!exam) return notFound('Không tìm thấy đề này.')
    const url = new URL(request.url)
    const dryRun = url.searchParams.get('dryRun') === 'true'
    const acceptWarnings = url.searchParams.get('acceptWarnings') === 'true'

    const report = gate(exam)
    const wouldPublish =
      report.blockers.length === 0 && (report.warnings.length === 0 || acceptWarnings)

    if (!dryRun && wouldPublish) {
      exam.status = 'PUBLISHED'
      exam.publishedAt = '2026-08-18T00:00:00Z'
      state.published.add(exam.id)
      report.published = true
    }
    return HttpResponse.json(report)
  }),

  http.get(`${BASE}/admin/questions/:questionId`, ({ params }) => {
    const q = state.questions.find((x) => x.id === params.questionId)
    if (!q) return notFound('Không tìm thấy câu hỏi này.')
    return HttpResponse.json({ ...q, layerStatus: layers(q) })
  }),

  http.put(`${BASE}/admin/questions/:questionId`, async ({ params, request }) => {
    const q = state.questions.find((x) => x.id === params.questionId)
    if (!q) return notFound('Không tìm thấy câu hỏi này.')
    const body = (await request.json()) as SaveQuestionRequest

    // The one refusal. Everything else about a half-built question saves.
    const keyChanged = body.choices.some((c) => {
      const before = q.choices.find((x) => x.ordinal === c.ordinal)
      return !before || before.isCorrect !== c.isCorrect
    })
    if (keyChanged && q.attemptedCount > 0) {
      return HttpResponse.json(
        {
          type: '/problems/question-answer-locked',
          title: 'Không sửa được đáp án của câu đã có người làm',
          status: 409,
          code: 'question_answer_locked',
          detail:
            `Câu ${q.ordinal} đã nằm trong ${q.attemptedCount} lượt làm bài đã nộp. ` +
            'Đổi đáp án sẽ viết lại điểm và nhật ký lỗi của tất cả các lượt đó. ' +
            'Hãy tạo một phiên bản mới của câu hỏi.',
          attemptedCount: q.attemptedCount,
          questionOrdinal: q.ordinal,
        },
        { status: 409, headers: { 'content-type': 'application/problem+json' } },
      )
    }

    q.stemKo = body.stemKo
    q.stemVi = body.stemVi ?? ''
    q.explanationCorrectKo = nullIfBlank(body.explanationCorrectKo)
    q.explanationCorrectVi = nullIfBlank(body.explanationCorrectVi)
    q.explanationWrongGenericKo = nullIfBlank(body.explanationWrongGenericKo)
    q.explanationWrongGenericVi = nullIfBlank(body.explanationWrongGenericVi)
    q.difficultyManual = body.difficultyManual ?? null
    q.choices = body.choices.map((c) => ({
      ...c,
      textVi: c.textVi ?? '',
      whyWrongKo: nullIfBlank(c.whyWrongKo),
      whyWrongVi: nullIfBlank(c.whyWrongVi),
    }))
    q.evidence = body.evidence ?? []
    q.topics = (body.topicIds ?? []).flatMap((id) => {
      const t = TOPICS.find((x) => x.id === id)
      return t ? [{ topicId: t.id, name: t.name, category: t.category, note: '' }] : []
    })
    q.layerStatus = layers(q)
    return HttpResponse.json(q)
  }),

  http.post(`${BASE}/admin/questions/:questionId/versions`, ({ params }) => {
    const q = state.questions.find((x) => x.id === params.questionId)
    if (!q) return notFound('Không tìm thấy câu hỏi này.')
    const copy: AdminQuestion = {
      ...clone(q),
      id: `${q.id}-v2`,
      attemptedCount: 0,
      supersededByQuestionId: null,
    }
    q.supersededByQuestionId = copy.id
    state.questions.push(copy)
    return HttpResponse.json(copy, { status: 201 })
  }),

  http.get(`${BASE}/admin/passages/:passageId`, ({ params }) => {
    const p = [READING_PASSAGE, LISTENING_PASSAGE].find((x) => x.id === params.passageId)
    if (!p) return notFound('Không tìm thấy ngữ liệu này.')
    return HttpResponse.json(p)
  }),

  http.get(`${BASE}/topics`, ({ request }) => {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const category = url.searchParams.get('category')
    const items = TOPICS.filter((t) => !category || t.category === category)
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      // Curated first, the ranking the catalogue's `is_system` column exists for.
      .sort((a, b) => Number(b.isSystem) - Number(a.isSystem))
    return HttpResponse.json({ items })
  }),

  http.post(`${BASE}/admin/imports/dry-run`, () => HttpResponse.json(IMPORT_REPORT)),

  http.post(`${BASE}/admin/imports`, () =>
    HttpResponse.json({ ...IMPORT_REPORT, dryRun: false }),
  ),
]

/**
 * The dry run and the real run report the same numbers, because TCCN-301-6
 * says the run that follows must produce exactly what the preview reported.
 *
 * `ok: false` with issues is the shape the server sends when the gate refuses:
 * a 200 carrying the verdict, not a problem+json, because the report is the
 * answer the screen needs rather than a failure of the request.
 */
const IMPORT_REPORT: ImportReport = {
  dryRun: true,
  examCode: 'TOPIK-II-102',
  ok: false,
  passages: 12,
  questions: 50,
  choices: 200,
  topics: 34,
  topicsNew: 3,
  translationCoverage: 0.86,
  issues: [
    { where: 'questions[14].choices', message: 'Chỉ có 3 lựa chọn, phải đúng 4 (GĐ-4).' },
    { where: 'questions[27].evidence', message: 'Căn cứ trỏ tới đoạn văn không tồn tại: p-reading-9.' },
  ],
}

/** The server's cap on `UpdateExamRequest.title`, in characters. */
const MAX_EXAM_TITLE_LENGTH = 200

function problem(status: number, code: string, detail: string) {
  return HttpResponse.json(
    { type: `/problems/${code}`, title: 'Dữ liệu không hợp lệ', status, code, detail },
    { status, headers: { 'content-type': 'application/problem+json' } },
  )
}

function notFound(detail: string) {
  return HttpResponse.json(
    { type: '/problems/not-found', title: 'Không tìm thấy', status: 404, code: 'not_found', detail },
    { status: 404, headers: { 'content-type': 'application/problem+json' } },
  )
}
