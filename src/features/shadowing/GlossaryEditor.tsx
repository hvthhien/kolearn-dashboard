import type { AdminShadowGlossaryEntry, AdminShadowLine, ShadowPartOfSpeech } from '../../api/gen/model'
import { Badge, Button, Select, TextField, WarnNote } from '../../components/ui'

const PARTS: { value: ShadowPartOfSpeech; label: string }[] = [
  { value: 'NOUN', label: 'Danh từ' },
  { value: 'VERB', label: 'Động từ' },
  { value: 'ADJECTIVE', label: 'Tính từ' },
  { value: 'ADVERB', label: 'Trạng từ' },
  { value: 'GRAMMAR_PATTERN', label: 'Mẫu ngữ pháp' },
]

/**
 * Normalised the same way the database normalises it, so what the screen calls
 * identical and what the CHECK calls identical are the same thing.
 *
 * Vietnamese diacritics are NOT stripped: "đặt" and "dat" are different words,
 * and treating them as one would refuse a legitimate context meaning.
 */
export function normaliseMeaning(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase().replace(/[.。]+$/, '')
}

export function isContextIdentical(general: string, context: string): boolean {
  return normaliseMeaning(general) === normaliseMeaning(context)
}

export function canSettle(entry: AdminShadowGlossaryEntry): boolean {
  const context = entry.contextMeaningVi.trim()
  // Blank cannot be settled either: "chưa viết" is not "đã chốt".
  return context !== '' && !isContextIdentical(entry.meaningVi, context)
}

/**
 * "Từ điển — chốt nghĩa trong ngữ cảnh."
 *
 * The rule this editor exists for is the one on the second meaning: a context
 * meaning identical to the general meaning cannot be settled. Drafting these
 * with a model copies the general gloss across more often than not, and a
 * learner who reads the same two lines twice concludes the second carries no
 * information — which is true, and which is the whole feature gone.
 *
 * Enforced here for immediate feedback and by a database CHECK for real. The
 * server is authoritative; this is the courtesy layer, and when the server
 * refuses, its own Vietnamese is what gets rendered.
 */
export function GlossaryEditor({
  entries,
  lines,
  onChangeEntry,
  onChangeEntries,
}: {
  entries: AdminShadowGlossaryEntry[]
  lines: AdminShadowLine[]
  onChangeEntry: (index: number, patch: Partial<AdminShadowGlossaryEntry>) => void
  onChangeEntries: (entries: AdminShadowGlossaryEntry[]) => void
}) {
  /**
   * Offers every place the headword appears, verbatim.
   *
   * A plain scan finds the dictionary form where it appears as one — 예약 is a
   * prefix of 예약하려고, so this catches it. What it cannot do is find a form
   * the headword does not literally start, which is why the author can also
   * accept or drop each hit rather than having them applied.
   */
  const findOccurrences = (index: number) => {
    const entry = entries[index]
    if (!entry) return
    const needle = entry.headwordKo.trim()
    if (needle === '') return

    const found = lines.flatMap((line) => {
      const runes = Array.from(line.textKo)
      const needleRunes = Array.from(needle)
      const hits: AdminShadowGlossaryEntry['occurrences'] = []
      for (let i = 0; i + needleRunes.length <= runes.length; i++) {
        if (runes.slice(i, i + needleRunes.length).join('') === needle) {
          hits.push({
            lineId: line.id,
            charStart: i,
            charEnd: i + needleRunes.length,
            surfaceKo: needle,
          })
        }
      }
      return hits
    })
    onChangeEntry(index, { occurrences: found })
  }

  const addEntry = () => {
    onChangeEntries([
      ...entries,
      {
        id: '',
        headwordKo: '',
        readingLatin: '',
        partOfSpeech: 'NOUN',
        meaningVi: '',
        contextMeaningVi: '',
        contextSettled: false,
        occurrences: [],
      },
    ])
  }

  return (
    <div className="mt-2 grid gap-3">
      {entries.map((entry, i) => {
        const identical =
          entry.contextMeaningVi.trim() !== '' &&
          isContextIdentical(entry.meaningVi, entry.contextMeaningVi)

        return (
          <div key={entry.id || `new-${i}`} className="rounded-xl border border-line bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <TextField
                id={`hw-${i}`}
                label="Từ"
                korean
                value={entry.headwordKo}
                onChange={(e) => onChangeEntry(i, { headwordKo: e.target.value })}
              />
              <Select
                id={`pos-${i}`}
                label="Từ loại"
                value={entry.partOfSpeech}
                onChange={(e) =>
                  onChangeEntry(i, { partOfSpeech: e.target.value as ShadowPartOfSpeech })
                }
              >
                {PARTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <TextField
                id={`gen-${i}`}
                label="Nghĩa chung"
                value={entry.meaningVi}
                onChange={(e) => onChangeEntry(i, { meaningVi: e.target.value })}
              />
              <TextField
                id={`ctx-${i}`}
                label="Nghĩa trong ngữ cảnh"
                value={entry.contextMeaningVi}
                onChange={(e) => onChangeEntry(i, { contextMeaningVi: e.target.value })}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {entry.contextSettled ? (
                <Badge tone="ok">đã chốt</Badge>
              ) : (
                <Badge tone="warn">chưa chốt</Badge>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={!canSettle(entry) || entry.contextSettled}
                onClick={() => onChangeEntry(i, { contextSettled: true })}
              >
                Chốt nghĩa
              </Button>
              <Button type="button" variant="ghost" onClick={() => findOccurrences(i)}>
                Tìm trong các câu
              </Button>
              <span className="text-xs text-muted">
                {entry.occurrences.length === 0
                  ? 'chưa gắn vào câu nào'
                  : `xuất hiện ở ${entry.occurrences.length} chỗ`}
              </span>
              <Button
                type="button"
                variant="ghost"
                className="ml-auto"
                onClick={() => onChangeEntries(entries.filter((_, j) => j !== i))}
              >
                Xoá từ
              </Button>
            </div>

            {/* Never a dead button with no explanation: the reason it cannot be
                settled is what tells the author what to write. */}
            {identical && !entry.contextSettled && (
              <WarnNote>
                Nghĩa trong ngữ cảnh đang <strong>giống hệt nghĩa chung</strong>. Viết nghĩa đúng
                trong tình huống của video này rồi mới chốt được — AI hay chép nghĩa chung vào
                đây, đúng cái lỗi cần tránh.
              </WarnNote>
            )}
          </div>
        )
      })}

      <div>
        <Button type="button" variant="secondary" onClick={addEntry}>
          Thêm từ
        </Button>
      </div>
    </div>
  )
}
