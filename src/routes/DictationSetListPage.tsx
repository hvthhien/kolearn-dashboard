import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useListAdminDictationSets } from '../api/gen/kolearn'
import type { AdminDictationSetRowStatus } from '../api/gen/model'
import { userMessage } from '../lib/problem'
import {
  Badge,
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

type StatusFilter = 'ALL' | AdminDictationSetRowStatus

const STATUS_LABEL: Record<AdminDictationSetRowStatus, string> = {
  DRAFT: 'nháp',
  IN_REVIEW: 'chờ duyệt',
  PUBLISHED: 'đã vào ngân hàng',
  RETIRED: 'đã gỡ',
}

/**
 * Xưởng chép chính tả — the list.
 *
 * There is no "new set" button, and its absence is the design. Sets are created
 * by `cmd/dictation-import`, which is where the audio, the manifest and the
 * validation live; a button here would have to reproduce all three or create an
 * empty set nobody could fill. That is the same sequencing cmd/importer was
 * built on — content lands through the importer, and the studio is where a
 * human signs it off.
 *
 * So what this list is for is finding the sets that still need an ear. The
 * "chưa nghe" count is the column that matters, and it includes verdicts that
 * went stale when a sentence was edited underneath them.
 */
export function DictationSetListPage() {
  const [status, setStatus] = useState<StatusFilter>('ALL')

  const { data, error, isPending, isFetching } = useListAdminDictationSets(
    status === 'ALL' ? undefined : { status },
  )

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Chép chính tả</PageTitle>
      </div>

      <p className="mt-1 text-sm text-muted">
        Bộ được nhập bằng <code className="font-mono text-xs">make dictation-import</code>. Ở đây
        người bản ngữ nghe duyệt từng câu rồi xuất bản.
      </p>

      <FilterChips<StatusFilter>
        label="Trạng thái"
        className="mt-4"
        value={status}
        onChange={setStatus}
        choices={[
          { value: 'ALL', label: 'Tất cả' },
          { value: 'DRAFT', label: 'Nháp' },
          { value: 'IN_REVIEW', label: 'Chờ duyệt' },
          { value: 'PUBLISHED', label: 'Đã vào ngân hàng' },
          { value: 'RETIRED', label: 'Đã gỡ' },
        ]}
      />

      {error != null && <ErrorNote>{userMessage(error)}</ErrorNote>}
      {isPending && <SkeletonList rows={3} label="Đang tải danh sách bộ…" />}

      {data?.items.length === 0 && (
        /* Not `EmptyState`, which requires an action — and this empty state
           genuinely has no in-app one. A set is created by a CLI command on a
           machine with ffmpeg and the audio files, so the honest next step is
           the command itself rather than a button that would have to pretend. */
        <div className="mt-6 rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-medium text-ink">Chưa có bộ nào.</p>
          <p className="mt-1 text-sm text-muted">
            Bộ được tạo bằng lệnh nhập, không tạo được từ màn này:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-line/40 px-3 py-2 font-mono text-xs">
            make dictation-import dir=path/ manifest=set.json
          </pre>
          <p className="mt-2 text-sm text-muted">
            Nhập xong thì quay lại đây để nghe duyệt từng câu.
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <Refreshing busy={isFetching}>
          <Table
            caption="Bộ chép chính tả"
            head={
              <tr>
                <Th>Tên bộ</Th>
                <Th>Cấp độ</Th>
                <Th>Giọng đọc</Th>
                <Th className="text-right">Câu</Th>
                <Th className="text-right">Chưa nghe</Th>
                <Th>Trạng thái</Th>
              </tr>
            }
          >
            {data.items.map((set) => (
              <tr key={set.id}>
                <Td>
                  <Link
                    to="/dictation/$setId"
                    params={{ setId: set.id }}
                    className="font-medium text-brand"
                  >
                    {set.title}
                  </Link>
                </Td>
                <Td>{set.level}</Td>
                <Td>
                  {set.voice || '—'}
                  {set.voiceKind === 'SYNTHETIC' && (
                    <span className="ml-2 text-xs text-muted">do máy tạo</span>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{set.review.total}</Td>
                <Td className="text-right tabular-nums">
                  {/* The number this screen exists for. Zero is the only value
                      that lets a set publish, and it counts stale verdicts —
                      a sentence edited after sign-off needs the ear again. */}
                  {set.review.unreviewed > 0 ? (
                    <Badge tone="warn">{set.review.unreviewed}</Badge>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={set.status === 'PUBLISHED' ? 'ok' : 'neutral'}>
                    {STATUS_LABEL[set.status]}
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
