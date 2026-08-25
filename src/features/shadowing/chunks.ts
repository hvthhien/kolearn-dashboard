import { findSegments, type Segment } from './segment'
import type { EditableChunk, EditableLine } from './lineRules'

/**
 * Proposing where the phrases are inside one line.
 *
 * The same machinery that proposes lines, run at a different scale. Lines are
 * separated by 0.8s of quiet; phrases inside a line are separated by the
 * breath the speaker took, which in this footage is 150–350ms. So the whole
 * difference is `minGapMs`, and `findSegments` needs no change to do it.
 *
 * WHAT IS PROPOSED AND WHAT IS NOT.
 *
 * The TIMINGS come from the audio and are as good as the line timings are.
 * The CHARACTER boundaries do not — nothing here listens for word boundaries in
 * the Korean — so they are placed at eojeol (space) boundaries chosen in
 * proportion to each phrase's duration. That is a guess, and it is a guess that
 * cannot produce the worst outcome: it never cuts a word in half, because it
 * only ever cuts where a space already is.
 *
 * It can still put the split one word early on a line where somebody spoke
 * unevenly. That is why this is an offer, exactly as the line proposer is: an
 * author reads it, drags what is wrong, and a native speaker hears the result.
 */

/** How much quiet inside a line separates two phrases. */
export const CHUNK_GAP_MS = 180

/** Below this, a phrase is not worth practising on its own. */
const MIN_CHUNK_MS = 400

/**
 * Splits one line into phrases, from the media's own audio.
 *
 * `segments` are the speech runs found across the WHOLE file — decoded once and
 * reused for every line, because decoding a thirty-megabyte video per line is
 * a studio that stops responding.
 *
 * Returns an empty array when the line has no internal pause worth cutting at,
 * which is the ordinary answer for a short line and means "leave this one
 * whole".
 */
export function proposeChunks(segments: Segment[], line: EditableLine): EditableChunk[] {
  const inside = segments
    .filter((s) => s.endMs > line.startMs && s.startMs < line.endMs)
    // Clipped to the line: a run that straddles the boundary belongs to this
    // line only as far as the line goes.
    .map((s) => ({
      startMs: Math.max(s.startMs, line.startMs),
      endMs: Math.min(s.endMs, line.endMs),
    }))
    .filter((s) => s.endMs - s.startMs >= MIN_CHUNK_MS)

  // One run, or none, is a line with nothing to cut at.
  if (inside.length < 2) return []

  const boundaries = eojeolBoundaries(line.textKo)
  // Fewer word boundaries than phrases means there is no way to give each
  // phrase its own words. Leaving it whole beats inventing a split.
  if (boundaries.length < inside.length - 1) return []

  const total = inside.reduce((sum, s) => sum + (s.endMs - s.startMs), 0)
  const runes = [...line.textKo].length

  const out: EditableChunk[] = []
  let charCursor = 0
  let elapsed = 0

  inside.forEach((s, i) => {
    elapsed += s.endMs - s.startMs
    const last = i === inside.length - 1
    // The last phrase always runs to the end of the line's text, so the set
    // covers it — which is what the publish gate requires.
    const charEnd = last
      ? runes
      : nearestBoundary(boundaries, Math.round((elapsed / total) * runes), charCursor)

    if (charEnd <= charCursor) return
    out.push({
      startMs: s.startMs,
      endMs: s.endMs,
      charStart: charCursor,
      charEnd,
    })
    // Skip the whitespace between phrases: it belongs to no chunk, and the
    // publish gate's coverage rule is stated on exactly that basis.
    charCursor = skipSpace(line.textKo, charEnd)
  })

  // A single chunk covering the whole line says nothing the line did not.
  return out.length < 2 ? [] : out
}

/**
 * The code-point offsets where a word ends, in a Korean sentence.
 *
 * Eojeol — space-delimited — rather than morphemes. Splitting inside an eojeol
 * would put a particle in a different phrase from the noun it attaches to,
 * which is the same mistake a substring search for a headword makes.
 */
export function eojeolBoundaries(text: string): number[] {
  const runes = [...text]
  const out: number[] = []
  for (let i = 1; i < runes.length; i++) {
    if (runes[i] === ' ' && runes[i - 1] !== ' ') out.push(i)
  }
  return out
}

/** The word boundary closest to `want`, never at or before `floor`. */
function nearestBoundary(boundaries: number[], want: number, floor: number): number {
  let best = -1
  for (const b of boundaries) {
    if (b <= floor) continue
    if (best === -1 || Math.abs(b - want) < Math.abs(best - want)) best = b
  }
  return best
}

function skipSpace(text: string, from: number): number {
  const runes = [...text]
  let i = from
  while (i < runes.length && runes[i] === ' ') i++
  return i
}

/**
 * Decodes a media file once and returns the speech runs in it.
 *
 * Separated from `proposeChunks` so the proposal rule stays pure and testable
 * against a hand-written segment list — the same split `segment.ts` makes
 * between `findSegments` and `proposeSegments`, and for the same reason: jsdom
 * has no AudioContext.
 */
export async function decodeSpeechRuns(source: Blob): Promise<Segment[]> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return []

  const ctx = new Ctor()
  try {
    const buffer = await ctx.decodeAudioData(await source.arrayBuffer())
    return findSegments(buffer, { minGapMs: CHUNK_GAP_MS, minSpeechMs: MIN_CHUNK_MS })
  } finally {
    void ctx.close()
  }
}
