import { useRef, useState } from 'react'
import { useGetAdminPassage } from '../../api/gen/kolearn'
import type { Evidence } from '../../api/gen/model'
import { Button, Field, WarnNote } from '../../components/ui'

/**
 * Layer 4 — where the evidence sits, as offsets into the stimulus.
 *
 * A reading span is a character range in the passage; a listening span is a
 * millisecond range in the clip. TCCN-301-4 asks for both, and for one more
 * thing that is easy to leave out and expensive to leave out: when the passage
 * has been edited since a span was stored, say so **before** saving rather
 * than letting the range quietly point somewhere else.
 *
 * That check is what `quoteKo` is for. The span records the text it was aimed
 * at; if the same offsets no longer yield that text, the passage moved under
 * it. Without the stored quote there is nothing to compare against and the
 * drift is undetectable — the evidence highlight simply lands on the wrong
 * sentence on the learner's review screen, and nothing anywhere reports an
 * error.
 */
export function EvidencePicker({
  passageId,
  evidence,
  onChange,
}: {
  passageId: string | null | undefined
  evidence: Evidence[]
  onChange: (evidence: Evidence[]) => void
}) {
  const passageRef = useRef<HTMLParagraphElement>(null)
  const [pending, setPending] = useState<{ start: number; end: number; quote: string } | null>(null)
  const { data: passage } = useGetAdminPassage(passageId ?? '', {
    query: { enabled: !!passageId },
  })

  // TCCN-301-4's boundary sibling, TCCN-114-3: a question with no stimulus has
  // no layer 4, and that is not an error state.
  if (!passageId) {
    return (
      <Field label="Tầng 4 — căn cứ trong ngữ liệu">
        <p className="text-sm text-muted">
          Câu này không kèm ngữ liệu nào, nên không có tầng 4. Đây không phải lỗi.
        </p>
      </Field>
    )
  }

  const text = passage?.textKo ?? null
  const isAudio = !!passage?.audioUrl

  /** The stored quote against what the offsets point at in the passage today. */
  function drifted(e: Evidence): boolean {
    if (text == null || e.charStart == null || e.charEnd == null) return false
    if (!e.quoteKo) return false
    return text.slice(e.charStart, e.charEnd) !== e.quoteKo
  }

  function captureSelection() {
    const el = passageRef.current
    const selection = window.getSelection()
    if (!el || !selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) return

    const before = range.cloneRange()
    before.selectNodeContents(el)
    before.setEnd(range.startContainer, range.startOffset)
    const start = before.toString().length
    const quote = range.toString()
    setPending({ start, end: start + quote.length, quote })
  }

  function addPending() {
    if (!pending) return
    onChange([
      ...evidence,
      {
        passageId,
        charStart: pending.start,
        charEnd: pending.end,
        audioStartMs: null,
        audioEndMs: null,
        quoteKo: pending.quote,
        quoteVi: '',
      },
    ])
    setPending(null)
  }

  return (
    <Field
      label="Tầng 4 — căn cứ trong ngữ liệu"
      hint={
        isAudio
          ? 'Với ngữ liệu tiếng, lưu mốc thời gian bắt đầu và kết thúc của đoạn chứa căn cứ.'
          : 'Bôi đen phần căn cứ trong đoạn văn, rồi bấm “Lấy đoạn đã bôi đen”.'
      }
    >
      <div className="flex flex-col gap-3">
        {text != null && (
          <>
            <p
              ref={passageRef}
              onMouseUp={captureSelection}
              className="ko passage rounded-xl border border-line bg-white p-4"
            >
              {text}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" variant="secondary" onClick={captureSelection}>
                Lấy đoạn đã bôi đen
              </Button>
              {pending && (
                <>
                  <span className="text-sm text-muted">
                    ký tự {pending.start}–{pending.end}: “{pending.quote}”
                  </span>
                  <Button type="button" size="sm" onClick={addPending}>
                    Thêm căn cứ
                  </Button>
                </>
              )}
            </div>
          </>
        )}

        {isAudio && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Bắt đầu (ms)
              <input
                type="number"
                min={0}
                value={evidence[0]?.audioStartMs ?? ''}
                onChange={(e) =>
                  onChange([
                    {
                      ...(evidence[0] ?? { passageId, quoteKo: '', quoteVi: '' }),
                      charStart: null,
                      charEnd: null,
                      audioStartMs: e.target.value === '' ? null : Number(e.target.value),
                      audioEndMs: evidence[0]?.audioEndMs ?? null,
                    },
                    ...evidence.slice(1),
                  ])
                }
                className="tap rounded-xl border border-line bg-white px-4 text-base"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Kết thúc (ms)
              <input
                type="number"
                min={0}
                value={evidence[0]?.audioEndMs ?? ''}
                onChange={(e) =>
                  onChange([
                    {
                      ...(evidence[0] ?? { passageId, quoteKo: '', quoteVi: '' }),
                      charStart: null,
                      charEnd: null,
                      audioStartMs: evidence[0]?.audioStartMs ?? null,
                      audioEndMs: e.target.value === '' ? null : Number(e.target.value),
                    },
                    ...evidence.slice(1),
                  ])
                }
                className="tap rounded-xl border border-line bg-white px-4 text-base"
              />
            </label>
          </div>
        )}

        {evidence.length === 0 ? (
          <p className="text-sm text-muted">Chưa có căn cứ nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {evidence.map((e, i) => (
              <li
                key={e.id ?? `${e.charStart}-${e.audioStartMs}-${i}`}
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">
                    {e.charStart != null
                      ? `ký tự ${e.charStart}–${e.charEnd}`
                      : `${e.audioStartMs} – ${e.audioEndMs} ms`}
                  </span>
                  <button
                    type="button"
                    aria-label={`Xoá căn cứ ${i + 1}`}
                    onClick={() => onChange(evidence.filter((_, j) => j !== i))}
                    className="tap px-2 text-muted hover:text-ink"
                  >
                    ×
                  </button>
                </div>
                {e.quoteKo && <p className="ko mt-1">{e.quoteKo}</p>}
                {drifted(e) && (
                  <div className="mt-2">
                    <WarnNote>
                      Đoạn văn đã đổi từ lúc lưu căn cứ này: vị trí {e.charStart}–{e.charEnd} bây
                      giờ trỏ vào “{text?.slice(e.charStart ?? 0, e.charEnd ?? 0)}”, không phải “
                      {e.quoteKo}”. Bôi đen lại trước khi lưu.
                    </WarnNote>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  )
}
