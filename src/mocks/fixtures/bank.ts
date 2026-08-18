import type {
  AdminExamDetail,
  AdminPassage,
  AdminQuestion,
  LayerStatus,
} from '../../api/gen/model'
import { BLUEPRINTS } from './blueprints'

/**
 * The bank the mock server serves, and the fixtures every test starts from.
 *
 * The content is lifted from `kolearn-server/db/seed/exam-topik-ii-83.json`
 * rather than invented, so the Korean, the Vietnamese, the character offsets
 * in the evidence spans and the topic names are all shapes the real importer
 * produces. A fixture that agrees only with itself will let a screen pass its
 * tests and break on the first real paper.
 */

export const READING_PASSAGE: AdminPassage = {
  id: 'p-reading-1',
  kind: 'READING',
  textKo:
    '저는 어릴 때부터 자전거를 좋아했습니다. 동생은 자전거를 타고 학교에 다녔지만, 저는 걸어서 다녔습니다. 집에서 학교까지 걸어서 이십 분쯤 걸렸는데, 그 길에 있는 작은 서점에 매일 들르는 것이 즐거웠습니다.',
  textVi:
    'Tôi thích xe đạp từ khi còn nhỏ. Em trai tôi đi học bằng xe đạp, còn tôi thì đi bộ. Từ nhà đến trường đi bộ mất khoảng hai mươi phút, và tôi rất thích ghé vào hiệu sách nhỏ trên đường đó mỗi ngày.',
  audioAssetId: null,
  audioDurationMs: null,
}

export const LISTENING_PASSAGE: AdminPassage = {
  id: 'p-listening-1',
  kind: 'LISTENING',
  textKo: null,
  textVi: null,
  audioAssetId: 'asset-listening-1',
  audioDurationMs: 42_000,
}

function layers(q: AdminQuestion): LayerStatus {
  const distractors = q.choices.filter((c) => !c.isCorrect)
  return {
    layer2: !!q.explanationCorrectKo,
    layer3Written: distractors.filter((c) => !!c.whyWrongKo).length,
    layer3Required: distractors.length,
    layer4: q.evidence.length > 0,
    layer5: q.topics.length > 0,
    translated: !!q.stemVi && q.choices.every((c) => !!c.textVi),
  }
}

/** Fully authored, and already sat — the answer key here is locked. */
const Q15: AdminQuestion = {
  id: 'q-15',
  examId: 'e-83',
  sectionKind: 'READING',
  ordinal: 15,
  displayOrdinal: 15,
  type: 'MCQ',
  passageId: READING_PASSAGE.id,
  stemKo: '이 글의 내용과 같은 것을 고르십시오.',
  stemVi: 'Chọn nội dung đúng với bài đọc.',
  maxScore: 2,
  explanationCorrectKo:
    "본문에 '저는 걸어서 다녔습니다'라고 나옵니다. 글쓴이는 걸어서 학교에 다녔습니다.",
  explanationCorrectVi:
    "Trong bài có câu '저는 걸어서 다녔습니다' — người kể chuyện đi bộ đến trường.",
  explanationWrongGenericKo: null,
  explanationWrongGenericVi: null,
  difficultyManual: 2,
  difficultyObserved: 0.412,
  choices: [
    {
      ordinal: 1,
      textKo: '글쓴이는 자전거를 타고 학교에 다녔다.',
      textVi: 'Người kể chuyện đi học bằng xe đạp.',
      isCorrect: false,
      whyWrongKo: '자전거를 타고 다닌 사람은 동생입니다.',
      whyWrongVi: 'Người đi xe đạp là em trai, không phải người kể chuyện.',
    },
    {
      ordinal: 2,
      textKo: '글쓴이는 걸어서 학교에 다녔다.',
      textVi: 'Người kể chuyện đi bộ đến trường.',
      isCorrect: true,
      whyWrongKo: null,
      whyWrongVi: null,
    },
    {
      ordinal: 3,
      textKo: '글쓴이는 서점에 가 본 적이 없다.',
      textVi: 'Người kể chuyện chưa từng đến hiệu sách.',
      isCorrect: false,
      whyWrongKo: "'매일 들르는 것이 즐거웠습니다'라고 했으므로 반대입니다.",
      whyWrongVi: 'Bài viết nói ghé hiệu sách mỗi ngày là niềm vui, tức là ngược lại.',
    },
    {
      ordinal: 4,
      textKo: '글쓴이는 학교까지 한 시간 걸렸다.',
      textVi: 'Người kể chuyện mất một tiếng để đến trường.',
      isCorrect: false,
      whyWrongKo: '이십 분쯤 걸렸다고 했습니다.',
      whyWrongVi: 'Bài nói mất khoảng hai mươi phút, không phải một tiếng.',
    },
  ],
  topics: [
    { topicId: 't-1', name: 'đối chiếu chi tiết với bài đọc', category: 'READING_SKILL', note: '' },
    { topicId: 't-2', name: '-지만', category: 'GRAMMAR', note: 'Phân biệt chủ ngữ của hai vế' },
  ],
  evidence: [
    {
      id: 'ev-1',
      passageId: READING_PASSAGE.id,
      charStart: 45,
      charEnd: 57,
      audioStartMs: null,
      audioEndMs: null,
      quoteKo: '저는 걸어서 다녔습니다',
      quoteVi: 'còn tôi thì đi bộ',
    },
  ],
  attemptedCount: 11,
  supersededByQuestionId: null,
  layerStatus: {
    layer2: true,
    layer3Written: 3,
    layer3Required: 3,
    layer4: true,
    layer5: true,
    translated: true,
  },
}

/**
 * Half-built and never sat: three choices, no layer 2, no topic. This is the
 * state TCCN-301-9, 301-10 and 303-3 are all about, and it has to be a state
 * the fixtures can actually be in.
 */
const Q16: AdminQuestion = {
  id: 'q-16',
  examId: 'e-83',
  sectionKind: 'READING',
  ordinal: 16,
  displayOrdinal: 16,
  type: 'MCQ',
  passageId: READING_PASSAGE.id,
  stemKo: '글쓴이가 서점에 들른 이유로 알맞은 것을 고르십시오.',
  stemVi: '',
  maxScore: 2,
  explanationCorrectKo: null,
  explanationCorrectVi: null,
  explanationWrongGenericKo: null,
  explanationWrongGenericVi: null,
  difficultyManual: null,
  difficultyObserved: null,
  choices: [
    { ordinal: 1, textKo: '책을 사기 위해서', textVi: '', isCorrect: false, whyWrongKo: null, whyWrongVi: null },
    { ordinal: 2, textKo: '즐거웠기 때문에', textVi: '', isCorrect: true, whyWrongKo: null, whyWrongVi: null },
    { ordinal: 3, textKo: '동생을 만나려고', textVi: '', isCorrect: false, whyWrongKo: null, whyWrongVi: null },
  ],
  topics: [],
  evidence: [],
  attemptedCount: 0,
  supersededByQuestionId: null,
  layerStatus: {
    layer2: false,
    layer3Written: 0,
    layer3Required: 2,
    layer4: false,
    layer5: false,
    translated: false,
  },
}

/** A listening question, so the evidence picker's audio half has a subject. */
const Q3: AdminQuestion = {
  id: 'q-3',
  examId: 'e-83',
  sectionKind: 'LISTENING',
  ordinal: 3,
  displayOrdinal: 3,
  type: 'MCQ',
  passageId: LISTENING_PASSAGE.id,
  stemKo: '다음을 듣고 남자가 할 일로 알맞은 것을 고르십시오.',
  stemVi: 'Nghe và chọn việc người đàn ông sẽ làm.',
  maxScore: 2,
  explanationCorrectKo: '남자가 도서관에 간다고 말합니다.',
  explanationCorrectVi: 'Người đàn ông nói sẽ đến thư viện.',
  explanationWrongGenericKo: null,
  explanationWrongGenericVi: null,
  difficultyManual: 3,
  difficultyObserved: null,
  choices: [
    { ordinal: 1, textKo: '도서관에 갑니다', textVi: 'Đến thư viện', isCorrect: true, whyWrongKo: null, whyWrongVi: null },
    { ordinal: 2, textKo: '집에서 쉽니다', textVi: 'Nghỉ ở nhà', isCorrect: false, whyWrongKo: '남자가 아니라 여자입니다.', whyWrongVi: 'Đó là người phụ nữ, không phải người đàn ông.' },
    { ordinal: 3, textKo: '친구를 만납니다', textVi: 'Gặp bạn', isCorrect: false, whyWrongKo: null, whyWrongVi: null },
    { ordinal: 4, textKo: '음악을 듣습니다', textVi: 'Nghe nhạc', isCorrect: false, whyWrongKo: null, whyWrongVi: null },
  ],
  topics: [{ topicId: 't-7', name: 'nghe lấy ý chính', category: 'LISTENING_SKILL', note: '' }],
  evidence: [
    {
      id: 'ev-2',
      passageId: LISTENING_PASSAGE.id,
      charStart: null,
      charEnd: null,
      audioStartMs: 12_400,
      audioEndMs: 18_900,
      quoteKo: '도서관에 갈 거예요',
      quoteVi: 'Tôi sẽ đến thư viện',
    },
  ],
  attemptedCount: 0,
  supersededByQuestionId: null,
  layerStatus: {
    layer2: true,
    layer3Written: 1,
    layer3Required: 3,
    layer4: true,
    layer5: true,
    translated: true,
  },
}

export const QUESTIONS: AdminQuestion[] = [Q3, Q15, Q16]

/** Complete enough to publish, bar the warnings. */
const EXAM_83: AdminExamDetail = {
  id: 'e-83',
  code: 'SEED-TOPIK-II-83',
  title: 'Đề luyện tập 83 (seed)',
  level: 'TOPIK_II',
  status: 'DRAFT',
  origin: 'OFFICIAL',
  blueprintVersion: '2024',
  year: 2024,
  questionCount: 3,
  examReady: true,
  missingSections: [],
  sourceName: 'Bộ đề luyện tập nội bộ (seed)',
  sourceUrl: '',
  licenseNote: 'Nội dung tự soạn cho môi trường phát triển. KHÔNG phải đề TOPIK thật.',
  publishedAt: null,
  blueprint: BLUEPRINTS[1]!,
  sections: [
    { id: 's-1', kind: 'LISTENING', sitting: 1, ordinal: 1, questionCount: 50, timeLimitSeconds: 3600, maxScore: 100, authoredCount: 1 },
    { id: 's-2', kind: 'WRITING', sitting: 1, ordinal: 2, questionCount: 4, timeLimitSeconds: 3000, maxScore: 100, authoredCount: 0 },
    { id: 's-3', kind: 'READING', sitting: 2, ordinal: 3, questionCount: 50, timeLimitSeconds: 4200, maxScore: 100, authoredCount: 2 },
  ],
}

/**
 * TOPIK II with no Writing section authored at all. R-05 requires all three
 * for a Thi thử, so this one is publishable for Luyện tập and marked as
 * unusable for Thi thử wherever it is listed (TCCN-302-4).
 */
const EXAM_84: AdminExamDetail = {
  id: 'e-84',
  code: 'SEED-TOPIK-II-84',
  title: 'Đề luyện tập 84 — thiếu phần Viết',
  level: 'TOPIK_II',
  status: 'PUBLISHED',
  origin: 'OFFICIAL',
  blueprintVersion: '2024',
  year: 2024,
  questionCount: 100,
  examReady: false,
  missingSections: ['WRITING'],
  sourceName: 'Bộ đề luyện tập nội bộ (seed)',
  sourceUrl: '',
  licenseNote: '',
  publishedAt: '2026-07-02T09:00:00Z',
  blueprint: BLUEPRINTS[1]!,
  sections: [
    { id: 's-4', kind: 'LISTENING', sitting: 1, ordinal: 1, questionCount: 50, timeLimitSeconds: 3600, maxScore: 100, authoredCount: 50 },
    { id: 's-5', kind: 'WRITING', sitting: 1, ordinal: 2, questionCount: 4, timeLimitSeconds: 3000, maxScore: 100, authoredCount: 0 },
    { id: 's-6', kind: 'READING', sitting: 2, ordinal: 3, questionCount: 50, timeLimitSeconds: 4200, maxScore: 100, authoredCount: 50 },
  ],
}

const EXAM_64: AdminExamDetail = {
  id: 'e-64',
  code: 'SEED-TOPIK-I-64',
  title: 'Đề luyện tập 64 (seed)',
  level: 'TOPIK_I',
  status: 'PUBLISHED',
  origin: 'OFFICIAL',
  blueprintVersion: '2024',
  year: 2024,
  questionCount: 70,
  examReady: true,
  missingSections: [],
  sourceName: 'Bộ đề luyện tập nội bộ (seed)',
  sourceUrl: '',
  licenseNote: '',
  publishedAt: '2026-06-11T09:00:00Z',
  blueprint: BLUEPRINTS[0]!,
  sections: [
    { id: 's-7', kind: 'LISTENING', sitting: 1, ordinal: 1, questionCount: 30, timeLimitSeconds: 2400, maxScore: 100, authoredCount: 30 },
    { id: 's-8', kind: 'READING', sitting: 1, ordinal: 2, questionCount: 40, timeLimitSeconds: 3600, maxScore: 100, authoredCount: 40 },
  ],
}

export const EXAMS: AdminExamDetail[] = [EXAM_83, EXAM_84, EXAM_64]

export { layers }
