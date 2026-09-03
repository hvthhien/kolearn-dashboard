import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getListAdminPaymentOrdersQueryKey,
  useConfirmPaymentOrder,
  useListAdminPaymentOrders,
} from '../../api/gen/kolearn'
import type { AdminPaymentOrder, PaymentOrderStatus } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorNote,
  FilterChips,
  Refreshing,
  SkeletonList,
  Table,
  Td,
  TextField,
  Th,
} from '../../components/ui'

export function vnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} ₫`
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type StatusFilter = 'OPEN' | PaymentOrderStatus

const STATUS: Record<PaymentOrderStatus, { text: string; tone: 'ok' | 'neutral' | 'warn' | 'bad' }> = {
  PENDING: { text: 'chờ tiền', tone: 'warn' },
  REVIEW: { text: 'chuyển thiếu', tone: 'bad' },
  PAID: { text: 'đã thanh toán', tone: 'ok' },
  EXPIRED: { text: 'hết hạn', tone: 'neutral' },
  CANCELLED: { text: 'đã huỷ', tone: 'neutral' },
}

/** Which statuses an operator can still confirm by hand. */
const CONFIRMABLE = new Set<PaymentOrderStatus>(['PENDING', 'REVIEW', 'EXPIRED'])

/**
 * Đơn chuyển khoản.
 *
 * The queue is "Đang chờ" by default — PENDING and REVIEW — because that is
 * what an operator opens this for: a learner says they paid, and the row
 * either confirms itself when SePay reports the transfer or has to be
 * confirmed here against the statement. PAID rows are history, reachable by
 * the chip.
 */
export function OrdersSection() {
  const [filter, setFilter] = useState<StatusFilter>('OPEN')
  const [confirming, setConfirming] = useState<AdminPaymentOrder | null>(null)
  const queryClient = useQueryClient()

  const { data, error, isPending, isFetching } = useListAdminPaymentOrders(
    filter === 'OPEN' ? undefined : { status: filter },
  )
  const rows =
    filter === 'OPEN'
      ? (data?.items ?? []).filter((o) => o.status === 'PENDING' || o.status === 'REVIEW')
      : (data?.items ?? [])

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminPaymentOrdersQueryKey() })

  return (
    <section aria-labelledby="orders-heading" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="orders-heading" className="text-base font-semibold text-ink">
          Đơn chuyển khoản
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        SePay báo tiền về thì đơn tự thanh toán. Đơn nào tiền đã về mà chưa tự khớp — sai nội
        dung, chuyển thiếu — thì xác nhận ở đây theo sao kê.
      </p>

      <FilterChips<StatusFilter>
        label="Trạng thái đơn"
        className="mt-4"
        value={filter}
        onChange={setFilter}
        choices={[
          { value: 'OPEN', label: 'Đang chờ' },
          { value: 'PAID', label: 'Đã thanh toán' },
          { value: 'EXPIRED', label: 'Hết hạn' },
          { value: 'CANCELLED', label: 'Đã huỷ' },
        ]}
      />

      {error !== null && (
        <div className="mt-3">
          <ErrorNote>{userMessage(error)}</ErrorNote>
        </div>
      )}

      {isPending ? (
        <div className="mt-3">
          <SkeletonList rows={3} label="Đang tải đơn…" />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Không có đơn nào"
            action={
              <Button variant="ghost" onClick={refresh}>
                Tải lại
              </Button>
            }
          >
            {filter === 'OPEN' ? 'Không có đơn nào đang chờ tiền.' : 'Chưa có đơn ở trạng thái này.'}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-3">
          <Refreshing busy={isFetching}>
            <Table
              caption="Đơn chuyển khoản"
              head={
                <tr>
                  <Th>Người học</Th>
                  <Th>Gói</Th>
                  <Th>Số tiền</Th>
                  <Th>Nội dung CK</Th>
                  <Th>Tạo lúc</Th>
                  <Th>Trạng thái</Th>
                  <Th className="text-right">Thao tác</Th>
                </tr>
              }
            >
              {rows.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <span className="font-medium text-ink">{o.displayName || o.email}</span>
                    <span className="block text-xs text-muted">{o.email}</span>
                  </Td>
                  <Td>{o.productTitle}</Td>
                  <Td>
                    {vnd(o.amountVnd)}
                    {o.paidAmountVnd !== undefined && o.paidAmountVnd !== o.amountVnd && (
                      <span className="block text-xs text-wrong">nhận {vnd(o.paidAmountVnd)}</span>
                    )}
                  </Td>
                  <Td>
                    <code className="font-mono text-sm tracking-wide">{o.transferCode}</code>
                  </Td>
                  <Td>{when(o.createdAt)}</Td>
                  <Td>
                    <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].text}</Badge>
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {CONFIRMABLE.has(o.status) && (
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(o)}>
                        Đã nhận tiền
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Refreshing>
        </div>
      )}

      <ConfirmDialog order={confirming} onClose={() => setConfirming(null)} onConfirmed={refresh} />
    </section>
  )
}

function ConfirmDialog({
  order,
  onClose,
  onConfirmed,
}: {
  order: AdminPaymentOrder | null
  onClose: () => void
  onConfirmed: () => void
}) {
  const [paid, setPaid] = useState('')
  const [bankRef, setBankRef] = useState('')
  const [note, setNote] = useState('')

  const { mutate, isPending, error, reset } = useConfirmPaymentOrder({
    mutation: {
      onSuccess: () => {
        onConfirmed()
        onClose()
        setPaid('')
        setBankRef('')
        setNote('')
      },
    },
  })
  const close = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const amount = paid.trim() === '' ? undefined : Number(paid)
  const valid = amount === undefined || (Number.isInteger(amount) && amount > 0)

  return (
    <Dialog
      title="Xác nhận đã nhận tiền"
      open={order !== null}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Huỷ
          </Button>
          <Button
            disabled={isPending || !valid}
            onClick={() =>
              order &&
              mutate({
                orderId: order.id,
                data: {
                  paidAmountVnd: amount,
                  bankRef: bankRef.trim() || undefined,
                  note: note.trim() || undefined,
                },
              })
            }
          >
            {isPending ? 'Đang xác nhận…' : 'Xác nhận và cộng ngày'}
          </Button>
        </>
      }
    >
      {order && (
        <div className="flex flex-col gap-3 text-sm text-ink">
          <p>
            <span className="font-medium">{order.displayName || order.email}</span> ·{' '}
            {order.productTitle} · {vnd(order.amountVnd)} · nội dung{' '}
            <code className="font-mono">{order.transferCode}</code>
          </p>
          <p className="text-muted">
            Chỉ xác nhận khi đã thấy tiền trên sao kê. Người học được cộng {order.days} ngày ngay
            khi bấm; thao tác này được ghi vào nhật ký.
          </p>
          <TextField
            id="confirm-paid"
            label="Số tiền thực nhận (₫)"
            hint="Để trống nếu đúng bằng giá gói."
            type="number"
            min={1}
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
          />
          <TextField
            id="confirm-ref"
            label="Mã giao dịch trên sao kê"
            value={bankRef}
            onChange={(e) => setBankRef(e.target.value)}
          />
          <TextField
            id="confirm-note"
            label="Ghi chú"
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
