import { useState } from 'react'
import { userMessage } from '../../lib/problem'
import { BusyDot } from '../../components/ui'
import { CategoryOptions, type CategoryOption } from './taxonomy'

/**
 * Đổi chủ đề ngay trên danh sách.
 *
 * The list is where somebody notices that nine of eleven rows are unfiled —
 * that is why the column exists at all — and until now noticing it and fixing
 * it were different screens. Filing eleven rows meant eleven dialogs, or
 * eleven trips into the studio and back, and the cost of that is not the
 * clicks: it is that an author who has the whole shelf in their head loses it
 * somewhere around the fourth round trip and stops.
 *
 * So the same closed vocabulary as the dialog, in the cell that was already
 * naming it. A `<select>` and never a text field, for the reason the dialog
 * gives: an author who can type a category fragments the learner's chip row on
 * the first typo, and being quicker here would make that easier rather than
 * harder.
 *
 * There is no confirm step and no save button. One choice from a closed list
 * is not a destructive edit — it moves a lesson between shelves, both of which
 * are visible, and the way back is the same control. A dialog to confirm it
 * would cost more than the mistake.
 *
 * What this deliberately does NOT reach is anything else on the row. Level,
 * voice and nhãn stay behind "Sửa": they are typed rather than chosen, and a
 * cell that saves on every keystroke is a different, worse thing.
 */
export function InlineCategoryCell({
  rowTitle,
  categories,
  loading = false,
  value,
  name,
  canEdit,
  onSave,
}: {
  /** Names the control for a screen reader. A table full of selects labelled
   *  "Chủ đề" tells somebody arrowing through them nothing about which row
   *  they are on. */
  rowTitle: string
  categories: CategoryOption[]
  /** Absent while the vocabulary is still in flight, so the control can be
   *  honestly disabled rather than showing a menu with nothing on it. */
  loading?: boolean
  value: string
  /** What the row itself calls that category. The row is authoritative about
   *  its own filing, so the read-only rendering names it from here rather than
   *  looking the id up in a list that may still be loading. */
  name?: string
  /** `dictation:write` / `shadowing:write`. Without it this falls back to the
   *  text the column showed before — reading the filing is not writing it. */
  canEdit: boolean
  /**
   * Must resolve only once the list has been re-read, not merely once the PUT
   * returned. `pending` below is dropped when this settles, so resolving early
   * would flip the cell back to the old shelf for one frame and then forward
   * again.
   */
  onSave: (categoryId: string) => Promise<void>
}) {
  /* The chosen id, held until the refetched row carries it. Without this the
     select snaps back to its old value for the length of the round trip, which
     reads as a save that did not take. */
  const [pending, setPending] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (!canEdit) {
    return name ?? <span className="text-muted">— chưa chọn —</span>
  }

  const change = async (next: string) => {
    setPending(next)
    setBusy(true)
    setError(null)
    try {
      await onSave(next)
    } catch (err) {
      /* Back to whatever the row still says. A cell left showing the shelf the
         server just refused is worse than no quick edit at all: the next person
         to read this list would be reading a lie. */
      setError(err)
    } finally {
      setPending(null)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          aria-label={`Chủ đề — ${rowTitle}`}
          className="tap max-w-44 rounded-xl border border-line bg-white px-2 text-sm text-ink"
          value={pending ?? value}
          disabled={loading || busy}
          onChange={(e) => void change(e.target.value)}
        >
          <CategoryOptions categories={categories} value={pending ?? value} />
        </select>
        {busy && <BusyDot />}
      </div>
      {/* In the cell rather than the page banner: with a column of these, a
          notice at the top would not say which row refused. */}
      {error !== null && (
        <p role="alert" className="text-xs text-wrong">
          {userMessage(error)}
        </p>
      )}
    </div>
  )
}
