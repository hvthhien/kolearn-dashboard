import { useCallback, useState } from 'react'
import { useSetAdminUserStatus } from '../../api/gen/kolearn'
import type { AdminUser } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { Button, Dialog, ErrorNote, TextField } from '../../components/ui'
import { nameOf } from './format'

/**
 * Đình chỉ / mở lại.
 *
 * One dialog for both directions, because they are one switch and a screen
 * with two of them invites the question of which one is showing. Which
 * direction it is comes from the account's own status, so the confirmation
 * describes the change rather than the button.
 *
 * The reason is required when closing an account and optional when reopening
 * one: a suspension is the thing somebody will later have to account for, and
 * "mở lại" is undoing it.
 *
 * Mounted keyed on the account, so the reason typed about one person never
 * survives into the dialog about the next.
 */
export function StatusDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser
  onClose: () => void
  onSaved: () => void
}) {
  const [note, setNote] = useState('')
  const suspending = user.status !== 'SUSPENDED'

  const { mutate, isPending, error, reset } = useSetAdminUserStatus({
    mutation: {
      onSuccess: () => {
        onSaved()
        onClose()
      },
    },
  })
  // Stable for the reason RolesDialog's is.
  const close = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  return (
    <Dialog
      title={suspending ? 'Đình chỉ tài khoản' : 'Mở lại tài khoản'}
      open
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Huỷ
          </Button>
          <Button
            variant={suspending ? 'danger' : 'primary'}
            disabled={isPending || (suspending && note.trim() === '')}
            onClick={() =>
              mutate({
                userId: user.id,
                data: {
                  status: suspending ? 'SUSPENDED' : 'ACTIVE',
                  note: note.trim() || undefined,
                },
              })
            }
          >
            {isPending ? 'Đang lưu…' : suspending ? 'Đình chỉ' : 'Mở lại'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink">
        <p>
          <span className="font-medium">{nameOf(user)}</span> · {user.email}
        </p>
        {suspending ? (
          <p className="text-muted">
            Tài khoản sẽ không đăng nhập được nữa, và mọi thiết bị đang đăng nhập bị đăng xuất
            ngay. Dữ liệu học tập giữ nguyên — mở lại là khôi phục quyền vào, không phải khôi
            phục thiết bị.
          </p>
        ) : (
          <p className="text-muted">
            Tài khoản đăng nhập lại được ngay. Các thiết bị cũ vẫn phải đăng nhập lại từ đầu.
          </p>
        )}
        <TextField
          id="status-note"
          label="Lý do"
          hint={
            suspending
              ? 'Bắt buộc — thao tác này được ghi vào nhật ký với lý do.'
              : 'Ghi vào nhật ký cùng với thay đổi.'
          }
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      </div>
    </Dialog>
  )
}
