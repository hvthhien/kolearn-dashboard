import { useCallback, useState } from 'react'
import { useFindUsers, useGrantUserPlan } from '../../api/gen/kolearn'
import type { AdminUser } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import {
  Badge,
  Button,
  Dialog,
  ErrorNote,
  SkeletonList,
  Table,
  Td,
  TextField,
  Th,
} from '../../components/ui'

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Người dùng — for support.
 *
 * "Tôi đã chuyển tiền, sao chưa thấy Premium" is a question about a person,
 * and this is where the person is found: by address, twenty rows at most,
 * with the plan beside the name so the answer is on the same line. The gift
 * is the escape hatch for everything the queue cannot settle — a transfer
 * that never reached SePay, a promise made on the phone — and it is audited
 * like a code.
 */
export function UsersSection() {
  const [email, setEmail] = useState('')
  const [asked, setAsked] = useState('')
  const [granting, setGranting] = useState<AdminUser | null>(null)

  const { data, error, isFetching, refetch } = useFindUsers(
    { email: asked },
    { query: { enabled: asked !== '' } },
  )

  return (
    <section aria-labelledby="users-heading" className="mt-6">
      <h2 id="users-heading" className="text-base font-semibold text-ink">
        Người dùng
      </h2>
      <p className="mt-1 text-sm text-muted">Tìm theo email để xem gói và tặng ngày Premium.</p>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setAsked(email.trim())
        }}
      >
        <TextField
          id="find-email"
          label="Email"
          type="search"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={email.trim() === ''}>
          Tìm
        </Button>
      </form>

      {error !== null && (
        <div className="mt-3">
          <ErrorNote>{userMessage(error)}</ErrorNote>
        </div>
      )}
      {isFetching && data === undefined && (
        <div className="mt-3">
          <SkeletonList rows={2} label="Đang tìm…" />
        </div>
      )}
      {data && data.items.length === 0 && (
        <p className="mt-3 text-sm text-muted">Không có tài khoản nào bắt đầu bằng “{asked}”.</p>
      )}
      {data && data.items.length > 0 && (
        <div className="mt-3">
          <Table
            caption="Người dùng tìm thấy"
            head={
              <tr>
                <Th>Email</Th>
                <Th>Tên</Th>
                <Th>Gói</Th>
                <Th className="text-right">Thao tác</Th>
              </tr>
            }
          >
            {data.items.map((u) => (
              <tr key={u.id}>
                <Td>{u.email}</Td>
                <Td>{u.displayName}</Td>
                <Td>
                  {u.plan.tier === 'premium' ? (
                    <Badge tone="ok">
                      Premium{u.plan.premiumUntil ? ` đến ${day(u.plan.premiumUntil)}` : ''}
                    </Badge>
                  ) : (
                    <Badge>Cơ bản</Badge>
                  )}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setGranting(u)}>
                    Tặng ngày
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <GrantDialog user={granting} onClose={() => setGranting(null)} onGranted={() => void refetch()} />
    </section>
  )
}

function GrantDialog({
  user,
  onClose,
  onGranted,
}: {
  user: AdminUser | null
  onClose: () => void
  onGranted: () => void
}) {
  const [days, setDays] = useState('30')
  const [note, setNote] = useState('')

  const { mutate, isPending, error, reset } = useGrantUserPlan({
    mutation: {
      onSuccess: () => {
        onGranted()
        onClose()
        setNote('')
      },
    },
  })
  const close = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const n = Number(days)
  const valid = Number.isInteger(n) && n > 0 && note.trim() !== ''

  return (
    <Dialog
      title="Tặng ngày Premium"
      open={user !== null}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Huỷ
          </Button>
          <Button
            disabled={isPending || !valid}
            onClick={() => user && mutate({ userId: user.id, data: { days: n, note: note.trim() } })}
          >
            {isPending ? 'Đang cộng…' : 'Cộng ngày'}
          </Button>
        </>
      }
    >
      {user && (
        <div className="flex flex-col gap-3 text-sm text-ink">
          <p>
            <span className="font-medium">{user.displayName || user.email}</span> · {user.email}
          </p>
          <TextField
            id="grant-days"
            label="Số ngày"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <TextField
            id="grant-note"
            label="Lý do"
            hint="Bắt buộc — thao tác này được ghi vào nhật ký với lý do."
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
