import type { AdminShadowChunk, AdminShadowVideoDetail } from '../../api/gen/model'

/**
 * The mock-up's own content, so the fixture and the BA's screen agree about
 * what a video looks like.
 */

export const VIDEO_RESTAURANT: AdminShadowVideoDetail = {
  id: 'sv-1',
  title: 'Đặt bàn nhà hàng',
  level: 2,
  status: 'DRAFT',
  voice: 'Nữ',
  voiceKind: 'SYNTHETIC',
  topics: [],
  asset: {
    assetId: 'a-1',
    playbackUrl: 'https://media.test/shadowing/sv-1/a.mp3',
    objectKey: 'shadowing/sv-1/a.mp3',
    byteSize: 3_601_997,
    mimeType: 'audio/mpeg',
    durationMs: 21_000,
  },
  lines: [
    line('sl-1', 1, 0, 2140, '안녕하세요, 예약하셨어요?', 'Xin chào, anh/chị đã đặt bàn chưa?', 'APPROVED'),
    line('sl-2', 2, 2500, 5200, '네, 두 명으로 예약하려고 합니다.', 'Vâng, tôi muốn đặt bàn cho hai người.', 'APPROVED'),
    {
      ...line('sl-3', 3, 5600, 8000, '창가 자리로 하시겠어요?', 'Anh/chị muốn ngồi cạnh cửa sổ chứ?', 'REJECTED'),
      approval: {
        verdict: 'REJECTED',
        note: 'ngữ điệu cuối câu',
        reviewedAt: '2026-08-20T10:00:00Z',
        reviewedByName: 'Nguyễn A',
        stale: false,
      },
    },
    // Nobody has listened to this one, which is what the gate is about.
    line('sl-4', 4, 8400, 10_000, '네, 좋습니다.', 'Vâng, được ạ.', 'UNREVIEWED'),
  ],
  glossary: [
    {
      id: 'sg-1',
      headwordKo: '예약',
      readingLatin: 'yeyak',
      partOfSpeech: 'NOUN',
      meaningVi: 'đặt trước',
      // Unsettled, and identical to the general meaning — the case the studio
      // refuses to confirm.
      contextMeaningVi: 'đặt trước',
      contextSettled: false,
      occurrences: [{ lineId: 'sl-1', charStart: 7, charEnd: 9, surfaceKo: '예약' }],
    },
  ],
  review: { total: 4, approved: 2, rejected: 1, unreviewed: 1 },
}

/** Nothing uploaded, nothing written — the upload panel's starting state. */
export const VIDEO_EMPTY: AdminShadowVideoDetail = {
  id: 'sv-2',
  title: 'Ngữ liệu mới',
  level: 2,
  status: 'DRAFT',
  voice: '',
  voiceKind: 'SYNTHETIC',
  topics: [],
  lines: [],
  glossary: [],
  review: { total: 0, approved: 0, rejected: 0, unreviewed: 0 },
}

/** Everything passed, so the gate can be shown succeeding as well as refusing. */
export const VIDEO_READY: AdminShadowVideoDetail = {
  ...VIDEO_RESTAURANT,
  id: 'sv-3',
  title: 'Gọi món ở nhà hàng',
  lines: VIDEO_RESTAURANT.lines.map((l) => ({
    ...l,
    approval: {
      verdict: 'APPROVED' as const,
      reviewedAt: '2026-08-20T10:00:00Z',
      reviewedByName: 'Nguyễn A',
      stale: false,
    },
  })),
  glossary: VIDEO_RESTAURANT.glossary.map((g) => ({
    ...g,
    contextMeaningVi: 'đặt bàn trước',
    contextSettled: true,
  })),
  review: { total: 4, approved: 4, rejected: 0, unreviewed: 0 },
}

/**
 * One that has already gone out, so both remove buttons exist somewhere in the
 * fixture set. `publishedAt` is what decides whether a row offers "Xoá" or
 * "Gỡ", and a library of nothing but drafts would exercise only one of them.
 */
export const VIDEO_PUBLISHED: AdminShadowVideoDetail = {
  ...VIDEO_READY,
  id: 'sv-4',
  title: 'Hỏi đường',
  status: 'PUBLISHED',
  publishedAt: '2026-08-01T09:00:00Z',
}

export const SHADOW_VIDEOS = [VIDEO_RESTAURANT, VIDEO_EMPTY, VIDEO_READY, VIDEO_PUBLISHED]

function line(
  id: string,
  ordinal: number,
  startMs: number,
  endMs: number,
  textKo: string,
  textVi: string,
  verdict: 'APPROVED' | 'REJECTED' | 'UNREVIEWED',
) {
  return {
    id,
    ordinal,
    startMs,
    endMs,
    textKo,
    textVi,
    speaker: ordinal % 2 === 1 ? '민수' : '지수',
    revision: 1,
    // Unsplit by default. Chunking is something an author does to the lines
    // that need it, not a property every line arrives with.
    chunks: [] as AdminShadowChunk[],
    approval:
      verdict === 'UNREVIEWED'
        ? { verdict, stale: false }
        : {
            verdict,
            reviewedAt: '2026-08-20T10:00:00Z',
            reviewedByName: 'Nguyễn A',
            stale: false,
          },
  }
}
