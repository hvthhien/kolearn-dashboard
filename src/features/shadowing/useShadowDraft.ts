import { useCallback, useMemo, useState } from 'react'
import type {
  AdminShadowGlossaryEntry,
  AdminShadowVideoDetail,
  SaveShadowGlossaryRequest,
  SaveShadowLinesRequest,
  SaveShadowVideoRequest,
} from '../../api/gen/model'
import type { EditableLine } from './lineRules'

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
    lines: video.lines.map((l) => ({
      id: l.id,
      startMs: l.startMs,
      endMs: l.endMs,
      textKo: l.textKo,
      textVi: l.textVi,
      speaker: l.speaker,
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
        speaker: l.speaker.trim(),
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
