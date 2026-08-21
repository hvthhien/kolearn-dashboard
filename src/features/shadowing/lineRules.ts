import type { AdminShadowLine } from '../../api/gen/model'

/**
 * What makes a transcript publishable, decided without React so it can be
 * tested exhaustively and reported live while the editor types.
 *
 * The server recomputes all of it and is authoritative; this exists so an
 * author sees the problem while the fix is one field away rather than after
 * pressing publish.
 */

export type LineIssue =
  | { kind: 'end-not-after-start'; ordinal: number }
  | { kind: 'overlap'; ordinal: number; withOrdinal: number }
  | { kind: 'out-of-order'; ordinal: number }
  | { kind: 'past-end-of-video'; ordinal: number; durationMs: number }
  | { kind: 'empty-korean'; ordinal: number }
  | { kind: 'missing-translation'; ordinal: number }
  | { kind: 'missing-speaker'; ordinal: number }

export interface EditableLine {
  id?: string
  startMs: number
  endMs: number
  textKo: string
  textVi: string
  speaker: string
}

/**
 * Blocking issues make the transcript unplayable or ambiguous. Warnings are
 * real and do not stop a release — the same split the exam publish gate makes,
 * and for the same reason: if warnings blocked too, nobody would publish and
 * the gate would be routed around.
 */
export function blocking(issue: LineIssue): boolean {
  return issue.kind !== 'missing-translation' && issue.kind !== 'missing-speaker'
}

export function validateLines(lines: EditableLine[], durationMs: number | null): LineIssue[] {
  const out: LineIssue[] = []

  lines.forEach((line, i) => {
    const ordinal = i + 1

    if (line.endMs <= line.startMs) out.push({ kind: 'end-not-after-start', ordinal })
    if (line.textKo.trim() === '') out.push({ kind: 'empty-korean', ordinal })
    if (line.textVi.trim() === '') out.push({ kind: 'missing-translation', ordinal })
    if (line.speaker.trim() === '') out.push({ kind: 'missing-speaker', ordinal })

    if (durationMs !== null && line.endMs > durationMs) {
      out.push({ kind: 'past-end-of-video', ordinal, durationMs })
    }

    const previous = lines[i - 1]
    if (previous) {
      // Array order is play order, so an array out of time order makes the
      // video jump backwards.
      if (line.startMs < previous.startMs) out.push({ kind: 'out-of-order', ordinal })
      // Two lines claiming the same audio make "câu trước / câu sau" ambiguous
      // and leave the highlight flickering between two rows.
      else if (line.startMs < previous.endMs) {
        out.push({ kind: 'overlap', ordinal, withOrdinal: ordinal - 1 })
      }
    }
  })

  // Gaps BETWEEN lines are never flagged, in either direction. The 1.4–1.8s of
  // silence between lines is what this footage sounds like, and a warning that
  // fires on every correct video is one nobody reads on the one where it
  // mattered.
  return out
}

export function issueMessage(issue: LineIssue): string {
  switch (issue.kind) {
    case 'end-not-after-start':
      return `Câu ${issue.ordinal}: mốc kết thúc không sau mốc bắt đầu.`
    case 'overlap':
      return `Câu ${issue.ordinal} chồng mốc thời gian với câu ${issue.withOrdinal}.`
    case 'out-of-order':
      return `Câu ${issue.ordinal} bắt đầu trước câu liền trước nó.`
    case 'past-end-of-video':
      return `Câu ${issue.ordinal} kết thúc sau khi video đã hết (${formatMs(issue.durationMs)}).`
    case 'empty-korean':
      return `Câu ${issue.ordinal}: chưa có lời tiếng Hàn.`
    case 'missing-translation':
      return `Câu ${issue.ordinal}: chưa có bản dịch tiếng Việt.`
    case 'missing-speaker':
      return `Câu ${issue.ordinal}: chưa ghi người nói.`
  }
}

/** `1:04.320` — minutes, seconds, milliseconds. */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function sortByStart<T extends { startMs: number }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => a.startMs - b.startMs)
}

/** A verdict measured against a revision the line has since moved past. */
export function isStale(line: AdminShadowLine): boolean {
  return line.approval.stale === true
}
