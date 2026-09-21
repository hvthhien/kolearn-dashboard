import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getListPromoCodesQueryKey,
  useCreatePromoCode,
  useListPremiumProducts,
  useListPromoCodeUses,
  useListPromoCodes,
  useRevokePromoCode,
} from '../api/gen/kolearn'
import type { PromoCode, PromoCodeKind } from '../api/gen/model'
import { userMessage } from '../lib/problem'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorNote,
  PageShell,
  PageTitle,
  Refreshing,
  SkeletonList,
  Table,
  Td,
  TextField,
  Th,
} from '../components/ui'

/**
 * Khuyến mãi — the campaign codes that take money OFF a price.
 *
 * ── Why this is its own screen and not a fifth tab on Thanh toán ───────────
 *
 * Thanh toán is the reconciliation desk: four tabs that all answer "where is
 * this learner's money". Đơn chuyển khoản, Chưa khớp and Người dùng are all
 * questions about one person who has already paid or is trying to; Mã nâng
 * cấp sits with them because handing somebody days is the thing an operator
 * does when that reconciliation goes wrong.
 *
 * A mã khuyến mãi is not that job. It is decided before anybody pays, for
 * nobody in particular, and the question it answers is "how is the Tết
 * campaign doing" — which is a marketing screen, not a support one. They also
 * get used by different people at different times, and a tab that is only
 * opened once a quarter buried behind a desk that is opened daily is a tab
 * nobody finds.
 *
 * ── Two kinds of code, said plainly ───────────────────────────────────────
 *
 * The product now has two and they are opposites. A **mã nâng cấp**
 * (Thanh toán → Mã nâng cấp) grants Premium days and no money moves; a **mã
 * khuyến mãi** here discounts an order that still has to be paid into the
 * bank account. Both screens say which they are in as many words, because
 * "mã" on its own is now ambiguous and the cost of getting it wrong is
 * giving away a year when you meant to give away 20%.
 */

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function vnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} ₫`
}

type PromoState = 'active' | 'revoked' | 'scheduled' | 'expired' | 'exhausted'

/**
 * The state the server would answer a learner with, computed from the same
 * fields it reads — so what the operator sees is what the learner was told.
 *
 * The order matters and mirrors `loadUsablePromo`: revoked first (it reads as
 * `promo_invalid` whatever else is true), then the window, then the counter.
 * `scheduled` is the one state that has no equivalent on a mã nâng cấp — a
 * campaign is written the week before it starts.
 */
export function promoState(c: PromoCode, now = new Date()): PromoState {
  if (c.revokedAt) return 'revoked'
  if (c.startsAt && new Date(c.startsAt) > now) return 'scheduled'
  if (c.expiresAt && new Date(c.expiresAt) <= now) return 'expired'
  if (c.uses >= c.maxUses) return 'exhausted'
  return 'active'
}

const STATE_LABEL: Record<PromoState, { text: string; tone: 'ok' | 'neutral' | 'warn' | 'bad' }> = {
  active: { text: 'đang chạy', tone: 'ok' },
  scheduled: { text: 'chưa bắt đầu', tone: 'warn' },
  revoked: { text: 'đã thu hồi', tone: 'bad' },
  expired: { text: 'hết hạn', tone: 'neutral' },
  exhausted: { text: 'hết lượt', tone: 'neutral' },
}

/** What one code takes off, for the column that has to hold both kinds. */
export function promoValue(c: Pick<PromoCode, 'kind' | 'percent' | 'amountVnd'>): string {
  if (c.kind === 'PERCENT') return `-${c.percent ?? 0}%`
  return `-${vnd(c.amountVnd ?? 0)}`
}

export function PromotionsPage() {
  const [issuing, setIssuing] = useState(false)
  const [revoking, setRevoking] = useState<PromoCode | null>(null)
  const [viewing, setViewing] = useState<PromoCode | null>(null)
  const queryClient = useQueryClient()

  const { data, error, isPending, isFetching } = useListPromoCodes()
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListPromoCodesQueryKey() })

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle>Khuyến mãi</PageTitle>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Mã khuyến mãi giảm giá một đơn chuyển khoản; người học vẫn phải trả phần còn lại.
            Muốn tặng thẳng ngày Premium thì dùng Mã nâng cấp bên Thanh toán.
          </p>
        </div>
        <Button onClick={() => setIssuing(true)}>Tạo mã</Button>
      </div>

      {error !== null && (
        <div className="mt-4">
          <ErrorNote>{userMessage(error)}</ErrorNote>
        </div>
      )}

      {isPending ? (
        <div className="mt-4">
          <SkeletonList rows={3} label="Đang tải mã khuyến mãi…" />
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Chưa có mã khuyến mãi nào"
            action={<Button onClick={() => setIssuing(true)}>Tạo mã đầu tiên</Button>}
          >
            Một mã cho một đợt — ví dụ TET2026 giảm 20% cho mọi thời hạn.
          </EmptyState>
        </div>
      ) : (
        data && (
          <div className="mt-4">
            <Refreshing busy={isFetching}>
              <Table
                caption="Mã khuyến mãi"
                head={
                  <tr>
                    <Th>Mã</Th>
                    <Th>Giảm</Th>
                    <Th>Áp dụng cho</Th>
                    <Th>Lượt</Th>
                    <Th>Thời gian</Th>
                    <Th>Ghi chú</Th>
                    <Th>Trạng thái</Th>
                    <Th className="text-right">Thao tác</Th>
                  </tr>
                }
              >
                {data.items.map((c) => {
                  const state = promoState(c)
                  return (
                    <tr key={c.id}>
                      <Td>
                        <code className="font-mono text-sm tracking-wide">{c.code}</code>
                      </Td>
                      <Td className="font-semibold whitespace-nowrap">{promoValue(c)}</Td>
                      <Td className="max-w-48 truncate">
                        {/* An empty list is every term — the column says so
                            rather than showing a blank cell, which would read
                            as "no terms" and mean the opposite. */}
                        {c.productCodes.length === 0 ? 'Mọi thời hạn' : c.productCodes.join(', ')}
                      </Td>
                      <Td>
                        {c.uses}/{c.maxUses}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {c.startsAt || c.expiresAt
                          ? `${c.startsAt ? day(c.startsAt) : '…'} → ${c.expiresAt ? day(c.expiresAt) : '…'}`
                          : 'Không giới hạn'}
                      </Td>
                      <Td className="max-w-48 truncate">{c.note}</Td>
                      <Td>
                        <Badge tone={STATE_LABEL[state].tone}>{STATE_LABEL[state].text}</Badge>
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setViewing(c)}>
                          Ai đã dùng
                        </Button>
                        {state !== 'revoked' && (
                          <Button variant="ghost" size="sm" onClick={() => setRevoking(c)}>
                            Thu hồi
                          </Button>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </Table>
            </Refreshing>
          </div>
        )
      )}

      <IssueDialog open={issuing} onClose={() => setIssuing(false)} onIssued={refresh} />
      <RevokeDialog code={revoking} onClose={() => setRevoking(null)} onRevoked={refresh} />
      <UsesDialog code={viewing} onClose={() => setViewing(null)} />
    </PageShell>
  )
}

/**
 * The issuing form.
 *
 * One code at a time, where Mã nâng cấp mints a batch — a promo code is a
 * word somebody chose for a campaign and there is no such thing as five
 * hundred of them.
 *
 * The term checkboxes are built from `/billing/products` rather than typed,
 * so a campaign cannot name a gói that does not exist. None ticked is every
 * term, which is both the common case and what the server means by an empty
 * list; the label says so rather than leaving the operator to infer it from
 * an empty set.
 */
function IssueDialog({
  open,
  onClose,
  onIssued,
}: {
  open: boolean
  onClose: () => void
  onIssued: () => void
}) {
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<PromoCodeKind>('PERCENT')
  const [percent, setPercent] = useState('20')
  const [amountVnd, setAmountVnd] = useState('50000')
  const [maxUses, setMaxUses] = useState('100')
  const [startsOn, setStartsOn] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [products, setProducts] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [minted, setMinted] = useState<PromoCode | null>(null)

  const catalogue = useListPremiumProducts()

  const { mutate, isPending, error, reset } = useCreatePromoCode({
    mutation: {
      onSuccess: (result) => {
        setMinted(result)
        onIssued()
      },
    },
  })

  /* Stable across keystrokes, for the reason BillingPage's IssueDialog gives:
     <Dialog> re-runs its focus effect whenever `onClose` changes, and a
     handler minted per render would pull focus back after each character. */
  const close = useCallback(() => {
    reset()
    setMinted(null)
    onClose()
  }, [reset, onClose])

  const normalised = code.toUpperCase().replace(/[\s\-_.]/g, '')
  const codeOk = /^[A-Z0-9]{4,24}$/.test(normalised)
  const value = Number(kind === 'PERCENT' ? percent : amountVnd)
  const valueOk =
    kind === 'PERCENT' ? Number.isInteger(value) && value >= 1 && value <= 90 : value >= 1
  const canSubmit = codeOk && valueOk && Number(maxUses) >= 1 && !isPending

  return (
    <Dialog
      title="Tạo mã khuyến mãi"
      open={open}
      onClose={close}
      footer={
        minted ? (
          <Button onClick={close}>Đóng</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Huỷ
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={() =>
                mutate({
                  data: {
                    code: normalised,
                    kind,
                    percent: kind === 'PERCENT' ? Number(percent) : undefined,
                    amountVnd: kind === 'AMOUNT' ? Number(amountVnd) : undefined,
                    maxUses: Number(maxUses),
                    productCodes: products.length > 0 ? products : undefined,
                    // A date picked in the operator's day: the start is the
                    // beginning of it and the end is the end, so "1/2 → 28/2"
                    // includes both days whole.
                    startsAt: startsOn ? new Date(`${startsOn}T00:00:00`).toISOString() : undefined,
                    expiresAt: expiresOn
                      ? new Date(`${expiresOn}T23:59:59`).toISOString()
                      : undefined,
                    note: note.trim() || undefined,
                  },
                })
              }
            >
              {isPending ? 'Đang tạo…' : 'Tạo mã'}
            </Button>
          </>
        )
      }
    >
      {minted ? (
        <div>
          <p className="text-sm text-muted">
            Đã tạo mã. Người học nhập mã này ở trang Nâng cấp, ngay cạnh giá.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <code className="font-mono text-lg tracking-wide">{minted.code}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(minted.code)}
            >
              Sao chép
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted">
            {promoValue(minted)} ·{' '}
            {minted.productCodes.length === 0
              ? 'mọi thời hạn'
              : minted.productCodes.join(', ')}{' '}
            · tối đa {minted.maxUses} lượt
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <TextField
            id="promo-code"
            label="Mã"
            hint="4–24 ký tự A–Z và 0–9. Người học gõ sao cũng được — hoa thường, dấu cách và dấu gạch đều được bỏ qua."
            value={code}
            maxLength={30}
            onChange={(e) => setCode(e.target.value)}
          />
          {code !== '' && !codeOk && (
            <p className="text-xs text-muted">
              Sau khi chuẩn hoá: <code className="font-mono">{normalised || '—'}</code> — chưa
              hợp lệ.
            </p>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink">Kiểu giảm</legend>
            <div className="flex gap-4">
              {(
                [
                  ['PERCENT', 'Theo phần trăm'],
                  ['AMOUNT', 'Số tiền cố định'],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="promo-kind"
                    checked={kind === v}
                    onChange={() => setKind(v)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {kind === 'PERCENT' ? (
            <TextField
              id="promo-percent"
              label="Giảm bao nhiêu phần trăm"
              type="number"
              min={1}
              max={90}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          ) : (
            <TextField
              id="promo-amount"
              label="Giảm bao nhiêu đồng"
              hint="Nếu lớn hơn giá gói thì người học vẫn phải trả tối thiểu 1 ₫ — muốn tặng hẳn thì dùng Mã nâng cấp."
              type="number"
              min={1}
              step={1000}
              value={amountVnd}
              onChange={(e) => setAmountVnd(e.target.value)}
            />
          )}

          <TextField
            id="promo-max-uses"
            label="Tổng số lượt"
            hint="Tính trên cả đợt. Mỗi người học vẫn chỉ dùng được một lần."
            type="number"
            min={1}
            max={1000000}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink">Áp dụng cho thời hạn</legend>
            <p className="text-xs text-muted">Không chọn gì là áp dụng cho mọi thời hạn.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {catalogue.data?.items.map((p) => (
                <label key={p.code} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={products.includes(p.code)}
                    onChange={(e) =>
                      setProducts((cur) =>
                        e.target.checked ? [...cur, p.code] : cur.filter((c) => c !== p.code),
                      )
                    }
                  />
                  {p.title}
                </label>
              ))}
            </div>
          </fieldset>

          <TextField
            id="promo-starts"
            label="Bắt đầu"
            hint="Để trống nếu mã chạy ngay."
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
          <TextField
            id="promo-expires"
            label="Kết thúc"
            hint="Để trống nếu mã không hết hạn theo ngày."
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
          <TextField
            id="promo-note"
            label="Ghi chú"
            hint="Đợt nào, ai duyệt."
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
        </div>
      )}
    </Dialog>
  )
}

function RevokeDialog({
  code,
  onClose,
  onRevoked,
}: {
  code: PromoCode | null
  onClose: () => void
  onRevoked: () => void
}) {
  const { mutate, isPending, error, reset } = useRevokePromoCode({
    mutation: {
      onSuccess: () => {
        onRevoked()
        onClose()
      },
    },
  })
  const close = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  return (
    <Dialog
      title="Thu hồi mã khuyến mãi"
      open={code !== null}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Giữ lại
          </Button>
          <Button
            variant="danger"
            disabled={isPending}
            onClick={() => code && mutate({ promoId: code.id })}
          >
            {isPending ? 'Đang thu hồi…' : 'Thu hồi mã'}
          </Button>
        </>
      }
    >
      {code && (
        <div className="flex flex-col gap-2 text-sm text-ink">
          <p>
            <code className="font-mono tracking-wide">{code.code}</code> sẽ không giảm giá cho
            đơn mới nào nữa.
          </p>
          <p className="text-muted">
            Đơn đang mở với mã này vẫn giữ nguyên giá đã báo — người học có thể đang cầm mã
            chuyển khoản đó trong ứng dụng ngân hàng.
          </p>
          {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
        </div>
      )}
    </Dialog>
  )
}

function UsesDialog({ code, onClose }: { code: PromoCode | null; onClose: () => void }) {
  const { data, error, isPending } = useListPromoCodeUses(code?.id ?? '', {
    query: { enabled: code !== null },
  })

  return (
    <Dialog
      title={code ? `Ai đã dùng ${code.code}` : 'Ai đã dùng'}
      open={code !== null}
      onClose={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}
    >
      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      {isPending && code !== null && <SkeletonList rows={2} label="Đang tải…" />}
      {data && data.items.length === 0 && (
        <p className="text-sm text-muted">
          Chưa ai dùng mã này. Mã chỉ tính lượt khi tiền về, nên đơn đang chờ chưa hiện ở đây.
        </p>
      )}
      {data && data.items.length > 0 && (
        <ul aria-label="Người đã dùng mã" className="flex flex-col">
          {data.items.map((u) => (
            <li
              key={u.orderId}
              className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-2 text-sm first:border-t-0"
            >
              <span>
                <span className="font-medium text-ink">{u.displayName || u.email}</span>{' '}
                <span className="text-muted">{u.email}</span>
              </span>
              <span className="text-muted">
                {day(u.redeemedAt)} · giảm {vnd(u.discountVnd)} · trả {vnd(u.amountVnd)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
