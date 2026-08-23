import { useState } from 'react'
import { saveAdminDictationSet } from '../../api/gen/kolearn'
import type { AdminDictationSetRow, SaveDictationSetRequest } from '../../api/gen/model'
import { userMessage } from '../../lib/problem'
import { Button, Dialog, ErrorNote, Select, TextField } from '../../components/ui'

/**
 * Sửa thông tin bộ — the metadata, and only the metadata.
 *
 * The boundary is the design, not a first cut. Sentences, translations and the
 * dictionary arrive through `cmd/dictation-import`, which is where the audio,
 * the manifest and the validation live; letting this form reach them would mean
 * a screen that can rewrite Korean a native speaker has already signed off. So
 * four fields, and the four are exactly the ones the importer cannot fix after
 * the fact, because it was the manifest that was wrong.
 *
 * A dialog rather than a page because it is opened from two places — the list,
 * where fixing a typo without leaving the list is the whole point, and the
 * studio header. The form is the same in both, and a shared page would have to
 * decide where to return to.
 *
 * Nothing here touches a verdict, and the server agrees: a retitled set is the
 * same audio saying the same sentences, so no sentence goes back for another
 * ear. Only an edit to a sentence does that.
 */
export function EditSetDialog({
  set,
  onClose,
  onSaved,
}: {
  /** Row or detail — both carry the four fields this form owns. */
  set: Pick<AdminDictationSetRow, 'id' | 'title' | 'level' | 'voice' | 'voiceKind'>
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<SaveDictationSetRequest>({
    title: set.title,
    level: set.level,
    voice: set.voice,
    voiceKind: set.voiceKind,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const set1 = <K extends keyof SaveDictationSetRequest>(
    key: K,
    value: SaveDictationSetRequest[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  // Checked here so the button is honestly disabled rather than offering a save
  // the server will refuse. The server checks it too, and that one is the rule.
  const titled = draft.title.trim() !== ''

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveAdminDictationSet(set.id, draft)
      onSaved()
      onClose()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Sửa thông tin bộ"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" form="edit-set" disabled={busy || !titled}>
            Lưu
          </Button>
        </>
      }
    >
      <form id="edit-set" onSubmit={(e) => void save(e)} className="grid gap-3 sm:grid-cols-2">
        <TextField
          id="set-title"
          label="Tên bộ"
          value={draft.title}
          onChange={(e) => set1('title', e.target.value)}
        />
        <Select
          id="set-level"
          label="Cấp độ"
          value={String(draft.level)}
          onChange={(e) => set1('level', Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              TOPIK{n}
            </option>
          ))}
        </Select>
        <TextField
          id="set-voice"
          label="Giọng đọc"
          hint="Nhãn cho người đọc, ví dụ “Nữ”."
          value={draft.voice ?? ''}
          onChange={(e) => set1('voice', e.target.value)}
        />
        <Select
          id="set-voice-kind"
          label="Nguồn giọng"
          hint="Máy đọc không bị cấm — nhưng đó chính là lý do mỗi câu vẫn cần một cái tai."
          value={draft.voiceKind ?? 'SYNTHETIC'}
          onChange={(e) => set1('voiceKind', e.target.value as 'HUMAN' | 'SYNTHETIC')}
        >
          <option value="SYNTHETIC">Do máy tạo</option>
          <option value="HUMAN">Người thật</option>
        </Select>
      </form>

      <p className="mt-3 text-sm text-muted">
        Câu, bản dịch và từ điển đến từ lệnh nhập, không sửa được ở đây. Sửa tên hay cấp độ không
        làm mất kết quả nghe duyệt của câu nào.
      </p>

      {error !== null && <ErrorNote>{userMessage(error)}</ErrorNote>}
    </Dialog>
  )
}
