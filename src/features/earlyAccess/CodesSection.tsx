import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  getListAccessCodesQueryKey,
  useCreateAccessCode,
  useDisableAccessCode,
  useEnableAccessCode,
  useListAccessCodeRedemptions,
  useListAccessCodes,
  useUpdateAccessCode,
} from '../../api/gen/kolearn'
import type { AccessCode, AccessCodeKind, AccessCodeStatus } from '../../api/gen/model'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorNote,
  FilterChips,
  Pager,
  Refreshing,
  Select,
  SkeletonList,
  Table,
  Td,
  TextField,
  Th,
} from '../../components/ui'
import { useClampPage, usePager } from '../../lib/paging'
import { userMessage } from '../../lib/problem'
import { benefits, CODE_STATUS, day, endOfDay, KIND_HINT, KIND_LABEL, toDateInput } from './labels'

const PAGE_SIZE = 20

type StatusFilter = 'ALL' | AccessCodeStatus
type KindFilter = '' | AccessCodeKind

/**
 * Mã truy cập — every code that opens the lock, and what each one gives.
 *
 * The table is the plan's own: code, campaign, limit, used, remaining, status.
 * "Còn lại" is spelled out rather than left to subtraction, because the
 * question an operator is asked on launch day is "is TIKTOK100 full yet?".
 */
export function CodesSection() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<KindFilter>('')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const pager = usePager(PAGE_SIZE)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AccessCode | null>(null)
  const [disabling, setDisabling] = useState<AccessCode | null>(null)
  const [viewing, setViewing] = useState<AccessCode | null>(null)
  /* Stable, because <Dialog> re-runs its focus effect whenever `onClose`
     changes, and a fresh one per render would pull focus out of the form. */
  const closeCreate = useCallback(() => setCreating(false), [])
  const closeEdit = useCallback(() => setEditing(null), [])
  const closeDisable = useCallback(() => setDisabling(null), [])
  const closeView = useCallback(() => setViewing(null), [])

  const { data, error, isPending, isFetching } = useListAccessCodes({
    q: q || undefined,
    kind: kind || undefined,
    status: status === 'ALL' ? undefined : status,
    limit: pager.pageSize,
    offset: pager.offset,
  })
  useClampPage(pager, data?.totalCount)

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAccessCodesQueryKey() })
  const change = (apply: () => void) => {
    apply()
    pager.reset()
  }

  const enable = useEnableAccessCode({ mutation: { onSuccess: () => void refresh() } })

  return (
    <section aria-labelledby="ea-codes-heading" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ea-codes-heading" className="text-base font-semibold text-ink">
          Mã truy cập
        </h2>
        <Button onClick={() => setCreating(true)}>Tạo mã</Button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Mỗi mã vừa mở khoá vừa tặng quyền lợi. Mỗi tài khoản chỉ kích hoạt được một mã; sửa quyền
        lợi chỉ áp dụng cho người kích hoạt sau.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          change(() => setQ(search.trim()))
        }}
      >
        <TextField
          id="ea-codes-search"
          label="Tìm"
          hint="Mã tính từ đầu, hoặc tên chiến dịch."
          type="search"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          id="ea-codes-kind"
          label="Loại mã"
          value={kind}
          onChange={(e) => change(() => setKind(e.target.value as KindFilter))}
        >
          <option value="">Mọi loại</option>
          <option value="CAMPAIGN">{KIND_LABEL.CAMPAIGN}</option>
          <option value="BATCH">{KIND_LABEL.BATCH}</option>
          <option value="PERSONAL">{KIND_LABEL.PERSONAL}</option>
        </Select>
        <Button type="submit" variant="secondary">
          Tìm
        </Button>
      </form>

      <FilterChips<StatusFilter>
        label="Trạng thái mã"
        className="mt-3"
        value={status}
        onChange={(next) => change(() => setStatus(next))}
        choices={[
          { value: 'ALL', label: 'Tất cả' },
          { value: 'ACTIVE', label: CODE_STATUS.ACTIVE.text },
          { value: 'FULL', label: CODE_STATUS.FULL.text },
          { value: 'EXPIRED', label: CODE_STATUS.EXPIRED.text },
          { value: 'DISABLED', label: CODE_STATUS.DISABLED.text },
        ]}
      />

      {error !== null && (
        <div className="mt-3">
          <ErrorNote>{userMessage(error)}</ErrorNote>
        </div>
      )}
      {enable.error !== null && (
        <div className="mt-3">
          <ErrorNote>{userMessage(enable.error)}</ErrorNote>
        </div>
      )}

      {isPending ? (
        <div className="mt-3">
          <SkeletonList rows={3} label="Đang tải mã…" />
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title={q || kind || status !== 'ALL' ? 'Không có mã nào khớp' : 'Chưa có mã truy cập nào'}
            action={<Button onClick={() => setCreating(true)}>Tạo mã</Button>}
          >
            Một mã chiến dịch cho TikTok, một mã nhóm cho lớp học, hoặc mã cá nhân cho từng người.
          </EmptyState>
        </div>
      ) : (
        data && (
          <div className="mt-3">
            <Refreshing busy={isFetching}>
              <Table
                caption="Mã truy cập"
                head={
                  <tr>
                    <Th>Mã</Th>
                    <Th>Chiến dịch</Th>
                    <Th>Đã dùng</Th>
                    <Th>Còn lại</Th>
                    <Th>Quyền lợi</Th>
                    <Th>Hết hạn</Th>
                    <Th>Trạng thái</Th>
                    <Th className="text-right">Thao tác</Th>
                  </tr>
                }
              >
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <code className="font-mono text-sm tracking-wide">{c.code}</code>
                      <span className="block text-xs text-muted">{KIND_LABEL[c.kind]}</span>
                    </Td>
                    <Td className="max-w-48 truncate">{c.campaign}</Td>
                    <Td>
                      {c.redemptions}/{c.maxRedemptions}
                    </Td>
                    <Td>{Math.max(0, c.maxRedemptions - c.redemptions)}</Td>
                    <Td className="whitespace-nowrap">{benefits(c)}</Td>
                    <Td>{c.expiresAt ? day(c.expiresAt) : '—'}</Td>
                    <Td>
                      <Badge tone={CODE_STATUS[c.status].tone}>{CODE_STATUS[c.status].text}</Badge>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(c)}>
                        Người dùng
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                        Sửa
                      </Button>
                      {c.status === 'DISABLED' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={enable.isPending}
                          onClick={() => enable.mutate({ codeId: c.id })}
                        >
                          Bật lại
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setDisabling(c)}>
                          Tắt
                        </Button>
                      )}
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
              noun="mã"
              onChange={pager.go}
            />
          </div>
        )
      )}

      {creating && <CodeFormDialog onClose={closeCreate} onSaved={refresh} />}
      {editing && (
        <CodeFormDialog key={editing.id} code={editing} onClose={closeEdit} onSaved={refresh} />
      )}
      <DisableDialog code={disabling} onClose={closeDisable} onDisabled={refresh} />
      <RedemptionsDialog code={viewing} onClose={closeView} />
    </section>
  )
}

/**
 * Creating a code, or editing one. The same fields in both, less the two an
 * edit cannot change: the code somebody may already have shared, and its kind.
 */
function CodeFormDialog({
  code,
  onClose,
  onSaved,
}: {
  code?: AccessCode
  onClose: () => void
  onSaved: () => void
}) {
  const editing = code !== undefined
  const [kind, setKind] = useState<AccessCodeKind>(code?.kind ?? 'CAMPAIGN')
  const [value, setValue] = useState('')
  const [campaign, setCampaign] = useState(code?.campaign ?? '')
  const [maxRedemptions, setMaxRedemptions] = useState(String(code?.maxRedemptions ?? 100))
  const [trialDays, setTrialDays] = useState(String(code?.trialDays ?? 7))
  const [discountPercent, setDiscountPercent] = useState(String(code?.discountPercent ?? 50))
  const [discountValidDays, setDiscountValidDays] = useState(
    code?.discountValidDays !== undefined ? String(code.discountValidDays) : '',
  )
  const [expiresOn, setExpiresOn] = useState(toDateInput(code?.expiresAt))

  const saved = () => {
    onSaved()
    onClose()
  }
  const create = useCreateAccessCode({ mutation: { onSuccess: saved } })
  const update = useUpdateAccessCode({ mutation: { onSuccess: saved } })
  const mutation = editing ? update : create

  const personal = kind === 'PERSONAL'
  const limit = personal ? 1 : Number(maxRedemptions)
  const trial = Number(trialDays)
  const discount = Number(discountPercent)
  const validDays = discountValidDays === '' ? undefined : Number(discountValidDays)
  const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max
  const canSubmit =
    campaign.trim() !== '' &&
    whole(limit, 1, 100000) &&
    whole(trial, 0, 90) &&
    whole(discount, 0, 90) &&
    (validDays === undefined || whole(validDays, 1, 365)) &&
    !mutation.isPending

  const terms = {
    campaign: campaign.trim(),
    maxRedemptions: limit,
    trialDays: trial,
    discountPercent: discount,
    discountValidDays: validDays,
    expiresAt: endOfDay(expiresOn),
  }
  const submit = () => {
    if (code) update.mutate({ codeId: code.id, data: terms })
    else create.mutate({ data: { ...terms, kind, code: value.trim() || undefined } })
  }

  return (
    <Dialog
      title={code ? `Sửa mã ${code.code}` : 'Tạo mã truy cập'}
      open
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {mutation.isPending ? 'Đang lưu…' : editing ? 'Lưu' : 'Tạo mã'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!editing && (
          <>
            <Select
              id="ea-code-kind"
              label="Loại mã"
              hint={KIND_HINT[kind]}
              value={kind}
              onChange={(e) => setKind(e.target.value as AccessCodeKind)}
            >
              <option value="CAMPAIGN">{KIND_LABEL.CAMPAIGN}</option>
              <option value="BATCH">{KIND_LABEL.BATCH}</option>
              <option value="PERSONAL">{KIND_LABEL.PERSONAL}</option>
            </Select>
            <TextField
              id="ea-code-value"
              label="Mã"
              hint="Để trống để tạo tự động. Chữ không dấu, số và dấu gạch ngang, 4–32 ký tự."
              autoComplete="off"
              maxLength={32}
              placeholder={personal ? 'XAMI-…' : 'TIKTOK100'}
              value={value}
              onChange={(e) => setValue(e.target.value.toUpperCase())}
            />
          </>
        )}
        <TextField
          id="ea-code-campaign"
          label="Chiến dịch"
          hint="Tên để đo chiến dịch nào mang lại người học, ví dụ “TikTok #1”."
          maxLength={80}
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
        />
        {!personal && (
          <TextField
            id="ea-code-limit"
            label="Số lượt kích hoạt tối đa"
            type="number"
            min={1}
            max={100000}
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
          />
        )}
        <TextField
          id="ea-code-trial"
          label="Số ngày dùng thử Premium"
          hint="Tính từ lúc người học kích hoạt. 0 để không tặng."
          type="number"
          min={0}
          max={90}
          value={trialDays}
          onChange={(e) => setTrialDays(e.target.value)}
        />
        <TextField
          id="ea-code-discount"
          label="Giảm giá tháng Premium đầu tiên (%)"
          hint="Áp dụng cho gói 1 tháng. 0 để không tặng."
          type="number"
          min={0}
          max={90}
          value={discountPercent}
          onChange={(e) => setDiscountPercent(e.target.value)}
        />
        <TextField
          id="ea-code-discount-days"
          label="Ưu đãi dùng được trong (ngày)"
          hint="Tính từ lúc kích hoạt. Để trống nếu ưu đãi còn đến khi dùng."
          type="number"
          min={1}
          max={365}
          value={discountValidDays}
          onChange={(e) => setDiscountValidDays(e.target.value)}
        />
        <TextField
          id="ea-code-expires"
          label="Hạn dùng mã"
          hint="Để trống nếu mã không hết hạn theo ngày."
          type="date"
          value={expiresOn}
          onChange={(e) => setExpiresOn(e.target.value)}
        />
        {mutation.error !== null && <ErrorNote>{userMessage(mutation.error)}</ErrorNote>}
      </div>
    </Dialog>
  )
}

function DisableDialog({
  code,
  onClose,
  onDisabled,
}: {
  code: AccessCode | null
  onClose: () => void
  onDisabled: () => void
}) {
  const { mutate, isPending, error, reset } = useDisableAccessCode({
    mutation: {
      onSuccess: () => {
        onDisabled()
        onClose()
      },
    },
  })
  // Stable, or <Dialog> steals focus back on every render.
  const close = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  return (
    <Dialog
      title="Tắt mã truy cập"
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
            {isPending ? 'Đang tắt…' : 'Tắt mã'}
          </Button>
        </>
      }
    >
      {code && (
        <div className="flex flex-col gap-2 text-sm text-ink">
          <p>
            <code className="font-mono tracking-wide">{code.code}</code> sẽ không kích hoạt được
            nữa. {code.redemptions} người đã vào bằng mã này vẫn giữ quyền truy cập và quyền lợi của
            họ. Có thể bật lại bất cứ lúc nào.
          </p>
          {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
        </div>
      )}
    </Dialog>
  )
}

function RedemptionsDialog({ code, onClose }: { code: AccessCode | null; onClose: () => void }) {
  const { data, error, isPending } = useListAccessCodeRedemptions(code?.id ?? '', {
    query: { enabled: code !== null },
  })

  return (
    <Dialog
      title={code ? `Người đã vào bằng ${code.code}` : 'Người đã vào bằng mã'}
      open={code !== null}
      onClose={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}
    >
      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      {isPending && code !== null && <SkeletonList rows={2} label="Đang tải…" />}
      {data && data.items.length === 0 && (
        <p className="text-sm text-muted">Chưa ai kích hoạt mã này.</p>
      )}
      {data && data.items.length > 0 && (
        <ul aria-label="Người đã kích hoạt mã" className="flex flex-col">
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
                kích hoạt {day(r.activatedAt)}
                {r.trialEndsAt && ` · dùng thử đến ${day(r.trialEndsAt)}`}
                {r.discountUsedAt && ' · đã dùng ưu đãi'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
