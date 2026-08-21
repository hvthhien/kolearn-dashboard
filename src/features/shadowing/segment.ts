/**
 * Proposing where the lines are, by listening for the gaps.
 *
 * Runs in the browser, and that is a constraint rather than a preference: the
 * obvious implementation is `ffmpeg silencedetect`, and the API is a serverless
 * Go function with no ffmpeg binary, a sixty-second ceiling, and no local copy
 * of the bytes — they go straight to R2. The dashboard already holds the File,
 * so decoding it here costs the server nothing.
 *
 * What this buys is the difference between the studio being usable and being
 * abandoned: it turns "transcribe 28 lines from zero" into "adjust 28 proposed
 * rows". The output is always an offer. Nothing applies it without a click.
 */

export interface Segment {
  startMs: number
  endMs: number
}

export interface SegmentOptions {
  /**
   * How quiet counts as silence, relative to the loudest sample. -40dB matches
   * what `silencedetect` finds on this footage.
   */
  thresholdDb?: number
  /**
   * The shortest gap that separates two lines.
   *
   * This is the number that matters. In the sample video the lines are 1.4–1.8s
   * apart, but line 4 contains an internal 0.31s pause — so a splitter keyed on
   * any silence at all cuts a sentence in half. Anything comfortably above that
   * pause and below the real gaps works; 0.8s is the middle of that range.
   */
  minGapMs?: number
  /** Segments shorter than this are noise, not speech. */
  minSpeechMs?: number
}

export function findSegments(buffer: AudioBuffer, opts: SegmentOptions = {}): Segment[] {
  const thresholdDb = opts.thresholdDb ?? -40
  const minGapMs = opts.minGapMs ?? 800
  const minSpeechMs = opts.minSpeechMs ?? 300

  const data = buffer.getChannelData(0)
  const rate = buffer.sampleRate
  const windowSamples = Math.max(1, Math.floor((rate * 20) / 1000)) // 20ms windows

  // Peak-relative, so a quietly mastered file is not read as silence
  // throughout.
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] ?? 0)
    if (v > peak) peak = v
  }
  if (peak === 0) return []
  const threshold = peak * Math.pow(10, thresholdDb / 20)

  const loud: boolean[] = []
  for (let start = 0; start < data.length; start += windowSamples) {
    let sum = 0
    let n = 0
    for (let i = start; i < start + windowSamples && i < data.length; i++) {
      const v = data[i] ?? 0
      sum += v * v
      n++
    }
    loud.push(n > 0 && Math.sqrt(sum / n) >= threshold)
  }

  const msPerWindow = (windowSamples / rate) * 1000
  const segments: Segment[] = []
  let openedAt: number | null = null
  let quietSince: number | null = null

  loud.forEach((isLoud, i) => {
    const ms = i * msPerWindow
    if (isLoud) {
      if (openedAt === null) openedAt = ms
      quietSince = null
      return
    }
    if (openedAt === null) return
    if (quietSince === null) quietSince = ms
    // Only a gap long enough to be a line break closes a segment. A shorter
    // one is a breath inside a sentence.
    if (ms - quietSince >= minGapMs) {
      if (quietSince - openedAt >= minSpeechMs) {
        segments.push({ startMs: Math.round(openedAt), endMs: Math.round(quietSince) })
      }
      openedAt = null
      quietSince = null
    }
  })

  if (openedAt !== null) {
    const endMs = quietSince ?? loud.length * msPerWindow
    if (endMs - openedAt >= minSpeechMs) {
      segments.push({ startMs: Math.round(openedAt), endMs: Math.round(endMs) })
    }
  }

  return segments
}

/** Decodes a file and proposes its segments. Separated so `findSegments` stays
 *  pure and testable against a synthesised buffer. */
export async function proposeSegments(file: File, opts?: SegmentOptions): Promise<Segment[]> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return []

  const ctx = new Ctor()
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
    return findSegments(buffer, opts)
  } finally {
    void ctx.close()
  }
}
