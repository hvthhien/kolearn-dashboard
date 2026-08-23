import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  createAdminShadowVideo,
  deleteAdminShadowVideo,
  getListAdminShadowVideosQueryKey,
  retireAdminShadowVideo,
  useListAdminShadowVideos,
} from '../api/gen/kolearn'
import type { AdminShadowVideoRow, ShadowVideoStatus } from '../api/gen/model'
import { userMessage } from '../lib/problem'
import { useAuth } from '../lib/auth'
import { RemoveDialog } from '../features/manage/RemoveDialog'
import { removalFor, removalLabel } from '../features/manage/removal'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  FilterChips,
  PageShell,
  PageTitle,
  Refreshing,
  SkeletonList,
  Table,
  Td,
  Th,
} from '../components/ui'

type StatusFilter = 'ALL' | ShadowVideoStatus

const STATUS_LABEL: Record<ShadowVideoStatus, string> = {
  DRAFT: 'nháp',
  IN_REVIEW: 'chờ duyệt',
  PUBLISHED: 'đã vào ngân hàng',
  RETIRED: 'đã gỡ',
}

/**
 * Xưởng video — the list.
 *
 * Unpaginated, following every other admin list in this app. The status chips
 * plus the growth this library will actually see cover it; introducing
 * pagination here alone would make this the only paginated screen while
 * /exams, which will hold hundreds of papers first, stayed as it is. When
 * either list crosses roughly two hundred rows that is one change doing both.
 *
 * "Sửa" is a link rather than a dialog, and the asymmetry with the dictation
 * list is deliberate: a set's editable surface is four metadata fields, and a
 * video's is the studio — timings, transcript, dictionary, all against the
 * player. There is no honest way to put that in a modal, and no reason to.
 *
 * The remove button is not one operation. It reads `publishedAt` and offers
 * either "Xoá" or "Gỡ", never a choice between them: a draft nobody could reach
 * is deleted outright, and a video that once went out can only be pulled back,
 * because learners' tiến độ and the cards made from its lines hang off the row.
 */
export function VideoListPage() {
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [removing, setRemoving] = useState<AdminShadowVideoRow | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const canWrite = user?.permissions.includes('shadowing:write') ?? false
  const canPublish = user?.permissions.includes('shadowing:publish') ?? false

  const { data, error: loadError, isPending, isFetching } = useListAdminShadowVideos(
    status === 'ALL' ? undefined : { status },
  )

  /* No params, so this is the prefix every status filter hangs off — a video
     removed under "Tất cả" must not still be sitting in the cached "Nháp". */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminShadowVideosQueryKey() })

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await createAdminShadowVideo({ title: 'Video mới', level: 2 })
      await navigate({ to: '/videos/$videoId', params: { videoId: created.id } })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Xưởng video</PageTitle>
        <Button onClick={() => void create()} disabled={busy}>
          Tạo video mới
        </Button>
      </div>

      <FilterChips<StatusFilter>
        label="Trạng thái"
        className="mt-4"
        value={status}
        onChange={setStatus}
        choices={[
          { value: 'ALL', label: 'Tất cả' },
          { value: 'DRAFT', label: 'Nháp' },
          { value: 'PUBLISHED', label: 'Đã vào ngân hàng' },
          { value: 'RETIRED', label: 'Đã gỡ' },
        ]}
      />

      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      {loadError ? (
        <ErrorNote>{userMessage(loadError)}</ErrorNote>
      ) : isPending ? (
        <SkeletonList rows={3} label="Đang tải danh sách video…" />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="Chưa có video nào"
          action={
            <Button onClick={() => void create()} disabled={busy}>
              Tạo video mới
            </Button>
          }
        >
          Video nhại theo được dựng ở công cụ ngoài rồi tải lên đây.
        </EmptyState>
      ) : (
        <Refreshing busy={isFetching}>
          <Table
            caption="Video nhại theo trong ngân hàng"
            head={
              <tr>
                <Th>Chủ đề</Th>
                <Th>Cấp độ</Th>
                <Th>Số câu</Th>
                <Th>Duyệt</Th>
                <Th>Trạng thái</Th>
                <Th className="text-right">Thao tác</Th>
              </tr>
            }
          >
            {data.items.map((v) => (
              <tr key={v.id} className="border-b border-line last:border-0">
                <Td>
                  <Link to="/videos/$videoId" params={{ videoId: v.id }} className="font-medium text-brand hover:underline">
                    {v.title}
                  </Link>
                </Td>
                <Td className="tabular-nums">TOPIK{v.level}</Td>
                <Td className="text-right tabular-nums">{v.lineCount}</Td>
                <Td>
                  <span className="tabular-nums">
                    {v.review.approved}/{v.review.total}
                  </span>
                  {/* Said in the list, before anyone opens it: the gate is the
                      thing standing between this row and the learner. */}
                  {v.review.unreviewed > 0 && (
                    <p className="mt-1 text-xs text-warn">
                      {v.review.unreviewed} câu chưa duyệt — chưa đưa vào ngân hàng được.
                    </p>
                  )}
                </Td>
                <Td>
                  <Badge tone={v.status === 'PUBLISHED' ? 'ok' : undefined}>
                    {STATUS_LABEL[v.status]}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Link
                      to="/videos/$videoId"
                      params={{ videoId: v.id }}
                      className="tap inline-flex items-center rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-soft"
                    >
                      Sửa
                    </Link>
                    {/* Which permission this needs depends on which operation
                        the row would get, because they are different
                        operations — deleting is authoring, retiring is
                        release. Hiding it is a courtesy; rbac is the rule. */}
                    {(removalFor(v.publishedAt) === 'DELETE' ? canWrite : canPublish) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-wrong hover:bg-wrong/10"
                        onClick={() => setRemoving(v)}
                      >
                        {removalLabel(removalFor(v.publishedAt))}
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Refreshing>
      )}

      {removing && (
        <RemoveDialog
          noun="video"
          title={removing.title}
          publishedAt={removing.publishedAt}
          learnerRecord="tiến độ của họ"
          onDelete={() => deleteAdminShadowVideo(removing.id)}
          onRetire={() => retireAdminShadowVideo(removing.id).then(() => undefined)}
          onClose={() => setRemoving(null)}
          onDone={() => void refresh()}
        />
      )}
    </PageShell>
  )
}
