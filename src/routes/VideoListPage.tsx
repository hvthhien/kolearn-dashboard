import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  createAdminShadowVideo,
  deleteAdminShadowVideo,
  getListAdminShadowVideosQueryKey,
  retireAdminShadowVideo,
  createAdminShadowCategory,
  deleteAdminShadowCategory,
  listAdminShadowCategories,
  saveAdminShadowCategory,
  useListAdminShadowVideos,
  useListAdminShadowCategories,
} from '../api/gen/kolearn'
import type { AdminShadowVideoRow, ShadowVideoStatus } from '../api/gen/model'
import { userMessage } from '../lib/problem'
import { useAuth } from '../lib/auth'
import { RemoveDialog } from '../features/manage/RemoveDialog'
import { removalFor, removalLabel } from '../features/manage/removal'
import { CategoryManagerDialog, type ManagedCategory } from '../features/lessons/CategoryManagerDialog'
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
 * Xưởng ngữ liệu — the list.
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
  const [managingCategories, setManagingCategories] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const canWrite = user?.permissions.includes('shadowing:write') ?? false
  const canPublish = user?.permissions.includes('shadowing:publish') ?? false

  const { data, error: loadError, isPending, isFetching } = useListAdminShadowVideos(
    status === 'ALL' ? undefined : { status },
  )

  /* Read here rather than only inside the dialog, so the button can say how
     many shelves there are and be honestly disabled while the list is in
     flight — a manager opened on an empty array looks like a vocabulary
     somebody deleted. */
  const categories = useListAdminShadowCategories()

  /* No params, so this is the prefix every status filter hangs off — a video
     removed under "Tất cả" must not still be sitting in the cached "Nháp". */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminShadowVideosQueryKey() })

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await createAdminShadowVideo({
        title: 'Ngữ liệu mới',
        level: 2,
      })
      await navigate({ to: '/videos/$videoId', params: { videoId: created.id } })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Xưởng ngữ liệu</PageTitle>
        {/* One button again. It was two while video and audio both existed and
            the kind was unchangeable after creation; 00034 retired video, so
            there is nothing left to choose. */}
        <div className="flex flex-wrap gap-2">
          {/* Beside the create button rather than behind a settings route: an
              author notices a missing shelf while looking at this list, and a
              route would mean leaving it to fix a word. Gated on
              shadowing:write, the same permission the server puts on it. */}
          {canWrite && (
            <Button
              variant="ghost"
              onClick={() => setManagingCategories(true)}
              disabled={categories.data === undefined}
            >
              Chủ đề{categories.data && ` (${categories.data.items.length})`}
            </Button>
          )}
          <Button onClick={() => void create()} disabled={busy}>
            Tạo ngữ liệu mới
          </Button>
        </div>
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
          title="Chưa có ngữ liệu nào"
          action={
            <Button onClick={() => void create()} disabled={busy}>
              Tạo ngữ liệu mới
            </Button>
          }
        >
          Video nhại theo được dựng ở công cụ ngoài rồi tải lên đây.
        </EmptyState>
      ) : (
        <Refreshing busy={isFetching}>
          <Table
            caption="Ngữ liệu nhại theo trong ngân hàng"
            head={
              <tr>
                {/* "Tên ngữ liệu", not "Chủ đề" — chủ đề is now the shelf,
                    and it has a column of its own beside this one. */}
                <Th>Tên ngữ liệu</Th>
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
                  {v.tags.length > 0 && (
                    <p className="mt-1 text-xs text-muted">{v.tags.join(' · ')}</p>
                  )}
                </Td>
                <Td>
                  {/* Said in the list, because this is where somebody notices
                      that nine of eleven rows are unfiled. They cannot notice
                      it one studio page at a time. */}
                  {v.categoryName ?? <span className="text-muted">— chưa chọn —</span>}
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

      {managingCategories && categories.data && (
        <CategoryManagerDialog
          noun="ngữ liệu"
          categories={categories.data.items.map(toManaged)}
          api={{
            list: async () => (await listAdminShadowCategories()).items.map(toManaged),
            create: (input) => createAdminShadowCategory(input),
            save: (id, input) => saveAdminShadowCategory(id, input),
            remove: (id) => deleteAdminShadowCategory(id),
          }}
          onClose={() => setManagingCategories(false)}
          onChanged={() => {
            void categories.refetch()
            /* A rename shows on every row that carries it, so the list behind
               the dialog has to be re-read too. */
            void refresh()
          }}
        />
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

/** The generated row → what the shared manager renders. One mapper rather than
 *  a shared type, because the two features name their counts after their own
 *  nouns (`videoCount` here, `setCount` in dictation) and a shared field would
 *  have to be called something neither screen says. */
function toManaged(c: {
  id: string
  slug: string
  name: string
  ordinal: number
  videoCount: number
  totalVideoCount: number
}): ManagedCategory {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    ordinal: c.ordinal,
    published: c.videoCount,
    total: c.totalVideoCount,
  }
}
