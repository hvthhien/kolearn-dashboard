import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getListAdminUsersQueryKey, useListAdminUsers } from '../api/gen/kolearn'
import type { AdminUser, AdminUserStatus } from '../api/gen/model'
import { userMessage } from '../lib/problem'
import { useAuth } from '../lib/auth'
import { RolesDialog } from '../features/users/RolesDialog'
import { SessionsDialog } from '../features/users/SessionsDialog'
import { StatusDialog } from '../features/users/StatusDialog'
import { STATUS_LABEL, day, lastSeen } from '../features/users/format'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  FilterChips,
  PageShell,
  PageTitle,
  Refreshing,
  Select,
  SkeletonList,
  Table,
  Td,
  TextField,
  Th,
} from '../components/ui'

/**
 * Người dùng — the directory, and the three things an admin does from it.
 *
 * The question this screen answers is "what may this account do", which is a
 * different question from Thanh toán's "what has this account paid for". They
 * are separate screens because they are separate permissions: `billing:manage`
 * opens the other one, and `user:role:assign` and `user:suspend` open this.
 * Both read the same list, so the two can never disagree about who somebody is.
 *
 * Every row action is one an operator has to be able to undo or account for.
 * Roles are audited with the set before and after; a suspension is audited
 * with its reason and signs every device out; ending sessions leaves the
 * account able to sign back in. Nothing here deletes anything.
 *
 * There is no "create account" button, and its absence is the design. An
 * account is created by the person it belongs to, at registration, and a
 * console that could mint one would be creating a credential nobody holds.
 * Making somebody staff is granting a role to an account that already exists.
 */

const PAGE_SIZE = 20

type StatusFilter = 'ALL' | AdminUserStatus

export function UsersPage() {
  const { user: me } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(0)

  const [editingRoles, setEditingRoles] = useState<AdminUser | null>(null)
  const [editingStatus, setEditingStatus] = useState<AdminUser | null>(null)
  const [viewingSessions, setViewingSessions] = useState<AdminUser | null>(null)

  const canAssignRoles = me?.permissions.includes('user:role:assign') ?? false
  const canSuspend = me?.permissions.includes('user:suspend') ?? false

  const { data, error, isPending, isFetching } = useListAdminUsers({
    q: q || undefined,
    role: role || undefined,
    status: status === 'ALL' ? undefined : status,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  /* No params, so every filter and page of the list goes at once: a role
     granted under "Tất cả" must not still read as the old one in the cached
     "Đã đình chỉ". */
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() })

  /* Any change to what is being asked for starts at the first page. Staying on
     page four of a narrower result set is how a search comes back empty for a
     reason nobody can see. */
  const change = (apply: () => void) => {
    apply()
    setPage(0)
  }

  const total = data?.totalCount ?? 0
  const shown = data?.items.length ?? 0
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1

  return (
    <PageShell>
      <PageTitle>Người dùng</PageTitle>
      <p className="mt-1 text-sm text-muted">
        Ai có tài khoản, tài khoản đó được làm gì, và tài khoản đó còn dùng được không. Mọi thay
        đổi ở đây đều được ghi vào nhật ký kèm lý do.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          change(() => setQ(search.trim()))
        }}
      >
        <TextField
          id="users-search"
          label="Tìm"
          hint="Email tính từ đầu, hoặc tên hiển thị ở bất kỳ đâu."
          type="search"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          id="users-role"
          label="Vai trò"
          value={role}
          onChange={(e) => change(() => setRole(e.target.value))}
        >
          <option value="">Mọi vai trò</option>
          <option value="learner">learner</option>
          <option value="content_editor">content_editor</option>
          <option value="content_admin">content_admin</option>
          <option value="support">support</option>
          <option value="admin">admin</option>
        </Select>
        <Button type="submit" variant="secondary">
          Tìm
        </Button>
      </form>

      <FilterChips<StatusFilter>
        label="Trạng thái"
        className="mt-3"
        value={status}
        onChange={(next) => change(() => setStatus(next))}
        choices={[
          { value: 'ALL', label: 'Tất cả' },
          { value: 'ACTIVE', label: 'Đang hoạt động' },
          { value: 'SUSPENDED', label: 'Đã đình chỉ' },
        ]}
      />

      {error !== null && (
        <div className="mt-4">
          <ErrorNote>{userMessage(error)}</ErrorNote>
        </div>
      )}

      {isPending ? (
        <div className="mt-4">
          <SkeletonList rows={5} label="Đang tải người dùng…" />
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Không có tài khoản nào khớp"
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  change(() => {
                    setSearch('')
                    setQ('')
                    setRole('')
                    setStatus('ALL')
                  })
                }
              >
                Bỏ bộ lọc
              </Button>
            }
          >
            Email tìm từ đầu địa chỉ — thử ít ký tự hơn, hoặc tìm bằng tên.
          </EmptyState>
        </div>
      ) : (
        data && (
          <>
            <div className="mt-4">
              <Refreshing busy={isFetching}>
                <Table
                  caption="Người dùng"
                  head={
                    <tr>
                      {/* The widest column by intent: an address is what
                          an operator is given over the phone, and one that
                          wraps mid-word is one they cannot read back. */}
                      <Th className="min-w-64">Tài khoản</Th>
                      <Th>Vai trò</Th>
                      <Th>Gói</Th>
                      <Th>Trạng thái</Th>
                      <Th>Hoạt động</Th>
                      <Th className="text-right">Thao tác</Th>
                    </tr>
                  }
                >
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <Td>
                        <span className="block font-medium text-ink">
                          {u.displayName || <span className="text-muted">chưa đặt tên</span>}
                          {u.id === me?.id && (
                            <span className="ml-1 text-xs font-normal text-muted">(bạn)</span>
                          )}
                        </span>
                        <span className="block break-words text-muted">{u.email}</span>
                        {/* Two states that make "mật khẩu đúng mà không vào
                            được" make sense, and they are the first thing
                            anybody asks this screen. */}
                        {!u.emailVerified && (
                          <span className="block text-xs text-warn">chưa xác minh email</span>
                        )}
                        {u.hasPassword === false && (
                          <span className="block text-xs text-muted">chỉ đăng nhập bằng Google</span>
                        )}
                      </Td>
                      <Td>
                        {u.roles.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <Badge key={r} tone={r === 'admin' ? 'warn' : 'neutral'}>
                                {r}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {u.plan.tier === 'premium' ? (
                          <Badge tone="ok">
                            Premium{u.plan.premiumUntil ? ` đến ${day(u.plan.premiumUntil)}` : ''}
                          </Badge>
                        ) : (
                          <Badge>Cơ bản</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <Badge tone={STATUS_LABEL[u.status].tone}>
                          {STATUS_LABEL[u.status].text}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{lastSeen(u.lastSeenAt)}</Td>
                      <Td className="whitespace-nowrap text-right">
                        {canAssignRoles && (
                          <Button variant="ghost" size="sm" onClick={() => setEditingRoles(u)}>
                            Vai trò
                          </Button>
                        )}
                        {canSuspend && (
                          <Button variant="ghost" size="sm" onClick={() => setViewingSessions(u)}>
                            Thiết bị
                          </Button>
                        )}
                        {/* Not offered on one's own account: the server
                            refuses it (409), and a button that always fails is
                            a worse way to say so than not offering it. */}
                        {canSuspend && u.id !== me?.id && u.status !== 'DELETED' && (
                          <Button variant="ghost" size="sm" onClick={() => setEditingStatus(u)}>
                            {u.status === 'SUSPENDED' ? 'Mở lại' : 'Đình chỉ'}
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </Table>
              </Refreshing>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
              <span aria-live="polite">
                {from}–{from + shown - 1} trong {total} tài khoản
              </span>
              <span className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Trang trước
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </Button>
              </span>
            </div>
          </>
        )
      )}

      {/* Keyed and mounted on demand rather than kept open={false}: each of
          these carries a draft — ticked roles, a typed reason — and a dialog
          that outlives the row it was opened on is one that offers yesterday's
          draft about somebody else. */}
      {editingRoles && (
        <RolesDialog
          key={editingRoles.id}
          user={editingRoles}
          onClose={() => setEditingRoles(null)}
          onSaved={refresh}
        />
      )}
      {editingStatus && (
        <StatusDialog
          key={editingStatus.id}
          user={editingStatus}
          onClose={() => setEditingStatus(null)}
          onSaved={refresh}
        />
      )}
      {viewingSessions && (
        <SessionsDialog
          key={viewingSessions.id}
          user={viewingSessions}
          onClose={() => setViewingSessions(null)}
        />
      )}
    </PageShell>
  )
}
