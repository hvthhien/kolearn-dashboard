import { describe, expect, it } from 'vitest'
import { findSegments } from './segment'

/**
 * The splitter, against a synthesised buffer.
 *
 * `findSegments` is pure and takes an AudioBuffer, so these need no decoder and
 * no fixture file — which is what lets the one case that matters be written
 * down exactly.
 */

const RATE = 8000

/** Builds a mono buffer from spans of speech, in milliseconds. */
function buffer(durationMs: number, speech: [number, number][]): AudioBuffer {
  const samples = new Float32Array(Math.round((durationMs / 1000) * RATE))
  for (const [startMs, endMs] of speech) {
    const from = Math.round((startMs / 1000) * RATE)
    const to = Math.round((endMs / 1000) * RATE)
    for (let i = from; i < to && i < samples.length; i++) {
      // Alternating so the RMS of any window is a real amplitude rather than
      // an average that cancels itself out.
      samples[i] = i % 2 === 0 ? 0.8 : -0.8
    }
  }
  return {
    sampleRate: RATE,
    length: samples.length,
    duration: durationMs / 1000,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer
}

describe('the silence splitter', () => {
  it('finds the four lines of the sample video', () => {
    // The real timings, from ffmpeg silencedetect on test_video.mp4.
    const got = findSegments(
      buffer(21_000, [
        [4060, 5660],
        [7090, 10_320],
        [12_090, 13_940],
        [15_490, 19_460],
      ]),
    )

    expect(got).toHaveLength(4)
    expect(got[0]?.startMs).toBeGreaterThanOrEqual(4000)
    expect(got[0]?.startMs).toBeLessThanOrEqual(4100)
    expect(got[3]?.endMs).toBeGreaterThanOrEqual(19_400)
    expect(got[3]?.endMs).toBeLessThanOrEqual(19_520)
  })

  /**
   * The regression case, and the reason `minGapMs` exists at all.
   *
   * Line 4 of the sample video contains an internal 0.31s pause at
   * 15.81 → 16.13. A splitter that closes a segment on any silence cuts that
   * sentence in half, and the author then has to notice and merge it back — on
   * every video, forever.
   */
  it('does not cut a sentence at an internal pause', () => {
    const got = findSegments(
      buffer(21_000, [
        [15_490, 15_810],
        [16_130, 19_460],
      ]),
    )

    expect(got).toHaveLength(1)
    expect(got[0]?.startMs).toBeLessThanOrEqual(15_550)
    expect(got[0]?.endMs).toBeGreaterThanOrEqual(19_400)
  })

  it('separates two lines across a real gap', () => {
    // 1.43s apart, the shortest genuine gap in the sample.
    const got = findSegments(
      buffer(12_000, [
        [4060, 5660],
        [7090, 10_320],
      ]),
    )
    expect(got).toHaveLength(2)
  })

  it('ignores a blip too short to be speech', () => {
    const got = findSegments(buffer(6000, [[1000, 1080]]))
    expect(got).toHaveLength(0)
  })

  it('returns nothing for silence', () => {
    expect(findSegments(buffer(5000, []))).toEqual([])
  })
})
