import type { RefObject } from 'react'
import { Button, Field, Textarea } from '../../components/ui'
import { formatMs, type EditableLine } from './lineRules'

/**
 * Setting the mark for every line without misery.
 *
 * `EvidencePicker` is this app's existing take on the same problem, and it is
 * deliberately crude: two raw millisecond boxes, no player, and it only ever
 * edits `evidence[0]`. The number inputs are kept — an author who knows the
 * number types it, and they are the assertable surface — and everything else is
 * replaced by a `<video>` wired to the row being edited.
 *
 * The single behaviour that makes twenty-eight lines tractable is that
 * selecting a row moves the playhead. Everything else here is in service of
 * that: set-from-playhead, per-line preview, and nudges at the size of the
 * difference between a clean cut and a clipped final consonant.
 */
export function LineEditor({
  lines,
  activeIndex,
  videoRef,
  onActivate,
  onChangeLine,
  onChangeLines,
  onProposeChunks,
}: {
  lines: EditableLine[]
  activeIndex: number
  videoRef: RefObject<HTMLVideoElement | null>
  onActivate: (index: number) => void
  onChangeLine: (index: number, patch: Partial<EditableLine>) => void
  onChangeLines: (lines: EditableLine[]) => void
  /** Undefined while the media has not been decoded — the button says so
   *  rather than disappearing. */
  onProposeChunks?: (index: number) => void
}) {
  const playheadMs = () => Math.round((videoRef.current?.currentTime ?? 0) * 1000)

  const seek = (ms: number) => {
    const el = videoRef.current
    if (el) el.currentTime = ms / 1000
  }

  const preview = (line: EditableLine) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = line.startMs / 1000
    // `play()` returns undefined in some engines, so the promise is wrapped
    // rather than assumed.
    void Promise.resolve(el.play()).catch(() => {})
    const stop = () => {
      if (el.currentTime * 1000 >= line.endMs) {
        el.pause()
        el.removeEventListener('timeupdate', stop)
      }
    }
    el.addEventListener('timeupdate', stop)
  }

  const insertAfter = (index: number) => {
    const at = lines[index]
    const next = [...lines]
    next.splice(index + 1, 0, {
      startMs: at ? at.endMs : 0,
      endMs: at ? at.endMs + 1000 : 1000,
      textKo: '',
      textVi: '',
      speaker: at?.speaker ?? '',
      chunks: [],
    })
    onChangeLines(next)
  }

  /**
   * Split and merge are not polish.
   *
   * Silence detection finds AUDIO boundaries, not sentence boundaries: a
   * hesitation splits one line in two, and two quick conversational turns
   * merge into one. Without these, fixing that means retyping millisecond
   * values by hand for the rest of the video.
   */
  const splitAt = (index: number) => {
    const line = lines[index]
    if (!line) return
    const cut = playheadMs()
    if (cut <= line.startMs || cut >= line.endMs) return
    const next = [...lines]
    next.splice(
      index,
      1,
      // Splitting a line throws its chunks away rather than trying to divide
      // them: the Korean of the second half is empty, so every offset in it
      // would point at nothing. Re-proposing is one click.
      { ...line, endMs: cut, chunks: [] },
      { startMs: cut, endMs: line.endMs, textKo: '', textVi: '', speaker: line.speaker, chunks: [] },
    )
    onChangeLines(next)
  }

  const mergeWithNext = (index: number) => {
    const line = lines[index]
    const after = lines[index + 1]
    if (!line || !after) return
    const next = [...lines]
    next.splice(index, 2, {
      ...line,
      endMs: after.endMs,
      textKo: `${line.textKo} ${after.textKo}`.trim(),
      textVi: `${line.textVi} ${after.textVi}`.trim(),
    })
    onChangeLines(next)
  }

  const speakers = [...new Set(lines.map((l) => l.speaker).filter(Boolean))]

  return (
    <ol className="mt-2 grid gap-2">
      {lines.map((line, i) => {
        const active = i === activeIndex
        if (!active) {
          return (
            <li key={line.id ?? `new-${i}`}>
              <button
                type="button"
                onClick={() => {
                  onActivate(i)
                  seek(line.startMs)
                }}
                className="tap flex w-full items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 text-left hover:border-brand"
              >
                <span className="font-mono text-xs text-muted">{i + 1}</span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {formatMs(line.startMs)}–{formatMs(line.endMs)}
                </span>
                <span className="ko block max-w-md truncate">{line.textKo || '—'}</span>
              </button>
            </li>
          )
        }

        return (
          <li
            key={line.id ?? `new-${i}`}
            className="rounded-xl border border-brand bg-brand-50 p-3"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted">câu {i + 1}</span>
              <span className="font-mono text-xs tabular-nums text-muted">
                {formatMs(line.startMs)}–{formatMs(line.endMs)}
              </span>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <MarkRow
                label="Bắt đầu (ms)"
                value={line.startMs}
                onChange={(startMs) => onChangeLine(i, { startMs })}
                onFromPlayhead={() => onChangeLine(i, { startMs: playheadMs() })}
              />
              <MarkRow
                label="Kết thúc (ms)"
                value={line.endMs}
                onChange={(endMs) => onChangeLine(i, { endMs })}
                onFromPlayhead={() => onChangeLine(i, { endMs: playheadMs() })}
              />
            </div>

            <div className="mt-2 grid gap-2">
              <Textarea
                id={`ko-${i}`}
                label="Câu tiếng Hàn"
                korean
                rows={2}
                value={line.textKo}
                onChange={(e) => onChangeLine(i, { textKo: e.target.value })}
              />
              <Textarea
                id={`vi-${i}`}
                label="Bản dịch tiếng Việt"
                rows={2}
                value={line.textVi}
                onChange={(e) => onChangeLine(i, { textVi: e.target.value })}
              />
              <Field label="Người nói" htmlFor={`sp-${i}`}>
                {/* A datalist rather than free text alone, so "Nữ" and "nữ "
                    do not both end up in one video. TopicPicker's lesson at a
                    scale that does not justify a catalogue. */}
                <input
                  id={`sp-${i}`}
                  list="speaker-names"
                  value={line.speaker}
                  onChange={(e) => onChangeLine(i, { speaker: e.target.value })}
                  className="tap ko rounded-xl border border-line bg-white px-3 text-ink"
                />
                <datalist id="speaker-names">
                  {speakers.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
            </div>

            {line.chunks.length > 0 && (
              <ol className="mt-2 flex flex-wrap gap-1">
                {line.chunks.map((c, n) => (
                  <li
                    key={n}
                    className="rounded-lg border border-line bg-white px-2 py-1"
                  >
                    <span className="font-mono text-[11px] tabular-nums text-muted">
                      {formatMs(c.startMs)}–{formatMs(c.endMs)}
                    </span>{' '}
                    <span className="ko text-sm">
                      {[...line.textKo].slice(c.charStart, c.charEnd).join('')}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => preview(line)}>
                Nghe thử câu này
              </Button>
              <Button type="button" variant="ghost" onClick={() => splitAt(i)}>
                Tách tại vị trí đang phát
              </Button>
              {/*
                Chia cụm is not Tách câu, and the two are easy to confuse.

                Tách makes two LINES out of one — two units of approval, two
                rows in the transcript. Chia cụm leaves one line and one
                approval, and gives the learner somewhere smaller to loop
                inside it. Only the second is reversible with one click, which
                is why it sits beside its own "Bỏ chia cụm".
              */}
              {onProposeChunks && (
                <Button type="button" variant="ghost" onClick={() => onProposeChunks(i)}>
                  Chia cụm tự động
                </Button>
              )}
              {line.chunks.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onChangeLine(i, { chunks: [] })}
                >
                  Bỏ chia cụm ({line.chunks.length})
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => mergeWithNext(i)}
                disabled={i === lines.length - 1}
              >
                Gộp với câu sau
              </Button>
              <Button type="button" variant="ghost" onClick={() => insertAfter(i)}>
                Thêm câu sau
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChangeLines(lines.filter((_, j) => j !== i))}
              >
                Xoá câu
              </Button>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function MarkRow({
  label,
  value,
  onChange,
  onFromPlayhead,
}: {
  label: string
  value: number
  onChange: (ms: number) => void
  onFromPlayhead: () => void
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="tap w-28 rounded-xl border border-line bg-white px-3 text-ink tabular-nums"
        />
        {/* ±100ms, and ±10ms with Shift. The gap between a clean cut and a
            clipped final consonant is about 50ms, and nobody hits that by
            dragging a scrub bar. */}
        <Button
          type="button"
          variant="ghost"
          onClick={(e) => onChange(value - (e.shiftKey ? 10 : 100))}
          aria-label={`${label} sớm hơn`}
        >
          −
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={(e) => onChange(value + (e.shiftKey ? 10 : 100))}
          aria-label={`${label} muộn hơn`}
        >
          +
        </Button>
        <Button type="button" variant="secondary" onClick={onFromPlayhead}>
          Lấy mốc từ vị trí đang phát
        </Button>
      </div>
    </Field>
  )
}
