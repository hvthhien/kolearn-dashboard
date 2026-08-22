import type { AdminDictationSetDetail } from '../../api/gen/model'

/**
 * One dictation set in the state a reviewer actually opens it in: imported,
 * DRAFT, and nobody has heard anything yet.
 *
 * The sentences are the sample clip's and the seed video's, so what the mock
 * says and what `make dictation-import` produces are the same content — a mock
 * that drifts from the real corpus is a screen tested against fiction.
 */
export const DICTATION_SETS: Record<string, AdminDictationSetDetail> = {
  'ds-1': {
    id: 'ds-1',
    title: 'Hội thoại công sở',
    level: 3,
    voice: 'Nữ · do máy tạo',
    voiceKind: 'SYNTHETIC',
    status: 'DRAFT',
    review: { total: 3, approved: 0, rejected: 0, unreviewed: 3 },
    items: [
      {
        id: 'di-1',
        ordinal: 1,
        textKo: '오늘 회사에서 많이 바빴어요?',
        textVi: 'Hôm nay ở công ty bạn có bận lắm không?',
        audioUrl: 'https://media.test/exam-audio/aaa.mp3',
        durationMs: 1824,
        source: 'SYNTHETIC',
        revision: 1,
        approval: { verdict: 'UNREVIEWED', stale: false },
      },
      {
        id: 'di-2',
        ordinal: 2,
        textKo: '네, 새로운 프로젝트 때문에 회의가 많았어요.',
        textVi: 'Vâng, vì dự án mới nên có nhiều cuộc họp.',
        audioUrl: 'https://media.test/exam-audio/bbb.mp3',
        durationMs: 3230,
        source: 'SYNTHETIC',
        revision: 1,
        approval: { verdict: 'UNREVIEWED', stale: false },
      },
      {
        // Approved, then edited underneath the verdict. This is the row that
        // matters most on this screen: on the wire it still says APPROVED, and
        // only `stale` distinguishes it from a sentence somebody actually
        // passed. A screen that renders the verdict without the flag ships a
        // native speaker's signature on audio that no longer exists.
        id: 'di-3',
        ordinal: 3,
        textKo: '프로젝트는 잘 진행되고 있어요?',
        textVi: 'Dự án tiến triển tốt chứ?',
        audioUrl: 'https://media.test/exam-audio/ccc.mp3',
        durationMs: 1850,
        source: 'SYNTHETIC',
        revision: 2,
        approval: {
          verdict: 'APPROVED',
          stale: true,
          reviewedByName: 'Minh',
          reviewedAt: '2026-08-20T09:00:00Z',
        },
      },
    ],
    glossary: [
      {
        id: 'dg-1',
        headwordKo: '회사',
        readingLatin: 'hoesa',
        partOfSpeech: 'NOUN',
        meaningVi: 'công ty',
        contextMeaningVi: 'nơi người nói đang làm việc',
        contextSettled: true,
        occurrences: [{ itemId: 'di-1', charStart: 3, charEnd: 5, surfaceKo: '회사' }],
      },
      {
        // Unsettled: blocks publication, because YC-426 offers these to
        // learners as cards and an entry nobody decided is one a model drafted.
        id: 'dg-2',
        headwordKo: '프로젝트',
        readingLatin: 'peurojekteu',
        partOfSpeech: 'NOUN',
        meaningVi: 'dự án',
        contextMeaningVi: '',
        contextSettled: false,
        occurrences: [{ itemId: 'di-2', charStart: 7, charEnd: 11, surfaceKo: '프로젝트' }],
      },
    ],
  },
}
