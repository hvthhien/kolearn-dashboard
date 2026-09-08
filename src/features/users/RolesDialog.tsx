import { useCallback, useState } from 'react'
import { useListAdminRoles, useSetAdminUserRoles } from '../../api/gen/kolearn'
import type { AdminUser } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { useAuth } from '../../lib/auth'
import { Button, Dialog, ErrorNote, SkeletonList, TextField, WarnNote } from '../../components/ui'
import { nameOf } from './format'

/**
 * Vai trò — the whole set, edited together.
 *
 * Checkboxes rather than a grant/revoke pair, because the server takes the
 * whole set and applying it as one request is what makes a half-finished
 * permission change impossible. The codes come from `GET /admin/roles` rather
 * than a list typed in here: a role added by a migration has to appear in this
 * dialog without a deploy, and it arrives with its own Vietnamese description.
 *
 * Takes a user rather than a nullable one, and the caller mounts it keyed on
 * the id. Resetting the ticked boxes in an effect is the alternative and it is
 * worse twice over: it cascades a render, and it re-runs whenever the row is
 * refetched underneath — discarding what the operator had ticked because the
 * list happened to refresh.
 */
export function RolesDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser
  onClose: () => void
  onSaved: () => void
}) {
  const { user: me } = useAuth()
  const [roles, setRoles] = useState<string[]>(user.roles)
  const [note, setNote] = useState('')

  const catalogue = useListAdminRoles()

  const { mutate, isPending, error, reset } = useSetAdminUserRoles({
    mutation: {
      onSuccess: () => {
        onSaved()
        onClose()
      },
    },
  })
  /* Stable across keystrokes: <Dialog> re-runs its focus effect whenever
     `onClose` changes, and a handler minted every render would pull focus back
     to the panel after each character typed into the reason. */
  const close = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  /* The refusal the server will make anyway (409 cannot_demote_self), said
     here so it reads as a rule rather than as a failure — and said rather than
     enforced by disabling the box, so the operator can see what they meant to
     do and why it is refused. */
  const demotingSelf =
    me?.id === user.id && user.roles.includes('admin') && !roles.includes('admin')

  const unchanged = [...roles].sort().join() === [...user.roles].sort().join()

  return (
    <Dialog
      title="Vai trò"
      open
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Huỷ
          </Button>
          <Button
            disabled={isPending || demotingSelf || unchanged}
            onClick={() =>
              mutate({ userId: user.id, data: { roles, note: note.trim() || undefined } })
            }
          >
            {isPending ? 'Đang lưu…' : 'Lưu vai trò'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink">
        <p>
          <span className="font-medium">{nameOf(user)}</span> · {user.email}
        </p>

        {catalogue.error !== null && <ErrorNote>{userMessage(catalogue.error)}</ErrorNote>}
        {catalogue.isPending && <SkeletonList rows={3} label="Đang tải vai trò…" />}

        {catalogue.data && (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Vai trò của tài khoản này</legend>
            {catalogue.data.items.map((r) => (
              <label key={r.code} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={roles.includes(r.code)}
                  onChange={(e) =>
                    setRoles((prev) =>
                      e.target.checked ? [...prev, r.code] : prev.filter((code) => code !== r.code),
                    )
                  }
                />
                <span>
                  <span className="font-medium">{r.description}</span>{' '}
                  <code className="text-xs text-muted">{r.code}</code>
                  {r.requiresMfa && (
                    <span className="block text-xs text-muted">
                      Vai trò này được đánh dấu cần xác thực hai bước.
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {demotingSelf && (
          <WarnNote>
            Không thể tự bỏ vai trò <code>admin</code> của chính mình — nếu bỏ nhầm thì chính bạn
            là người không vào lại được đây để sửa. Nhờ một admin khác làm việc này.
          </WarnNote>
        )}

        <TextField
          id="roles-note"
          label="Lý do"
          hint="Ghi vào nhật ký cùng với vai trò trước và sau."
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      </div>
    </Dialog>
  )
}
