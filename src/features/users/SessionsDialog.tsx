import { useCallback } from 'react'
import { useEndAdminUserSessions, useListAdminUserSessions } from '../../api/gen/kolearn'
import type { AdminUser } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { Button, Dialog, ErrorNote, SkeletonList } from '../../components/ui'
import { lastSeen, nameOf } from './format'

/**
 * Thiết bị đang đăng nhập — somebody else's, and the button that ends them.
 *
 * Shows the list before offering the button, because "đăng xuất mọi thiết bị"
 * is a different decision when it is two devices than when it is nine. The
 * user-agent arrives raw and is shown raw: parsing it into "Chrome trên
 * macOS" is a pile of heuristics wrong often enough that the string has to
 * survive as the fallback anyway.
 */
export function SessionsDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { data, error, isPending, refetch } = useListAdminUserSessions(user.id)

  const end = useEndAdminUserSessions({
    mutation: { onSuccess: () => void refetch() },
  })
  // Stable for the reason RolesDialog's is.
  const close = useCallback(() => {
    end.reset()
    onClose()
  }, [end, onClose])

  const count = data?.items.length ?? 0

  return (
    <Dialog
      title="Thiết bị đang đăng nhập"
      open
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Đóng
          </Button>
          <Button
            variant="danger"
            disabled={end.isPending || count === 0}
            onClick={() => end.mutate({ userId: user.id })}
          >
            {end.isPending ? 'Đang đăng xuất…' : 'Đăng xuất mọi thiết bị'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink">
        <p>
          <span className="font-medium">{nameOf(user)}</span> · {user.email}
        </p>

        {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
        {isPending && <SkeletonList rows={2} label="Đang tải thiết bị…" />}

        {data && data.items.length === 0 && (
          <p className="text-muted">Tài khoản này không có thiết bị nào đang đăng nhập.</p>
        )}

        {data && data.items.length > 0 && (
          <ul aria-label="Thiết bị đang đăng nhập" className="flex flex-col">
            {data.items.map((s) => (
              <li key={s.id} className="border-t border-line py-2 first:border-t-0">
                <span className="block break-all">{s.userAgent || 'Không rõ thiết bị'}</span>
                <span className="text-muted">
                  đăng nhập {lastSeen(s.startedAt)} · dùng gần nhất {lastSeen(s.lastSeenAt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Said before the button is pressed, not after: "đăng xuất" sounds
            instantaneous and is not. */}
        <p className="text-xs text-muted">
          Thiết bị bị đăng xuất sẽ không gia hạn được phiên nữa, nhưng phiên đang mở còn hiệu
          lực tối đa 15 phút. Cần chặn ngay thì đình chỉ tài khoản.
        </p>

      {end.error !== null && <ErrorNote>{userMessage(end.error)}</ErrorNote>}
      </div>
    </Dialog>
  )
}
