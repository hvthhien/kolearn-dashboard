import { http, HttpResponse } from 'msw'
import type {
  AdminExamDetail,
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
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

let state: State = {
  exams: clone(EXAMS),
  questions: clone(QUESTIONS),
  published: new Set(EXAMS.filter((e) => e.status === 'PUBLISHED').map((e) => e.id)),
}

/** Tests call this so one test's save is not the next test's starting point. */
export function resetMockBank(): void {
  state = {
    exams: clone(EXAMS),
    questions: clone(QUESTIONS),
    published: new Set(EXAMS.filter((e) => e.status === 'PUBLISHED').map((e) => e.id)),
  }
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

export const handlers = [
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
