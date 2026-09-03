import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getListRedeemCodesQueryKey,
  useCreateRedeemCodes,
  useListCodeRedemptions,
  useListRedeemCodes,
  useRevokeRedeemCode,
} from '../api/gen/kolearn'
import type { RedeemCode } from '../api/gen/model'
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
 * Thanh toán — today, the mã nâng cấp half of it.
 *
 * `billing:manage` alone opens this. It is its own permission rather than a
 * route inside the bank because a content_editor who may fix a typo must not
 * thereby be able to mint a year of Premium; the server mounts the routes
 * under the same line.
 *
 * What the screen is for is two questions an operator actually has: "give me
 * a code for this person" and "somebody says their code does not work — what
 * is its state?" Everything else — a campaign's batch, who redeemed it, taking
 * one back — hangs off those two.
 */

/** `ABCDEFGHJKLM` → `ABCD-EFGH-JKLM`, the shape it is handed out in. */
export function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-')
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

type CodeState = 'active' | 'revoked' | 'expired' | 'exhausted'

/**
 * The state the server would answer a learner with, computed here from the
 * same fields it reads — so what the operator sees is what the learner was
 * told. Revoked wins over the others because the server checks it first.
 */
export function codeState(c: RedeemCode, now = new Date()): CodeState {
  if (c.revokedAt) return 'revoked'
  if (c.expiresAt && new Date(c.expiresAt) <= now) return 'expired'
  if (c.uses >= c.maxUses) return 'exhausted'
  return 'active'
}

const STATE_LABEL: Record<CodeState, { text: string; tone: 'ok' | 'neutral' | 'warn' | 'bad' }> = {
  active: { text: 'còn hiệu lực', tone: 'ok' },
  revoked: { text: 'đã thu hồi', tone: 'bad' },
  expired: { text: 'hết hạn', tone: 'neutral' },
  exhausted: { text: 'hết lượt', tone: 'neutral' },
}

export function BillingPage() {
  const [issuing, setIssuing] = useState(false)
  const [revoking, setRevoking] = useState<RedeemCode | null>(null)
  const [viewing, setViewing] = useState<RedeemCode | null>(null)
  const queryClient = useQueryClient()

  const { data, error, isPending, isFetching } = useListRedeemCodes()
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListRedeemCodesQueryKey() })

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Thanh toán</PageTitle>
        <Button onClick={() => setIssuing(true)}>Phát hành mã</Button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Mã nâng cấp cộng ngày Premium vào tài khoản người học. Mã dùng nhiều lượt thì mỗi
        người vẫn chỉ dùng được một lần.
      </p>

      <h2 className="mt-6 text-base font-semibold text-ink">Mã nâng cấp</h2>

      {error !== null && (
        <div className="mt-3">
          <ErrorNote>{userMessage(error)}</ErrorNote>
        </div>
      )}

      {isPending ? (
        <div className="mt-3">
          <SkeletonList rows={3} label="Đang tải mã…" />
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Chưa phát hành mã nào"
            action={<Button onClick={() => setIssuing(true)}>Phát hành mã đầu tiên</Button>}
          >
            Một mã cho một người, hoặc một mã nhiều lượt cho cả lớp.
          </EmptyState>
        </div>
      ) : (
        data && (
          <div className="mt-3">
            <Refreshing busy={isFetching}>
              <Table
                caption="Mã nâng cấp đã phát hành"
                head={
                  <tr>
                    <Th>Mã</Th>
                    <Th>Ngày</Th>
                    <Th>Lượt</Th>
                    <Th>Hết hạn</Th>
                    <Th>Ghi chú</Th>
                    <Th>Trạng thái</Th>
                    <Th className="text-right">Thao tác</Th>
                  </tr>
                }
              >
                {data.items.map((c) => {
                  const state = codeState(c)
                  return (
                    <tr key={c.id}>
                      <Td>
                        <code className="font-mono text-sm tracking-wide">{formatCode(c.code)}</code>
                      </Td>
                      <Td>{c.days}</Td>
                      <Td>
                        {c.uses}/{c.maxUses}
                      </Td>
                      <Td>{c.expiresAt ? day(c.expiresAt) : '—'}</Td>
                      <Td className="max-w-56 truncate">{c.note}</Td>
                      <Td>
                        <Badge tone={STATE_LABEL[state].tone}>{STATE_LABEL[state].text}</Badge>
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setViewing(c)}>
                          Ai đã dùng
                        </Button>
                        {state === 'active' && (
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
      <RedemptionsDialog code={viewing} onClose={() => setViewing(null)} />
    </PageShell>
  )
}

/**
 * The issuing form. Stays open after a batch is minted, showing the codes:
 * this is the one time they are handed back together, and closing on success
 * would send the operator hunting through the list for the ones they just
 * made.
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
  const [days, setDays] = useState('30')
  const [maxUses, setMaxUses] = useState('1')
  const [count, setCount] = useState('1')
  const [expiresOn, setExpiresOn] = useState('')
  const [note, setNote] = useState('')
  const [minted, setMinted] = useState<RedeemCode[] | null>(null)

  const { mutate, isPending, error, reset } = useCreateRedeemCodes({
    mutation: {
      onSuccess: (result) => {
        setMinted(result.items)
        onIssued()
      },
    },
  })

  /* Stable across keystrokes, and it has to be: <Dialog> re-runs its focus
     effect whenever `onClose` changes, and a close handler minted on every
     render would pull focus back to the panel after each character typed
     into the form. */
  const close = useCallback(() => {
    reset()
    setMinted(null)
    onClose()
  }, [reset, onClose])

  const numbers = [days, maxUses, count].map((v) => Number(v))
  const canSubmit = numbers.every((n) => Number.isInteger(n) && n > 0) && !isPending

  return (
    <Dialog
      title="Phát hành mã nâng cấp"
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
                    days: Number(days),
                    maxUses: Number(maxUses),
                    count: Number(count),
                    // A date picked in the operator's day, sent as the end of
                    // that day so "hết hạn 31/12" includes the 31st.
                    expiresAt: expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : undefined,
                    note: note.trim() || undefined,
                  },
                })
              }
            >
              {isPending ? 'Đang phát hành…' : 'Phát hành'}
            </Button>
          </>
        )
      }
    >
      {minted ? (
        <div>
          <p className="text-sm text-muted">
            Đã phát hành {minted.length} mã. Sao chép ngay — danh sách bên ngoài không gom
            lại theo đợt.
          </p>
          <ul aria-label="Mã vừa phát hành" className="mt-3 flex flex-col gap-1">
            {minted.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <code className="font-mono text-base tracking-wide">{formatCode(c.code)}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(formatCode(c.code))}
                >
                  Sao chép
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <TextField
            id="issue-days"
            label="Số ngày Premium"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <TextField
            id="issue-max-uses"
            label="Số lượt dùng"
            hint="1 cho một người. Nhiều hơn cho cả lớp — mỗi người vẫn chỉ dùng được một lần."
            type="number"
            min={1}
            max={100000}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
          <TextField
            id="issue-count"
            label="Số mã cần phát hành"
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          <TextField
            id="issue-expires"
            label="Hạn dùng mã"
            hint="Để trống nếu mã không hết hạn theo ngày."
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
          <TextField
            id="issue-note"
            label="Ghi chú"
            hint="Mã này cho ai, hoặc đợt nào."
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
  code: RedeemCode | null
  onClose: () => void
  onRevoked: () => void
}) {
  const { mutate, isPending, error, reset } = useRevokeRedeemCode({
    mutation: {
      onSuccess: () => {
        onRevoked()
        onClose()
      },
    },
  })
  // Stable for the reason IssueDialog's is.
  const close = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  return (
    <Dialog
      title="Thu hồi mã"
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
            onClick={() => code && mutate({ codeId: code.id })}
          >
            {isPending ? 'Đang thu hồi…' : 'Thu hồi mã'}
          </Button>
        </>
      }
    >
      {code && (
        <div className="flex flex-col gap-2 text-sm text-ink">
          <p>
            <code className="font-mono tracking-wide">{formatCode(code.code)}</code> sẽ không dùng
            được nữa. Người đã dùng mã này vẫn giữ nguyên số ngày của họ.
          </p>
          {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
        </div>
      )}
    </Dialog>
  )
}

function RedemptionsDialog({ code, onClose }: { code: RedeemCode | null; onClose: () => void }) {
  const { data, error, isPending } = useListCodeRedemptions(code?.id ?? '', {
    query: { enabled: code !== null },
  })

  return (
    <Dialog
      title={code ? `Ai đã dùng ${formatCode(code.code)}` : 'Ai đã dùng'}
      open={code !== null}
      onClose={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}
    >
      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      {isPending && code !== null && <SkeletonList rows={2} label="Đang tải…" />}
      {data && data.items.length === 0 && (
        <p className="text-sm text-muted">Chưa ai dùng mã này.</p>
      )}
      {data && data.items.length > 0 && (
        <ul aria-label="Người đã dùng mã" className="flex flex-col">
          {data.items.map((r) => (
            <li
              key={r.userId}
              className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-2 text-sm first:border-t-0"
            >
              <span>
                <span className="font-medium text-ink">{r.displayName || r.email}</span>{' '}
                <span className="text-muted">{r.email}</span>
              </span>
              <span className="text-muted">
                dùng {day(r.redeemedAt)} · Premium đến {day(r.premiumUntil)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
