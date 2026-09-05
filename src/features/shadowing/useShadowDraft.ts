import { useCallback, useMemo, useState } from 'react'
import type {
  AdminShadowGlossaryEntry,
  AdminShadowVideoDetail,
  SaveShadowGlossaryRequest,
  SaveShadowLinesRequest,
  SaveShadowVideoRequest,
} from '../../api/gen/model'
import type { EditableLine } from './lineRules'
import { formatTags, parseTags } from '../lessons/taxonomy'

/**
 * The studio's working copy.
 *
 * Same shape as `useQuestionDraft`: one hook holding what the editor is
 * changing, and the page owning `busy` / `saved` / `error` beside it. The
 * requests are `useMemo`s so a save never has to re-derive what is on screen.
 */

export interface ShadowDraft {
  title: string
  level: number
  voice: string
  voiceKind: 'HUMAN' | 'SYNTHETIC'
  topicIds: string[]
  /** Chủ đề. Empty is uncategorised, which is what the request means by it too
   *  — see SaveShadowVideoRequest. NOT the same axis as topicIds: that one is
   *  the grammar taxonomy SC-WEAKNESS counts against. */
  categoryId: string
  /** Nhãn, as the raw comma-separated TEXT rather than the parsed array. That
   *  is what lets an author type a comma and keep going; parsing on every
   *  keystroke would delete the separator they just pressed. */
  tagsText: string
  lines: EditableLine[]
  glossary: AdminShadowGlossaryEntry[]
}

function toDraft(video: AdminShadowVideoDetail): ShadowDraft {
  return {
    title: video.title,
    level: video.level,
    voice: video.voice,
    voiceKind: video.voiceKind,
    topicIds: video.topics.map((t) => t.id),
    categoryId: video.categoryId ?? '',
    tagsText: formatTags(video.tags),
    lines: video.lines.map((l) => ({
      id: l.id,
      startMs: l.startMs,
      endMs: l.endMs,
      textKo: l.textKo,
      textVi: l.textVi,
      transcription: l.transcription,
      speaker: l.speaker,
      chunks: l.chunks.map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        charStart: c.charStart,
        charEnd: c.charEnd,
      })),
    })),
    glossary: video.glossary.map((g) => ({ ...g, occurrences: [...g.occurrences] })),
  }
}

export function useShadowDraft(video: AdminShadowVideoDetail) {
  const [draft, setDraft] = useState<ShadowDraft>(() => toDraft(video))

  const set = useCallback(<K extends keyof ShadowDraft>(key: K, value: ShadowDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
  }, [])

  const setLine = useCallback((index: number, patch: Partial<EditableLine>) => {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }))
  }, [])

  /**
   * Editing either meaning re-opens the decision.
   *
   * Without this, "chốt rồi sửa lại" walks straight past the one rule this
   * editor exists to enforce: settle a real context meaning, then edit it back
   * to the general one, and nothing objects. The server's CHECK catches it on
   * the next save, but by then the screen has been lying about it.
   */
  const setEntry = useCallback((index: number, patch: Partial<AdminShadowGlossaryEntry>) => {
    setDraft((d) => ({
      ...d,
      glossary: d.glossary.map((g, i) => {
        if (i !== index) return g
        const next = { ...g, ...patch }
        const touched =
          ('contextMeaningVi' in patch && patch.contextMeaningVi !== g.contextMeaningVi) ||
          ('meaningVi' in patch && patch.meaningVi !== g.meaningVi)
        return touched ? { ...next, contextSettled: false } : next
      }),
    }))
  }, [])

  const videoRequest = useMemo<SaveShadowVideoRequest>(
    () => ({
      title: draft.title.trim(),
      level: draft.level,
      voice: draft.voice.trim(),
      voiceKind: draft.voiceKind,
      topicIds: draft.topicIds,
      categoryId: draft.categoryId,
      // Parsed at send time, not per keystroke. The server trims,
      // de-duplicates and caps again — this is the shape, not the rule.
      tags: parseTags(draft.tagsText),
    }),
    [draft],
  )

  const linesRequest = useMemo<SaveShadowLinesRequest>(
    () => ({
      // Ordinals come from array order on the server, so nothing is sent for
      // them: one source of truth for "which line is câu 4".
      lines: draft.lines.map((l) => ({
        ...(l.id ? { id: l.id } : {}),
        startMs: l.startMs,
        endMs: l.endMs,
        textKo: l.textKo.trim(),
        textVi: l.textVi.trim(),
        // Collapsed, not just trimmed. This one is typed by hand against a
        // syllable count and arrives with double spaces in it, and two spaces
        // inside a romanisation render as a word boundary that is not there.
        transcription: l.transcription.trim().replace(/\s+/g, ' '),
        speaker: l.speaker.trim(),
        // Sent even when empty: the server replaces the whole set, so omitting
        // it on a line an author just un-split would leave the old chunks in
        // place with no way to say otherwise.
        chunks: l.chunks,
      })),
    }),
    [draft.lines],
  )

  const glossaryRequest = useMemo<SaveShadowGlossaryRequest>(
    () => ({
      entries: draft.glossary.map((g) => ({
        ...(g.id ? { id: g.id } : {}),
        headwordKo: g.headwordKo.trim(),
        readingLatin: (g.readingLatin ?? '').trim(),
        partOfSpeech: g.partOfSpeech,
        meaningVi: g.meaningVi.trim(),
        contextMeaningVi: g.contextMeaningVi.trim(),
        contextSettled: g.contextSettled,
        occurrences: g.occurrences,
      })),
    }),
    [draft.glossary],
  )

  return { draft, set, setLine, setEntry, setDraft, videoRequest, linesRequest, glossaryRequest }
}
