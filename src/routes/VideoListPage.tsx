import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { createAdminShadowVideo, useListAdminShadowVideos } from '../api/gen/kolearn'
import type { ShadowVideoStatus } from '../api/gen/model'
import { userMessage } from '../lib/problem'
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
 */
export function VideoListPage() {
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const navigate = useNavigate()

  const { data, error: loadError, isPending, isFetching } = useListAdminShadowVideos(
    status === 'ALL' ? undefined : { status },
  )

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
              </tr>
            ))}
          </Table>
        </Refreshing>
      )}
    </PageShell>
  )
}
