import { http, HttpResponse } from 'msw'
import type {
  AdminDictationApprovalRequest,
  AdminDictationPublishReport,
  AdminDictationSetDetail,
  AdminExamDetail,
  AdminShadowVideoDetail,
  ShadowMediaKind,
  ShadowPublishReport,
  AdminQuestion,
  AdminQuestionRow,
  AuthTokens,
  ImportReport,
  PublishReport,
  SaveQuestionRequest,
} from '../api/gen/model'
import { BLUEPRINTS } from './fixtures/blueprints'
import { TOPICS } from './fixtures/topics'
import { EXAMS, LISTENING_PASSAGE, QUESTIONS, READING_PASSAGE, layers } from './fixtures/bank'
import { SHADOW_VIDEOS } from './fixtures/shadowing'
import { DICTATION_SETS } from './fixtures/dictation'

/**
 * The mock backend, shared by `npm run dev` and by the test suite.
 *
 * One set of handlers rather than two, because the alternative is a dev server
 * and a test suite that disagree about what the API does — and the one that
 * disagrees with the eventual server is whichever nobody was looking at.
 *
 * It holds mutable state on purpose. A save that does not change what the next
 * GET returns cannot demonstrate that a save works, and three of the criteria
 * (301-3, 301-6, 301-8) are statements about what happens *after* a write.
 */

const BASE = '/api/v1'

interface State {
  exams: AdminExamDetail[]
  questions: AdminQuestion[]
  /** The publish gate's verdict is computed, not stored — see `gate` below. */
  published: Set<string>
  videos: AdminShadowVideoDetail[]
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

let state: State = {
  exams: clone(EXAMS),
  questions: clone(QUESTIONS),
  published: new Set(EXAMS.filter((e) => e.status === 'PUBLISHED').map((e) => e.id)),
  videos: clone(SHADOW_VIDEOS),
}

/** Tests call this so one test's save is not the next test's starting point. */
/**
 * Mutable dictation state.
 *
 * Reset by resetMockBank, which src/test/setup.ts runs after every test — a
 * verdict recorded by one test would otherwise be the next test's starting
 * point, which is the coupling that makes a suite pass in order and fail alone.
 */
const dictationState = {
  sets: clone(DICTATION_SETS) as Record<string, AdminDictationSetDetail>,
}

export function resetMockBank(): void {
  state = {
    exams: clone(EXAMS),
    questions: clone(QUESTIONS),
    published: new Set(EXAMS.filter((e) => e.status === 'PUBLISHED').map((e) => e.id)),
    videos: clone(SHADOW_VIDEOS),
  }
  dictationState.sets = clone(DICTATION_SETS)
}

/** The studio's copy of a video, for a test that wants to read what a save did. */
export function mockShadowVideo(id: string): AdminShadowVideoDetail | undefined {
  return state.videos.find((v) => v.id === id)
}

/**
 * The studio's half of the gate, computed the way the server computes it so the
 * dialog is exercised against the same rules rather than a fixture of them.
 */
function summarise(video: AdminShadowVideoDetail) {
  let approved = 0
  let rejected = 0
  let unreviewed = 0
  for (const l of video.lines) {
    if (l.approval.verdict === 'APPROVED' && !l.approval.stale) approved++
    else if (l.approval.verdict === 'REJECTED') rejected++
    else unreviewed++
  }
  return { total: video.lines.length, approved, rejected, unreviewed }
}

function shadowGate(video: AdminShadowVideoDetail): ShadowPublishReport {
  const blockers: string[] = []
  const warnings: string[] = []

  if (!video.asset) blockers.push('Chưa có video.')
  if (video.lines.length === 0) blockers.push('Chưa có lời thoại chia câu.')

  for (const line of video.lines) {
    if (line.approval.verdict === 'REJECTED') {
      blockers.push(`Câu ${line.ordinal}: chưa đạt — ${line.approval.note ?? ''}.`)
    } else if (line.approval.verdict === 'UNREVIEWED') {
      blockers.push(`Câu ${line.ordinal}: chưa nghe duyệt.`)
    } else if (line.approval.stale) {
      blockers.push(`Câu ${line.ordinal}: đã sửa sau khi duyệt, cần nghe lại.`)
    }
    if (!line.textVi) warnings.push(`Câu ${line.ordinal}: chưa có bản dịch tiếng Việt.`)
  }

  for (const entry of video.glossary) {
    if (!entry.contextSettled) {
      blockers.push(`Từ "${entry.headwordKo}": chưa chốt nghĩa trong ngữ cảnh.`)
    }
  }

  return { published: false, blockers, warnings }
}

export function mockQuestion(id: string): AdminQuestion | undefined {
  return state.questions.find((q) => q.id === id)
}

export const MOCK_USER: AuthTokens['user'] = {
  id: 'u-1',
  email: 'bien-tap@kolearn.test',
  emailVerified: true,
  displayName: 'Biên tập viên',
  locale: 'vi',
  roles: ['content_admin'],
  permissions: [
    'exam:read',
    'exam:write',
    'exam:publish',
    'question:write',
    'passage:write',
    'asset:write',
    'topic:manage',
    'import:manage',
    // Nhại theo. content_admin holds all four in 00022's seed, including
    // shadowing:approve — which is the same account editing and passing its own
    // lines, and is why the publish gate reports self-approval as a warning.
    'shadowing:read:any',
    'shadowing:write',
    'shadowing:approve',
    'shadowing:publish',
    // Chép chính tả. content_admin holds all four in 00023's seed, and this
    // list was one short of it until the studio grew a write of its own —
    // dictation:write had been seeded and mounted on no route, so nothing
    // noticed. A permission the mock omits is a button the tests never see.
    'dictation:read:any',
    'dictation:write',
    'dictation:approve',
    'dictation:publish',
  ],
}

const TOKENS: AuthTokens = { accessToken: 'mock-access-token', expiresIn: 900, user: MOCK_USER }

function row(q: AdminQuestion): AdminQuestionRow {
  return {
    id: q.id,
    ordinal: q.ordinal,
    displayOrdinal: q.displayOrdinal,
    sectionKind: q.sectionKind,
    type: q.type,
    stemKo: q.stemKo,
    layerStatus: layers(q),
    difficultyManual: q.difficultyManual,
    choiceCount: q.choices.length,
    correctChoiceCount: q.choices.filter((c) => c.isCorrect).length,
    attemptedCount: q.attemptedCount,
  }
}

/**
 * The release gate, the same split `bank.Publish` makes: a blocker refuses,
 * a warning does not (TCCN-301-7). GĐ-4's two halves are both here and land
 * on different sides of the line by design — the wrong shape of a question is
 * blocking, an unassigned difficulty is not (TCCN-301-10, TCCN-303-3).
 */
function gate(exam: AdminExamDetail): PublishReport {
  const questions = state.questions.filter((q) => q.examId === exam.id)
  const blockers: string[] = []
  const warnings: string[] = []

  for (const q of questions) {
    if (q.type !== 'MCQ') continue
    // Named per question, not counted in aggregate: "3 câu hỏng" sends the
    // author back through fifty questions to find which three.
    if (q.choices.length !== 4) {
      blockers.push(`Câu ${q.ordinal}: có ${q.choices.length} lựa chọn, phải đúng 4 (GĐ-4).`)
    }
    const correct = q.choices.filter((c) => c.isCorrect).length
    if (correct !== 1) {
      blockers.push(`Câu ${q.ordinal}: có ${correct} đáp án đúng, phải đúng 1 (GĐ-4).`)
    }
    if (!q.explanationCorrectKo) {
      warnings.push(`Câu ${q.ordinal}: chưa soạn tầng 2 — vì sao đáp án đúng là đúng.`)
    }
    if (!q.stemVi || q.choices.some((c) => !c.textVi)) {
      warnings.push(`Câu ${q.ordinal}: chưa có bản dịch tiếng Việt đầy đủ (YC-121).`)
    }
  }

  for (const section of exam.sections) {
    if (section.authoredCount === 0) {
      warnings.push(
        `Phần ${section.kind} chưa có câu nào — đề này xuất bản được để Luyện tập, ` +
          'nhưng không dùng cho Thi thử.',
      )
    }
  }

  const unassigned = questions.filter((q) => q.difficultyManual == null).length
  if (unassigned > 0) {
    warnings.push(`${unassigned} câu chưa gắn độ khó (YC-303).`)
  }

  return {
    examCode: exam.code,
    published: false,
    blockers,
    warnings,
    unassignedDifficultyCount: unassigned,
  }
}

/** `null` for anything blank. An empty string is not an unwritten layer. */
function nullIfBlank(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

const SHADOW_UPLOAD_ORIGIN = 'https://media.mock.local'


/**
 * `unreviewed` counts STALE approvals, exactly as the server does — a verdict
 * about a sentence that has since been edited is not a verdict, and the counter
 * has to agree with the gate about that.
 */
function summariseDictation(set: AdminDictationSetDetail) {
  let approved = 0
  let rejected = 0
  let unreviewed = 0
  for (const item of set.items) {
    if (item.approval.verdict === 'APPROVED' && !item.approval.stale) approved++
    else if (item.approval.verdict === 'REJECTED') rejected++
    else unreviewed++
  }
  return { total: set.items.length, approved, rejected, unreviewed }
}

function dictationGate(set: AdminDictationSetDetail): AdminDictationPublishReport {
  const blockers: string[] = []
  const warnings: string[] = []

  for (const item of set.items) {
    if (item.approval.verdict === 'REJECTED') {
      blockers.push(`Câu ${item.ordinal}: chưa đạt — ${item.approval.note ?? ''}.`)
    } else if (item.approval.verdict === 'UNREVIEWED') {
      blockers.push(`Câu ${item.ordinal}: chưa nghe duyệt.`)
    } else if (item.approval.stale) {
      blockers.push(`Câu ${item.ordinal}: đã sửa sau khi duyệt, cần nghe lại.`)
    }
    if (item.textVi.trim() === '') {
      warnings.push(`Câu ${item.ordinal}: chưa có bản dịch tiếng Việt.`)
    }
  }
  for (const entry of set.glossary) {
    if (!entry.contextSettled) {
      blockers.push(`Từ "${entry.headwordKo}": chưa chốt nghĩa trong ngữ cảnh.`)
    }
  }
  return { published: false, blockers, warnings }
}

export const handlers = [
  /* ── Xưởng video (SC-VIDEO-STUDIO) ───────────────────────────────────── */

  http.get(`${BASE}/admin/shadowing/videos`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('status')
    const items = state.videos
      .filter((v) => status === null || v.status === status)
      .map((v) => ({
        id: v.id,
        title: v.title,
        level: v.level,
        status: v.status,
        mediaKind: v.mediaKind,
        // The field the remove button reads. Omitting it here would make every
        // row look deletable, including the ones learners have practised with.
        publishedAt: v.publishedAt,
        durationMs: v.asset?.durationMs ?? 0,
        lineCount: v.lines.length,
        wordCount: v.glossary.length,
        review: v.review,
      }))
    return HttpResponse.json({ items })
  }),

  http.post(`${BASE}/admin/shadowing/videos`, async ({ request }) => {
    const body = (await request.json()) as {
      title: string
      level: number
      mediaKind?: ShadowMediaKind
    }
    const created: AdminShadowVideoDetail = {
      id: `sv-${state.videos.length + 1}-${body.title.length}`,
      title: body.title,
      level: body.level,
      status: 'DRAFT',
      // Absent means VIDEO, matching the server: callers written before audio
      // existed keep working unchanged.
      mediaKind: body.mediaKind ?? 'VIDEO',
      voice: '',
      voiceKind: 'SYNTHETIC',
      topics: [],
      lines: [],
      glossary: [],
      review: { total: 0, approved: 0, rejected: 0, unreviewed: 0 },
    }
    state.videos.push(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get(`${BASE}/admin/shadowing/videos/:videoId`, ({ params }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    return video ? HttpResponse.json(video) : new HttpResponse(null, { status: 404 })
  }),

  http.put(`${BASE}/admin/shadowing/videos/:videoId`, async ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      title: string
      level: number
      voice?: string
      voiceKind?: 'HUMAN' | 'SYNTHETIC'
    }
    video.title = body.title
    video.level = body.level
    video.voice = body.voice ?? ''
    video.voiceKind = body.voiceKind ?? 'SYNTHETIC'
    return HttpResponse.json(video)
  }),

  http.put(`${BASE}/admin/shadowing/videos/:videoId/lines`, async ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })

    const body = (await request.json()) as {
      lines: {
        id?: string
        startMs: number
        endMs: number
        textKo: string
        textVi: string
        speaker: string
        chunks?: { startMs: number; endMs: number; charStart: number; charEnd: number }[]
      }[]
    }

    video.lines = body.lines.map((incoming, i) => {
      const before = incoming.id ? video.lines.find((l) => l.id === incoming.id) : undefined
      // Only the timing and the Korean retire a verdict: those are the audio a
      // native speaker listened to. A translation edit is not.
      const changed =
        before !== undefined &&
        (before.startMs !== incoming.startMs ||
          before.endMs !== incoming.endMs ||
          before.textKo !== incoming.textKo)
      const revision = (before?.revision ?? 0) + (changed ? 1 : 0) || 1

      return {
        id: incoming.id ?? `sl-new-${i}`,
        ordinal: i + 1,
        startMs: incoming.startMs,
        endMs: incoming.endMs,
        textKo: incoming.textKo,
        textVi: incoming.textVi,
        speaker: incoming.speaker,
        revision,
        approval: before
          ? { ...before.approval, stale: changed || before.approval.stale }
          : { verdict: 'UNREVIEWED' as const, stale: false },
        // The surface is sliced by the server, never sent — so the mock slices
        // it too, or the studio would round-trip a field the real API fills in.
        chunks: (incoming.chunks ?? []).map((c, n) => ({
          ordinal: n + 1,
          startMs: c.startMs,
          endMs: c.endMs,
          charStart: c.charStart,
          charEnd: c.charEnd,
          surfaceKo: [...incoming.textKo].slice(c.charStart, c.charEnd).join(''),
        })),
      }
    })
    video.review = summarise(video)
    return HttpResponse.json(video)
  }),

  http.put(
    `${BASE}/admin/shadowing/videos/:videoId/lines/:lineId/approval`,
    async ({ params, request }) => {
      const video = state.videos.find((v) => v.id === params.videoId)
      const line = video?.lines.find((l) => l.id === params.lineId)
      if (!video || !line) return new HttpResponse(null, { status: 404 })

      const body = (await request.json()) as { verdict: string; note?: string }
      if (body.verdict === 'REJECTED' && !body.note?.trim()) {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Câu chưa đạt phải kèm lý do',
            status: 422,
            code: 'shadowing_reason_required',
            detail: 'Câu chưa đạt phải kèm lý do.',
          },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        )
      }

      line.approval =
        body.verdict === 'UNREVIEWED'
          ? { verdict: 'UNREVIEWED', stale: false }
          : {
              verdict: body.verdict as 'APPROVED' | 'REJECTED',
              note: body.note,
              reviewedAt: '2026-08-21T00:00:00Z',
              reviewedByName: 'Người duyệt',
              // Recorded against the current revision, so it is current.
              stale: false,
            }
      video.review = summarise(video)
      return HttpResponse.json(line)
    },
  ),

  http.put(`${BASE}/admin/shadowing/videos/:videoId/glossary`, async ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })

    const body = (await request.json()) as {
      entries: {
        id?: string
        headwordKo: string
        meaningVi: string
        contextMeaningVi: string
        contextSettled: boolean
        partOfSpeech: string
        readingLatin?: string
        occurrences: { lineId: string; charStart: number; charEnd: number; surfaceKo: string }[]
      }[]
    }

    // The server's rule, mirrored so the 422 path is exercised rather than
    // assumed (TCCN-354-3).
    const norm = (v: string) => v.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
    const offender = body.entries.find(
      (e) => e.contextSettled && norm(e.contextMeaningVi) === norm(e.meaningVi),
    )
    if (offender) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Nghĩa trong ngữ cảnh đang trùng nghĩa chung',
          status: 422,
          code: 'shadowing_context_meaning_repeated',
          detail: `Từ “${offender.headwordKo}”: nghĩa trong ngữ cảnh giống hệt nghĩa chung, không chốt được.`,
        },
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }

    video.glossary = body.entries.map((e, i) => ({
      id: e.id || `sg-new-${i}`,
      headwordKo: e.headwordKo,
      readingLatin: e.readingLatin ?? '',
      partOfSpeech: e.partOfSpeech as AdminShadowVideoDetail['glossary'][number]['partOfSpeech'],
      meaningVi: e.meaningVi,
      contextMeaningVi: e.contextMeaningVi,
      contextSettled: e.contextSettled,
      occurrences: e.occurrences,
    }))
    return HttpResponse.json(video)
  }),

  http.post(`${BASE}/admin/shadowing/videos/:videoId/upload-target`, ({ params }) => {
    return HttpResponse.json({
      url: `${SHADOW_UPLOAD_ORIGIN}/shadowing/${String(params.videoId)}/mock.mp4`,
      method: 'PUT',
      // Opaque to the client: it echoes what was signed.
      headers: { 'Content-Type': 'video/mp4' },
      objectKey: `shadowing/${String(params.videoId)}/mock.mp4`,
      expiresAt: '2026-08-21T00:15:00Z',
    })
  }),

  /* The direct-to-storage PUT. Required rather than optional: `src/test/setup.ts`
     runs with `onUnhandledRequest: 'error'`, and this request deliberately goes
     to a third-party origin rather than through the API. */
  http.put(`${SHADOW_UPLOAD_ORIGIN}/*`, () => new HttpResponse(null, { status: 200 })),

  http.post(`${BASE}/admin/shadowing/videos/:videoId/uploaded`, async ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { objectKey: string; durationMs: number }

    video.asset = {
      assetId: `a-${video.id}`,
      playbackUrl: `https://media.test/${body.objectKey}`,
      objectKey: body.objectKey,
      byteSize: 3_601_997,
      mimeType: 'video/mp4',
      durationMs: body.durationMs,
    }
    // Every line now describes audio nobody has heard.
    video.lines = video.lines.map((l) => ({
      ...l,
      revision: l.revision + 1,
      approval: { ...l.approval, stale: l.approval.verdict !== 'UNREVIEWED' },
    }))
    video.review = summarise(video)
    return HttpResponse.json(video)
  }),

  /* Removing a video is two operations, and which one applies is decided by
     published_at rather than by the caller. The mock enforces the same refusal
     the server does, because a screen tested against a mock that let a
     published row be deleted is a screen tested against fiction. */

  http.delete(`${BASE}/admin/shadowing/videos/:videoId`, ({ params }) => {
    const i = state.videos.findIndex((v) => v.id === params.videoId)
    const video = state.videos[i]
    if (!video) return new HttpResponse(null, { status: 404 })
    if (video.publishedAt) {
      return HttpResponse.json(
        {
          title: 'Xung đột trạng thái',
          status: 409,
          code: 'shadowing_video_published',
          detail: 'Video này đã từng xuất bản nên không xoá được — hãy gỡ khỏi ngân hàng',
        },
        { status: 409 },
      )
    }
    state.videos.splice(i, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${BASE}/admin/shadowing/videos/:videoId/retire`, ({ params }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })
    if (!video.publishedAt) {
      return HttpResponse.json(
        {
          title: 'Xung đột trạng thái',
          status: 409,
          code: 'shadowing_video_never_published',
          detail:
            'Video này chưa từng xuất bản nên không có gì để gỡ — xoá hẳn nếu không cần nữa',
        },
        { status: 409 },
      )
    }
    video.status = 'RETIRED'
    // publishedAt survives. It is the record that this video once went out, and
    // it is what keeps the delete above refusing afterwards.
    return HttpResponse.json(video)
  }),

  http.post(`${BASE}/admin/shadowing/videos/:videoId/publish`, ({ params, request }) => {
    const video = state.videos.find((v) => v.id === params.videoId)
    if (!video) return new HttpResponse(null, { status: 404 })

    const url = new URL(request.url)
    const report = shadowGate(video)
    if (url.searchParams.get('dryRun') === 'true' || report.blockers.length > 0) {
      return HttpResponse.json(report)
    }
    if (report.warnings.length > 0 && url.searchParams.get('acceptWarnings') !== 'true') {
      return HttpResponse.json(report)
    }
    video.status = 'PUBLISHED'
    // Stamped, not merely flagged. published_at is what the server's delete
    // gate reads, so a mock that only moved `status` would let the screen offer
    // "Xoá" on a video the real backend refuses to delete.
    video.publishedAt = '2026-08-23T09:00:00Z'
    return HttpResponse.json({ ...report, published: true })
  }),

  // ── chép chính tả ────────────────────────────────────────────────────────
  //
  // Read-only about the content on purpose, matching the real surface: sets
  // arrive through cmd/dictation-import and the only write here is the verdict.

  http.get(`${BASE}/admin/dictation/sets`, ({ request }) => {
    const wanted = new URL(request.url).searchParams.get('status')
    const items = Object.values(dictationState.sets)
      .filter((set) => !wanted || set.status === wanted)
      .map((set) => ({
        id: set.id,
        title: set.title,
        level: set.level,
        voice: set.voice,
        voiceKind: set.voiceKind,
        status: set.status,
        publishedAt: set.publishedAt,
        review: summariseDictation(set),
      }))
    return HttpResponse.json({ items })
  }),

  http.get(`${BASE}/admin/dictation/sets/:setId`, ({ params }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json({ ...set, review: summariseDictation(set) })
  }),

  http.put(
    `${BASE}/admin/dictation/sets/:setId/items/:itemId/approval`,
    async ({ params, request }) => {
      const set = dictationState.sets[params.setId as string]
      const item = set?.items.find((i) => i.id === params.itemId)
      if (!set || !item) return new HttpResponse(null, { status: 404 })

      const body = (await request.json()) as AdminDictationApprovalRequest
      if (body.verdict === 'REJECTED' && (body.note ?? '').trim() === '') {
        // The server 422s this, and the mock has to as well — a rejection with
        // no reason is a sentence nobody can fix.
        return HttpResponse.json(
          { title: 'Dữ liệu không hợp lệ', status: 422, code: 'dictation_reason_required' },
          { status: 422 },
        )
      }

      item.approval =
        body.verdict === 'UNREVIEWED'
          ? { verdict: 'UNREVIEWED', stale: false }
          : {
              verdict: body.verdict,
              note: body.note ?? '',
              stale: false,
              reviewedByName: 'Người duyệt',
              reviewedAt: '2026-08-22T10:00:00Z',
            }
      set.review = summariseDictation(set)
      return HttpResponse.json(item)
    },
  ),

  /* The metadata, and only the metadata. Sentences and the dictionary still
     come from cmd/dictation-import — a mock that accepted them would be
     describing an endpoint the server does not have. */

  http.put(`${BASE}/admin/dictation/sets/:setId`, async ({ params, request }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })

    const body = (await request.json()) as {
      title: string
      level: number
      voice?: string
      voiceKind?: 'HUMAN' | 'SYNTHETIC'
    }
    if (body.title.trim() === '') {
      return HttpResponse.json(
        {
          title: 'Dữ liệu không hợp lệ',
          status: 422,
          code: 'dictation_title_required',
          detail: 'Bộ phải có tên',
        },
        { status: 422 },
      )
    }
    set.title = body.title.trim()
    set.level = body.level
    set.voice = body.voice ?? ''
    set.voiceKind = body.voiceKind ?? 'SYNTHETIC'
    // Not a verdict in sight, which is the whole contract of this endpoint: a
    // rename is the same audio saying the same sentences.
    return HttpResponse.json({ ...set, review: summariseDictation(set) })
  }),

  http.delete(`${BASE}/admin/dictation/sets/:setId`, ({ params }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })
    if (set.publishedAt) {
      return HttpResponse.json(
        {
          title: 'Xung đột trạng thái',
          status: 409,
          code: 'dictation_set_published',
          detail: 'Bộ này đã từng xuất bản nên không xoá được — hãy gỡ khỏi ngân hàng',
        },
        { status: 409 },
      )
    }
    delete dictationState.sets[params.setId as string]
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${BASE}/admin/dictation/sets/:setId/retire`, ({ params }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })
    if (!set.publishedAt) {
      return HttpResponse.json(
        {
          title: 'Xung đột trạng thái',
          status: 409,
          code: 'dictation_set_never_published',
          detail: 'Bộ này chưa từng xuất bản nên không có gì để gỡ — xoá hẳn nếu không cần nữa',
        },
        { status: 409 },
      )
    }
    set.status = 'RETIRED'
    // publishedAt survives — see the shadowing retire handler above.
    return HttpResponse.json({ ...set, review: summariseDictation(set) })
  }),

  http.post(`${BASE}/admin/dictation/sets/:setId/publish`, ({ params, request }) => {
    const set = dictationState.sets[params.setId as string]
    if (!set) return new HttpResponse(null, { status: 404 })

    const url = new URL(request.url)
    const report = dictationGate(set)
    if (url.searchParams.get('dryRun') === 'true' || report.blockers.length > 0) {
      return HttpResponse.json(report)
    }
    if (report.warnings.length > 0 && url.searchParams.get('acceptWarnings') !== 'true') {
      return HttpResponse.json(report)
    }
    set.status = 'PUBLISHED'
    // Stamped, not merely flagged — see the shadowing publish handler above.
    set.publishedAt = '2026-08-23T09:00:00Z'
    return HttpResponse.json({ ...report, published: true })
  }),

  http.post(`${BASE}/auth/login`, () => HttpResponse.json(TOKENS)),
  http.post(`${BASE}/auth/refresh`, () => HttpResponse.json(TOKENS)),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/me`, () => HttpResponse.json(MOCK_USER)),

  http.get(`${BASE}/admin/blueprints`, () => HttpResponse.json({ items: BLUEPRINTS })),

  http.get(`${BASE}/admin/exams`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const level = url.searchParams.get('level')
    const items = state.exams
      .filter((e) => !status || e.status === status)
      .filter((e) => !level || e.level === level)
    return HttpResponse.json({ items })
  }),

  http.get(`${BASE}/admin/exams/:examId`, ({ params }) => {
    const exam = state.exams.find((e) => e.id === params.examId)
    if (!exam) return notFound('Không tìm thấy đề này.')
    return HttpResponse.json(exam)
  }),

  http.get(`${BASE}/admin/exams/:examId/questions`, ({ params }) => {
    const exam = state.exams.find((e) => e.id === params.examId)
    if (!exam) return notFound('Không tìm thấy đề này.')
    const items = state.questions
      .filter((q) => q.examId === exam.id)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map(row)
    return HttpResponse.json({ items })
  }),

  http.post(`${BASE}/admin/exams/:examId/publish`, ({ params, request }) => {
    const exam = state.exams.find((e) => e.id === params.examId)
    if (!exam) return notFound('Không tìm thấy đề này.')
    const url = new URL(request.url)
    const dryRun = url.searchParams.get('dryRun') === 'true'
    const acceptWarnings = url.searchParams.get('acceptWarnings') === 'true'

    const report = gate(exam)
    const wouldPublish =
      report.blockers.length === 0 && (report.warnings.length === 0 || acceptWarnings)

    if (!dryRun && wouldPublish) {
      exam.status = 'PUBLISHED'
      exam.publishedAt = '2026-08-18T00:00:00Z'
      state.published.add(exam.id)
      report.published = true
    }
    return HttpResponse.json(report)
  }),

  http.get(`${BASE}/admin/questions/:questionId`, ({ params }) => {
    const q = state.questions.find((x) => x.id === params.questionId)
    if (!q) return notFound('Không tìm thấy câu hỏi này.')
    return HttpResponse.json({ ...q, layerStatus: layers(q) })
  }),

  http.put(`${BASE}/admin/questions/:questionId`, async ({ params, request }) => {
    const q = state.questions.find((x) => x.id === params.questionId)
    if (!q) return notFound('Không tìm thấy câu hỏi này.')
    const body = (await request.json()) as SaveQuestionRequest

    // The one refusal. Everything else about a half-built question saves.
    const keyChanged = body.choices.some((c) => {
      const before = q.choices.find((x) => x.ordinal === c.ordinal)
      return !before || before.isCorrect !== c.isCorrect
    })
    if (keyChanged && q.attemptedCount > 0) {
      return HttpResponse.json(
        {
          type: '/problems/question-answer-locked',
          title: 'Không sửa được đáp án của câu đã có người làm',
          status: 409,
          code: 'question_answer_locked',
          detail:
            `Câu ${q.ordinal} đã nằm trong ${q.attemptedCount} lượt làm bài đã nộp. ` +
            'Đổi đáp án sẽ viết lại điểm và nhật ký lỗi của tất cả các lượt đó. ' +
            'Hãy tạo một phiên bản mới của câu hỏi.',
          attemptedCount: q.attemptedCount,
          questionOrdinal: q.ordinal,
        },
        { status: 409, headers: { 'content-type': 'application/problem+json' } },
      )
    }

    q.stemKo = body.stemKo
    q.stemVi = body.stemVi ?? ''
    q.explanationCorrectKo = nullIfBlank(body.explanationCorrectKo)
    q.explanationCorrectVi = nullIfBlank(body.explanationCorrectVi)
    q.explanationWrongGenericKo = nullIfBlank(body.explanationWrongGenericKo)
    q.explanationWrongGenericVi = nullIfBlank(body.explanationWrongGenericVi)
    q.difficultyManual = body.difficultyManual ?? null
    q.choices = body.choices.map((c) => ({
      ...c,
      textVi: c.textVi ?? '',
      whyWrongKo: nullIfBlank(c.whyWrongKo),
      whyWrongVi: nullIfBlank(c.whyWrongVi),
    }))
    q.evidence = body.evidence ?? []
    q.topics = (body.topicIds ?? []).flatMap((id) => {
      const t = TOPICS.find((x) => x.id === id)
      return t ? [{ topicId: t.id, name: t.name, category: t.category, note: '' }] : []
    })
    q.layerStatus = layers(q)
    return HttpResponse.json(q)
  }),

  http.post(`${BASE}/admin/questions/:questionId/versions`, ({ params }) => {
    const q = state.questions.find((x) => x.id === params.questionId)
    if (!q) return notFound('Không tìm thấy câu hỏi này.')
    const copy: AdminQuestion = {
      ...clone(q),
      id: `${q.id}-v2`,
      attemptedCount: 0,
      supersededByQuestionId: null,
    }
    q.supersededByQuestionId = copy.id
    state.questions.push(copy)
    return HttpResponse.json(copy, { status: 201 })
  }),

  http.get(`${BASE}/admin/passages/:passageId`, ({ params }) => {
    const p = [READING_PASSAGE, LISTENING_PASSAGE].find((x) => x.id === params.passageId)
    if (!p) return notFound('Không tìm thấy ngữ liệu này.')
    return HttpResponse.json(p)
  }),

  http.get(`${BASE}/topics`, ({ request }) => {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const category = url.searchParams.get('category')
    const items = TOPICS.filter((t) => !category || t.category === category)
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      // Curated first, the ranking the catalogue's `is_system` column exists for.
      .sort((a, b) => Number(b.isSystem) - Number(a.isSystem))
    return HttpResponse.json({ items })
  }),

  http.post(`${BASE}/admin/imports/dry-run`, () => HttpResponse.json(IMPORT_REPORT)),

  http.post(`${BASE}/admin/imports`, () =>
    HttpResponse.json({ ...IMPORT_REPORT, dryRun: false }),
  ),
]

/**
 * The dry run and the real run report the same numbers, because TCCN-301-6
 * says the run that follows must produce exactly what the preview reported.
 *
 * `ok: false` with issues is the shape the server sends when the gate refuses:
 * a 200 carrying the verdict, not a problem+json, because the report is the
 * answer the screen needs rather than a failure of the request.
 */
const IMPORT_REPORT: ImportReport = {
  dryRun: true,
  examCode: 'TOPIK-II-102',
  ok: false,
  passages: 12,
  questions: 50,
  choices: 200,
  topics: 34,
  topicsNew: 3,
  translationCoverage: 0.86,
  issues: [
    { where: 'questions[14].choices', message: 'Chỉ có 3 lựa chọn, phải đúng 4 (GĐ-4).' },
    { where: 'questions[27].evidence', message: 'Căn cứ trỏ tới đoạn văn không tồn tại: p-reading-9.' },
  ],
}

function notFound(detail: string) {
  return HttpResponse.json(
    { type: '/problems/not-found', title: 'Không tìm thấy', status: 404, code: 'not_found', detail },
    { status: 404, headers: { 'content-type': 'application/problem+json' } },
  )
}
