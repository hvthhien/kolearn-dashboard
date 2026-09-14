import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  getListAccessCodesQueryKey,
  getListWaitlistQueryKey,
  useDeleteWaitlistEntry,
  useInviteWaitlist,
  useListWaitlist,
  useResendWaitlistInvitation,
} from '../../api/gen/kolearn'
import type {
  InvitedWaitlistEntry,
  WaitlistEntry,
  WaitlistStatus,
  WaitlistSummary,
} from '../../api/gen/model'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorNote,
  FilterChips,
  Pager,
  Refreshing,
  SkeletonList,
  Table,
  Td,
  TextField,
  Th,
} from '../../components/ui'
import { useClampPage, usePager } from '../../lib/paging'
import { userMessage } from '../../lib/problem'
import { day, endOfDay, KOREAN_LEVEL, LEARNING_GOAL, REFERRAL, WAITLIST_STATUS } from './labels'

const PAGE_SIZE = 20

type StatusFilter = 'ALL' | WaitlistStatus

/**
 * Danh sách chờ — a pool the operator releases batches from.
 *
 * Nobody is let in by joining. "Mời N người tiếp theo" takes the oldest entries
 * not yet invited, gives each a personal code and emails it; the list is shown
 * oldest first for that reason, so the top of "Đang chờ" is exactly who the
 * next batch will reach.
 */
export function WaitlistSection() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const pager = usePager(PAGE_SIZE)

  const [inviting, setInviting] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<WaitlistEntry | null>(null)
  const closeInvite = useCallback(() => setInviting(null), [])
  const closeDelete = useCallback(() => setDeleting(null), [])

  const { data, error, isPending, isFetching } = useListWaitlist({
    q: q || undefined,
    status: status === 'ALL' ? undefined : status,
    limit: pager.pageSize,
    offset: pager.offset,
  })
  useClampPage(pager, data?.totalCount)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListWaitlistQueryKey() })
    // An invitation is a personal code, and the codes tab lists it.
    void queryClient.invalidateQueries({ queryKey: getListAccessCodesQueryKey() })
  }
  const change = (apply: () => void) => {
    apply()
    pager.reset()
  }

  const [resent, setResent] = useState<string | null>(null)
  const resend = useResendWaitlistInvitation({
    mutation: { onSuccess: (sent) => setResent(sent.email) },
  })

  const waiting = data?.summary.notInvited ?? 0

  return (
    <section aria-labelledby="ea-waitlist-heading" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ea-waitlist-heading" className="text-base font-semibold text-ink">
          Danh sách chờ
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={waiting === 0} onClick={() => setInviting(50)}>
            Mời 50 người tiếp theo
          </Button>
          <Button variant="secondary" disabled={waiting === 0} onClick={() => setInviting(100)}>
            Mời 100 người tiếp theo
          </Button>
          <Button disabled={waiting === 0} onClick={() => setInviting(Math.min(waiting, 200))}>
            Tạo đợt mời
          </Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        Người trong danh sách không tự được vào. Mỗi đợt mời tạo một mã cá nhân cho từng người và
        gửi qua email.
      </p>

      {data && <Summary summary={data.summary} />}

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          change(() => setQ(search.trim()))
        }}
      >
        <TextField
          id="ea-waitlist-search"
          label="Tìm email"
          type="search"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          Tìm
        </Button>
      </form>

      <FilterChips<StatusFilter>
        label="Trạng thái danh sách chờ"
        className="mt-3"
        value={status}
        onChange={(next) => change(() => setStatus(next))}
        choices={[
          { value: 'ALL', label: 'Tất cả' },
          { value: 'WAITING', label: WAITLIST_STATUS.WAITING.text },
          { value: 'INVITED', label: WAITLIST_STATUS.INVITED.text },
          { value: 'REGISTERED', label: WAITLIST_STATUS.REGISTERED.text },
          { value: 'ACTIVATED', label: WAITLIST_STATUS.ACTIVATED.text },
        ]}
      />

      {error !== null && (
        <div className="mt-3">
          <ErrorNote>{userMessage(error)}</ErrorNote>
        </div>
      )}
      {resend.error !== null && (
        <div className="mt-3">
          <ErrorNote>{userMessage(resend.error)}</ErrorNote>
        </div>
      )}
      {resent !== null && resend.error === null && (
        <p role="status" className="mt-3 text-sm text-correct">
          Đã gửi lại email mời tới {resent}.
        </p>
      )}

      {isPending ? (
        <div className="mt-3">
          <SkeletonList rows={3} label="Đang tải danh sách chờ…" />
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title={q || status !== 'ALL' ? 'Không có ai khớp' : 'Chưa có ai trong danh sách chờ'}
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  change(() => {
                    setSearch('')
                    setQ('')
                    setStatus('ALL')
                  })
                }
              >
                Xem tất cả
              </Button>
            }
          >
            Người chưa có mã đăng ký từ trang khoá sẽ hiện ở đây.
          </EmptyState>
        </div>
      ) : (
        data && (
          <div className="mt-3">
            <Refreshing busy={isFetching}>
              <Table
                caption="Danh sách chờ"
                head={
                  <tr>
                    <Th>Email</Th>
                    <Th>Trình độ</Th>
                    <Th>Mục tiêu</Th>
                    <Th>Nguồn</Th>
                    <Th>Đăng ký</Th>
                    <Th>Trạng thái</Th>
                    <Th>Mã mời</Th>
                    <Th className="text-right">Thao tác</Th>
                  </tr>
                }
              >
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <Td>{e.email}</Td>
                    <Td>{KOREAN_LEVEL[e.koreanLevel]}</Td>
                    <Td>
                      {LEARNING_GOAL[e.learningGoal]}
                      {(e.topikTarget !== undefined || e.examDate) && (
                        <span className="block text-xs text-muted">
                          {e.topikTarget !== undefined && `TOPIK ${e.topikTarget}`}
                          {e.topikTarget !== undefined && e.examDate && ' · '}
                          {e.examDate && `thi ${day(e.examDate)}`}
                        </span>
                      )}
                    </Td>
                    <Td>{e.referralSource ? REFERRAL[e.referralSource] : '—'}</Td>
                    <Td>{day(e.createdAt)}</Td>
                    <Td>
                      <Badge tone={WAITLIST_STATUS[e.status].tone}>
                        {WAITLIST_STATUS[e.status].text}
                      </Badge>
                    </Td>
                    <Td>
                      {e.invitationCode ? (
                        <code className="font-mono text-sm tracking-wide">{e.invitationCode}</code>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {e.invitationCode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={resend.isPending}
                          onClick={() => {
                            setResent(null)
                            resend.mutate({ entryId: e.id })
                          }}
                        >
                          Gửi lại email
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(e)}>
                        Xoá
                      </Button>
                    </Td>
                  </tr>
                ))}
              </Table>
            </Refreshing>
            <Pager
              page={pager.page}
              pageSize={pager.pageSize}
              shown={data.items.length}
              total={data.totalCount}
              noun="người"
              onChange={pager.go}
            />
          </div>
        )
      )}

      {inviting !== null && (
        <InviteDialog
          initialCount={inviting}
          waiting={waiting}
          onClose={closeInvite}
          onInvited={refresh}
        />
      )}
      <DeleteDialog entry={deleting} onClose={closeDelete} onDeleted={refresh} />
    </section>
  )
}

/** The plan's funnel, as five numbers: who is waiting, and how far the invited got. */
function Summary({ summary }: { summary: WaitlistSummary }) {
  const tiles: [string, number][] = [
    ['Tổng', summary.total],
    ['Chưa mời', summary.notInvited],
    ['Đã mời', summary.invited],
    ['Đã đăng ký', summary.registered],
    ['Đã kích hoạt', summary.activated],
  ]
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tiles.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-line bg-white px-4 py-3">
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
          <dd className="mt-1 text-2xl font-bold text-ink tabular-nums">
            {value.toLocaleString('vi-VN')}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * One batch: how many, and what every personal code in it gives. Stays open
 * afterwards with the codes and whether each email went, because the operator
 * may need to send one again by hand.
 */
function InviteDialog({
  initialCount,
  waiting,
  onClose,
  onInvited,
}: {
  initialCount: number
  waiting: number
  onClose: () => void
  onInvited: () => void
}) {
  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  const [count, setCount] = useState(String(initialCount))
  const [campaign, setCampaign] = useState(`Danh sách chờ ${today}`)
  const [trialDays, setTrialDays] = useState('7')
  const [discountPercent, setDiscountPercent] = useState('50')
  const [expiresOn, setExpiresOn] = useState('')
  const [invited, setInvited] = useState<InvitedWaitlistEntry[] | null>(null)

  const { mutate, isPending, error } = useInviteWaitlist({
    mutation: {
      onSuccess: (result) => {
        setInvited(result.invited)
        onInvited()
      },
    },
  })

  const n = Number(count)
  const trial = Number(trialDays)
  const discount = Number(discountPercent)
  const whole = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max
  const canSubmit =
    whole(n, 1, 200) && campaign.trim() !== '' && whole(trial, 0, 90) && whole(discount, 0, 90) && !isPending
  const unsent = invited?.filter((e) => !e.emailSent).length ?? 0

  return (
    <Dialog
      title="Mời người trong danh sách chờ"
      open
      onClose={onClose}
      footer={
        invited ? (
          <Button onClick={onClose}>Đóng</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={() =>
                mutate({
                  data: {
                    count: n,
                    campaign: campaign.trim(),
                    trialDays: trial,
                    discountPercent: discount,
                    expiresAt: endOfDay(expiresOn),
                  },
                })
              }
            >
              {isPending ? 'Đang mời…' : `Mời ${Number.isInteger(n) && n > 0 ? Math.min(n, waiting) : ''} người`}
            </Button>
          </>
        )
      }
    >
      {invited ? (
        <div>
          <p className="text-sm text-muted">
            Đã mời {invited.length} người.
            {unsent > 0 && ` ${unsent} email chưa gửi được — dùng “Gửi lại email” trong danh sách.`}
          </p>
          <ul aria-label="Người vừa được mời" className="mt-3 flex flex-col">
            {invited.map((e) => (
              <li
                key={e.entryId}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm first:border-t-0"
              >
                <span className="text-ink">{e.email}</span>
                <span className="flex items-center gap-2">
                  <code className="font-mono tracking-wide">{e.code}</code>
                  {e.emailSent ? (
                    <Badge tone="ok">đã gửi</Badge>
                  ) : (
                    <Badge tone="bad">chưa gửi</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {waiting.toLocaleString('vi-VN')} người đang chờ. Người đăng ký sớm nhất được mời trước.
          </p>
          <TextField
            id="ea-invite-count"
            label="Số người mời"
            hint="Tối đa 200 người một đợt."
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          <TextField
            id="ea-invite-campaign"
            label="Chiến dịch"
            hint="Gắn cho các mã của đợt này, để đo đợt mời nào mang lại người học."
            maxLength={80}
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
          />
          <TextField
            id="ea-invite-trial"
            label="Số ngày dùng thử Premium"
            type="number"
            min={0}
            max={90}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
          />
          <TextField
            id="ea-invite-discount"
            label="Giảm giá tháng Premium đầu tiên (%)"
            type="number"
            min={0}
            max={90}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
          />
          <TextField
            id="ea-invite-expires"
            label="Hạn dùng mã mời"
            hint="Để trống nếu mã không hết hạn theo ngày."
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
          {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
        </div>
      )}
    </Dialog>
  )
}

function DeleteDialog({
  entry,
  onClose,
  onDeleted,
}: {
  entry: WaitlistEntry | null
  onClose: () => void
  onDeleted: () => void
}) {
  const { mutate, isPending, error, reset } = useDeleteWaitlistEntry({
    mutation: {
      onSuccess: () => {
        onDeleted()
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
      title="Xoá khỏi danh sách chờ"
      open={entry !== null}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Giữ lại
          </Button>
          <Button
            variant="danger"
            disabled={isPending}
            onClick={() => entry && mutate({ entryId: entry.id })}
          >
            {isPending ? 'Đang xoá…' : 'Xoá'}
          </Button>
        </>
      }
    >
      {entry && (
        <div className="flex flex-col gap-2 text-sm text-ink">
          <p>
            {entry.email} sẽ bị xoá khỏi danh sách chờ.
            {entry.invitationCode &&
              ` Mã mời ${entry.invitationCode} đã gửi vẫn dùng được — tắt mã ở thẻ Mã truy cập nếu muốn thu hồi.`}
          </p>
          {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
        </div>
      )}
    </Dialog>
  )
}
