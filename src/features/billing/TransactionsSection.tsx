import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getListAdminPaymentOrdersQueryKey,
  getListBankTransactionsQueryKey,
  useListAdminPaymentOrders,
  useListBankTransactions,
  useMatchBankTransaction,
} from '../../api/gen/kolearn'
import type { BankTransaction } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import {
  Button,
  Dialog,
  EmptyState,
  ErrorNote,
  Refreshing,
  Select,
  SkeletonList,
  Table,
  Td,
  Th,
} from '../../components/ui'
import { vnd, when } from './OrdersSection'

/**
 * Giao dịch chưa khớp.
 *
 * Every transfer SePay reported that no order claimed: the memo was mistyped,
 * or somebody paid with no order at all. Each row is money in the account and
 * a learner somewhere waiting, so the list is the operator's second queue.
 * Matching links the transfer to an order and pays it with the transfer's
 * amount, in one audited step.
 */
export function TransactionsSection() {
  const [matching, setMatching] = useState<BankTransaction | null>(null)
  const queryClient = useQueryClient()

  const { data, error, isPending, isFetching } = useListBankTransactions({ matched: false })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListBankTransactionsQueryKey() })
    void queryClient.invalidateQueries({ queryKey: getListAdminPaymentOrdersQueryKey() })
  }

  return (
    <section aria-labelledby="transactions-heading" className="mt-6">
      <h2 id="transactions-heading" className="text-base font-semibold text-ink">
        Giao dịch chưa khớp
      </h2>
      <p className="mt-1 text-sm text-muted">
        Tiền đã về tài khoản nhưng không đơn nào nhận. Tìm đơn của người chuyển và khớp tay.
      </p>

      {error !== null && (
        <div className="mt-3">
          <ErrorNote>{userMessage(error)}</ErrorNote>
        </div>
      )}

      {isPending ? (
        <div className="mt-3">
          <SkeletonList rows={2} label="Đang tải giao dịch…" />
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Không có giao dịch lạc"
            action={
              <Button variant="ghost" onClick={refresh}>
                Tải lại
              </Button>
            }
          >
            Mọi khoản tiền về đều đã khớp với một đơn.
          </EmptyState>
        </div>
      ) : (
        data && (
          <div className="mt-3">
            <Refreshing busy={isFetching}>
              <Table
                caption="Giao dịch chưa khớp"
                head={
                  <tr>
                    <Th>Nhận lúc</Th>
                    <Th>Số tiền</Th>
                    <Th>Nội dung</Th>
                    <Th>Mã GD</Th>
                    <Th className="text-right">Thao tác</Th>
                  </tr>
                }
              >
                {data.items.map((t) => (
                  <tr key={t.id}>
                    <Td>{when(t.occurredAt)}</Td>
                    <Td>{vnd(t.amountVnd)}</Td>
                    <Td className="max-w-72 truncate">{t.memo}</Td>
                    <Td>
                      <code className="font-mono text-xs">{t.reference || t.providerTxnId}</code>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setMatching(t)}>
                        Khớp với đơn
                      </Button>
                    </Td>
                  </tr>
                ))}
              </Table>
            </Refreshing>
          </div>
        )
      )}

      <MatchDialog transaction={matching} onClose={() => setMatching(null)} onMatched={refresh} />
    </section>
  )
}

function MatchDialog({
  transaction,
  onClose,
  onMatched,
}: {
  transaction: BankTransaction | null
  onClose: () => void
  onMatched: () => void
}) {
  const [orderId, setOrderId] = useState('')
  /* Every open order, so the operator picks by learner rather than typing an
     id. Fetched only while the dialog is open. */
  const orders = useListAdminPaymentOrders(undefined, {
    query: { enabled: transaction !== null },
  })
  const candidates = (orders.data?.items ?? []).filter(
    (o) => o.status === 'PENDING' || o.status === 'REVIEW' || o.status === 'EXPIRED',
  )

  const { mutate, isPending, error, reset } = useMatchBankTransaction({
    mutation: {
      onSuccess: () => {
        onMatched()
        onClose()
        setOrderId('')
      },
    },
  })
  const close = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  return (
    <Dialog
      title="Khớp giao dịch với đơn"
      open={transaction !== null}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Huỷ
          </Button>
          <Button
            disabled={isPending || orderId === ''}
            onClick={() =>
              transaction && mutate({ transactionId: transaction.id, data: { orderId } })
            }
          >
            {isPending ? 'Đang khớp…' : 'Khớp và cộng ngày'}
          </Button>
        </>
      }
    >
      {transaction && (
        <div className="flex flex-col gap-3 text-sm text-ink">
          <p>
            {vnd(transaction.amountVnd)} · <span className="text-muted">{transaction.memo}</span>
          </p>
          <Select
            id="match-order"
            label="Đơn của người chuyển"
            hint="Chỉ liệt kê đơn còn nhận được tiền. Số ngày cộng theo gói của đơn."
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          >
            <option value="">— chọn đơn —</option>
            {candidates.map((o) => (
              <option key={o.id} value={o.id}>
                {o.email} · {o.productTitle} · {vnd(o.amountVnd)} · {o.transferCode}
              </option>
            ))}
          </Select>
          {orders.error !== null && <ErrorNote>{userMessage(orders.error)}</ErrorNote>}
          {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
        </div>
      )}
    </Dialog>
  )
}
