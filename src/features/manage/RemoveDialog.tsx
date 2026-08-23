import { useState } from 'react'
import { userMessage } from '../../lib/problem'
import { Button, Dialog, ErrorNote, WarnNote } from '../../components/ui'
import { removalFor, type Removal } from './removal'

/**
 * The confirmation, shared by the video studio and the dictation studio.
 *
 * One component rather than two, and the shared part is the part worth sharing:
 * which operation runs. `removalFor` decides it from `publishedAt`, this dialog
 * renders that decision, and neither screen gets to disagree — a copy of this
 * file that drifted would drift on the question of whether a learner's history
 * survives.
 *
 * What it will not do is offer both buttons. The reader is told which of the
 * two applies and what it costs, and confirms that; a dialog with "Xoá" beside
 * "Gỡ" makes the reader responsible for a distinction the row already answers.
 */
export function RemoveDialog({
  /** "video" / "bộ" — the noun, lowercase, as it reads mid-sentence. */
  noun,
  title,
  publishedAt,
  /** What learners lose track of if this is deleted: "tiến độ", "kết quả". */
  learnerRecord,
  onDelete,
  onRetire,
  onClose,
  onDone,
}: {
  noun: string
  title: string
  publishedAt: string | undefined
  learnerRecord: string
  onDelete: () => Promise<void>
  onRetire: () => Promise<void>
  onClose: () => void
  onDone: (removal: Removal) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const removal = removalFor(publishedAt)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await (removal === 'DELETE' ? onDelete() : onRetire())
      onDone(removal)
      onClose()
    } catch (err) {
      // Left open on failure. The 409 this most often carries names the other
      // operation in its own Vietnamese, and closing the dialog would take that
      // sentence away at the moment it is the only useful thing on screen.
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={removal === 'DELETE' ? `Xoá hẳn ${noun} này?` : `Gỡ ${noun} khỏi ngân hàng?`}
      onClose={onClose}
      footer={
        <>
          {/* Huỷ first, and focused by the panel rather than this button: the
              destructive action must not be what Enter-on-open triggers. */}
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button
            type="button"
            variant={removal === 'DELETE' ? 'danger' : 'primary'}
            onClick={() => void run()}
            disabled={busy}
          >
            {removal === 'DELETE' ? 'Xoá hẳn' : 'Gỡ khỏi ngân hàng'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink">
        <strong>{title || `(${noun} chưa đặt tên)`}</strong>
      </p>

      {removal === 'DELETE' ? (
        <>
          <p className="mt-3 text-sm text-muted">
            {noun.charAt(0).toUpperCase() + noun.slice(1)} này chưa từng xuất bản, nên chưa có
            người học nào chạm tới. Xoá là xoá hẳn: nội dung và từ điển đi cùng, và không lấy
            lại được.
          </p>
          <WarnNote>Thao tác này không hoàn tác được.</WarnNote>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">
            {noun.charAt(0).toUpperCase() + noun.slice(1)} này đã từng xuất bản nên không xoá
            được — gỡ sẽ đưa nó ra khỏi danh sách của người học ngay lập tức, còn {learnerRecord}{' '}
            và các thẻ đã tạo từ đây thì giữ nguyên.
          </p>
          <p className="mt-2 text-sm text-muted">
            Gỡ rồi vẫn đưa lại được: bấm xuất bản lần nữa, và cổng kiểm tra sẽ chạy lại từ đầu.
          </p>
        </>
      )}

      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
    </Dialog>
  )
}
