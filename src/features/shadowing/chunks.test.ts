import { describe, expect, it } from 'vitest'
import { eojeolBoundaries, proposeChunks } from './chunks'
import type { EditableLine } from './lineRules'

/**
 * Proposing phrases inside one line.
 *
 * The timings come from the audio and are as trustworthy as the line timings.
 * The character boundaries are a guess — nothing here listens for word
 * boundaries in the Korean — so what these tests pin is the property that makes
 * the guess safe: it only ever cuts where a space already is, so it can be one
 * word early and can never cut a word in half.
 */

// 네, 새로운 프로젝트 때문에 회의가 많았어요. — 25 code points, spaces at 2, 6, 11, 15, 19.
const KO = '네, 새로운 프로젝트 때문에 회의가 많았어요.'

function line(over: Partial<EditableLine> = {}): EditableLine {
  return {
    startMs: 7000,
    endMs: 11000,
    textKo: KO,
    textVi: 'dịch',
    transcription: '',
    speaker: '지수',
    chunks: [],
    ...over,
  }
}

describe('eojeolBoundaries', () => {
  it('finds every space that ends a word, and no others', () => {
    expect(eojeolBoundaries(KO)).toEqual([2, 6, 11, 15, 19])
  })

  it('does not report a run of spaces twice', () => {
    expect(eojeolBoundaries('가  나')).toEqual([1])
  })

  it('has nothing to say about a single word', () => {
    expect(eojeolBoundaries('프로젝트')).toEqual([])
  })
})

describe('proposeChunks', () => {
  it('leaves a line whole when it has no internal pause', () => {
    expect(proposeChunks([{ startMs: 7000, endMs: 11000 }], line())).toEqual([])
  })

  it('leaves a line whole when nothing overlaps it', () => {
    expect(proposeChunks([{ startMs: 20_000, endMs: 22_000 }], line())).toEqual([])
  })

  /**
   * The property everything else rests on: a boundary lands on a space.
   *
   * A cut inside an eojeol puts a particle in a different phrase from the noun
   * it attaches to — the same mistake a substring search for a headword makes,
   * and the one the publish gate refuses when it falls through a dictionary
   * word.
   */
  it('cuts only where a space already is', () => {
    const chunks = proposeChunks(
      [
        { startMs: 7000, endMs: 8600 },
        { startMs: 8900, endMs: 11_000 },
      ],
      line(),
    )
    expect(chunks).toHaveLength(2)

    const boundaries = new Set(eojeolBoundaries(KO))
    expect(boundaries.has(chunks[0]!.charEnd)).toBe(true)

    // And the words are whole on both sides.
    const runes = [...KO]
    expect(runes.slice(chunks[0]!.charStart, chunks[0]!.charEnd).join('')).not.toMatch(/^\s|\s$/)
  })

  it('covers the line end to end, skipping only whitespace', () => {
    const chunks = proposeChunks(
      [
        { startMs: 7000, endMs: 8600 },
        { startMs: 8900, endMs: 11_000 },
      ],
      line(),
    )

    // What the publish gate requires: starts at 0, ends at the last character,
    // and everything skipped between chunks is whitespace.
    expect(chunks[0]!.charStart).toBe(0)
    expect(chunks[chunks.length - 1]!.charEnd).toBe([...KO].length)

    const runes = [...KO]
    for (let i = 1; i < chunks.length; i++) {
      const gap = runes.slice(chunks[i - 1]!.charEnd, chunks[i]!.charStart).join('')
      expect(gap.trim()).toBe('')
    }
  })

  it('keeps the phrases inside the line and in order', () => {
    const l = line()
    const chunks = proposeChunks(
      [
        { startMs: 6800, endMs: 8600 }, // starts before the line
        { startMs: 8900, endMs: 11_400 }, // ends after it
      ],
      l,
    )
    expect(chunks[0]!.startMs).toBe(l.startMs)
    expect(chunks[chunks.length - 1]!.endMs).toBe(l.endMs)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startMs).toBeGreaterThanOrEqual(chunks[i - 1]!.endMs)
      expect(chunks[i]!.charStart).toBeGreaterThanOrEqual(chunks[i - 1]!.charEnd)
    }
  })

  it('ignores a run too short to be a phrase worth practising', () => {
    const chunks = proposeChunks(
      [
        { startMs: 7000, endMs: 10_800 },
        { startMs: 10_900, endMs: 11_000 }, // 100ms — a click, not a phrase
      ],
      line(),
    )
    expect(chunks).toEqual([])
  })

  /**
   * Fewer word boundaries than phrases means there is no way to give each
   * phrase its own words. Leaving the line whole beats inventing a split.
   */
  it('leaves a line whole when its text has too few words to divide', () => {
    const chunks = proposeChunks(
      [
        { startMs: 7000, endMs: 8600 },
        { startMs: 8900, endMs: 11_000 },
      ],
      line({ textKo: '프로젝트' }),
    )
    expect(chunks).toEqual([])
  })
})
