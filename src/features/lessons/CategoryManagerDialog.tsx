import { useState } from 'react'
import { userMessage } from '../../lib/problem'
import { Button, Dialog, ErrorNote, TextField, WarnNote } from '../../components/ui'

/**
 * Sửa danh sách chủ đề — the curated vocabulary itself.
 *
 * A dialog on the list screen rather than a page of its own. Editing the
 * vocabulary is something somebody does once in a while, from the screen where
 * they just noticed a shelf was missing, and a route would mean leaving the
 * list to fix a word and finding their way back.
 *
 * One component for nhại theo and chép chính tả even though the vocabularies
 * are separate on the server (migration 00035). The `api` prop below is the
 * whole difference between the two, which is what keeps them from ever sharing
 * a row: this component knows nothing about which feature it is editing.
 *
 * ORDER is a number an author types, not a drag handle. A drag list needs a
 * reorder endpoint, a stable index and a spinner per row to be honest about
 * what saved; a number in a field is one PUT, and the row this orders is six
 * chips long.
 */

export interface ManagedCategory {
  id: string
  slug: string
  name: string
  ordinal: number
  /** Published lessons — what a learner can find under this chip. */
  published: number
  /** Drafts included — what says whether deleting would strand work. */
  total: number
}

export interface CategoryApi {
  list: () => Promise<ManagedCategory[]>
  create: (input: { name: string; slug: string; ordinal: number }) => Promise<unknown>
  save: (id: string, input: { name: string; slug: string; ordinal: number }) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
}

export function CategoryManagerDialog({
  noun,
  categories,
  api,
  onClose,
  onChanged,
}: {
  /** "ngữ liệu" / "bộ" — the noun, lowercase, as it reads mid-sentence. */
  noun: string
  categories: ManagedCategory[]
  api: CategoryApi
  onClose: () => void
  /** Refetches the list behind the dialog, so a rename shows on the rows that
   *  carry it without the author having to reload. */
  onChanged: () => void
}) {
  const [rows, setRows] = useState<ManagedCategory[]>(categories)
  const [draftName, setDraftName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  /** The row awaiting a second click. Deleting never refuses on the server, so
   *  the confirmation is the only thing standing in front of it. */
  const [confirming, setConfirming] = useState<string | null>(null)

  const reload = async () => {
    setRows(await api.list())
    onChanged()
  }

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = draftName.trim()
    if (name === '') return
    // No slug: the server derives one from the name, which is why an author
    // typing "Tin tức" into a one-field form never meets the concept.
    await run(() => api.create({ name, slug: '', ordinal: nextOrdinal(rows) }))
    setDraftName('')
  }

  return (
    <Dialog
      open
      title="Chủ đề"
      onClose={onClose}
      footer={
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Xong
        </Button>
      }
    >
      <p className="text-sm text-muted">
        Chủ đề là các mục người học chọn ở đầu danh sách. Số bên cạnh là số {noun} đã xuất bản
        nằm dưới mục đó.
      </p>

      <ul className="mt-4 grid gap-2">
        {rows.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            noun={noun}
            busy={busy}
            confirming={confirming === c.id}
            onConfirm={() => setConfirming(c.id)}
            onCancelConfirm={() => setConfirming(null)}
            onSave={(input) => run(() => api.save(c.id, input))}
            onDelete={() => {
              setConfirming(null)
              return run(() => api.remove(c.id))
            }}
          />
        ))}
      </ul>

      <form onSubmit={(e) => void add(e)} className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <TextField
            id="new-category"
            label="Thêm chủ đề"
            hint="Đường dẫn được tạo tự động từ tên."
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy || draftName.trim() === ''}>
          Thêm
        </Button>
      </form>

      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
    </Dialog>
  )
}

function CategoryRow({
  category,
  noun,
  busy,
  confirming,
  onConfirm,
  onCancelConfirm,
  onSave,
  onDelete,
}: {
  category: ManagedCategory
  noun: string
  busy: boolean
  confirming: boolean
  onConfirm: () => void
  onCancelConfirm: () => void
  onSave: (input: { name: string; slug: string; ordinal: number }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [name, setName] = useState(category.name)
  const [ordinal, setOrdinal] = useState(String(category.ordinal))

  const dirty = name.trim() !== category.name || Number(ordinal) !== category.ordinal

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <TextField
            id={`cat-name-${category.id}`}
            label="Tên"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="w-24">
          <TextField
            id={`cat-ordinal-${category.id}`}
            label="Thứ tự"
            inputMode="numeric"
            value={ordinal}
            onChange={(e) => setOrdinal(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={busy || !dirty || name.trim() === ''}
          onClick={() =>
            void onSave({
              name: name.trim(),
              /* The slug is sent back unchanged rather than re-derived from the
                 name. Re-deriving would silently rewrite it on every rename,
                 breaking whatever held the old one — a seed script, an import
                 manifest — for the sake of tidiness nobody asked for. */
              slug: category.slug,
              ordinal: Number(ordinal) || 0,
            })
          }
        >
          Lưu
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-wrong hover:bg-wrong/10"
          disabled={busy}
          onClick={confirming ? () => void onDelete() : onConfirm}
        >
          {confirming ? 'Xoá thật' : 'Xoá'}
        </Button>
        {confirming && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancelConfirm}>
            Huỷ
          </Button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">
        <span className="tabular-nums">{category.published}</span> {noun} đã xuất bản
        {category.total > category.published && (
          <>
            {' · '}
            <span className="tabular-nums">{category.total - category.published}</span> bản nháp
          </>
        )}
        {' · '}
        <code className="rounded bg-surface px-1">{category.slug}</code>
      </p>

      {confirming && (
        /* Said before the second click rather than after: the server does not
           refuse this, deliberately, so this sentence is the only warning
           anybody gets. Nothing is lost except the filing. */
        <WarnNote>
          Xoá chủ đề này thì {category.total} {noun} đang xếp trong đó vẫn còn nguyên, chỉ là không
          còn chủ đề — người học sẽ chỉ thấy chúng ở mục “Tất cả”.
        </WarnNote>
      )}
    </li>
  )
}

/** Ten past the last, so a new category lands at the end of the row and there
 *  is room to slot one in front of it without renumbering everything. */
function nextOrdinal(rows: ManagedCategory[]): number {
  return rows.reduce((max, c) => Math.max(max, c.ordinal), 0) + 10
}
