import type {
  AccessCode,
  AccessCodeRedemption,
  EarlyAccessSettings,
  WaitlistEntry,
} from '../../api/gen/model'

/**
 * Truy cập sớm, in the shapes the plan's own tables draw: a full TikTok code, a
 * campaign part-way through, a waitlist batch, and one personal invitation.
 * The waitlist holds one entry in each derived status, oldest first, so the
 * "mời N người tiếp theo" test can say exactly who the next batch reaches.
 */
export const EARLY_ACCESS_SETTINGS: EarlyAccessSettings = {
  enabled: false,
  showCapacity: false,
  updatedAt: '2026-09-01T09:00:00Z',
}

export const ACCESS_CODES: AccessCode[] = [
  {
    id: 'ac-1',
    code: 'TIKTOK100',
    kind: 'CAMPAIGN',
    campaign: 'TikTok #1',
    status: 'FULL',
    maxRedemptions: 100,
    redemptions: 100,
    trialDays: 7,
    discountPercent: 50,
    createdAt: '2026-09-01T09:00:00Z',
  },
  {
    id: 'ac-2',
    code: 'TOPIK100',
    kind: 'CAMPAIGN',
    campaign: 'TikTok TOPIK',
    status: 'ACTIVE',
    maxRedemptions: 100,
    redemptions: 83,
    trialDays: 7,
    discountPercent: 50,
    discountValidDays: 30,
    createdAt: '2026-09-03T09:00:00Z',
  },
  {
    id: 'ac-3',
    code: 'WAITLIST01',
    kind: 'BATCH',
    campaign: 'Waitlist Batch 1',
    status: 'ACTIVE',
    maxRedemptions: 50,
    redemptions: 42,
    trialDays: 7,
    discountPercent: 50,
    expiresAt: '2026-10-01T16:59:59Z',
    createdAt: '2026-09-05T09:00:00Z',
  },
  {
    id: 'ac-4',
    code: 'XAMI-H7K92P',
    kind: 'PERSONAL',
    campaign: 'KOL — cô Hạnh',
    status: 'ACTIVE',
    maxRedemptions: 1,
    redemptions: 0,
    trialDays: 14,
    discountPercent: 50,
    createdAt: '2026-09-06T09:00:00Z',
  },
]

export const ACCESS_CODE_REDEMPTIONS: Record<string, AccessCodeRedemption[]> = {
  'ac-2': [
    {
      userId: 'u-201',
      email: 'lan@hoc.vn',
      displayName: 'Lan',
      activatedAt: '2026-09-04T10:00:00Z',
      trialEndsAt: '2026-09-11T10:00:00Z',
    },
    {
      userId: 'u-202',
      email: 'minh@hoc.vn',
      displayName: 'Minh',
      activatedAt: '2026-09-04T08:00:00Z',
      trialEndsAt: '2026-09-11T08:00:00Z',
      discountUsedAt: '2026-09-10T08:00:00Z',
    },
  ],
}

export const WAITLIST: WaitlistEntry[] = [
  {
    id: 'wl-1',
    email: 'da-kich-hoat@hoc.vn',
    koreanLevel: 'BEGINNER',
    learningGoal: 'TOPIK',
    topikTarget: 3,
    referralSource: 'TIKTOK',
    status: 'ACTIVATED',
    createdAt: '2026-09-01T01:00:00Z',
    invitedAt: '2026-09-05T01:00:00Z',
    invitationCode: 'XAMI-A2B3C4',
  },
  {
    id: 'wl-2',
    email: 'da-moi@hoc.vn',
    koreanLevel: 'NONE',
    learningGoal: 'CULTURE',
    status: 'INVITED',
    createdAt: '2026-09-01T02:00:00Z',
    invitedAt: '2026-09-05T01:00:00Z',
    invitationCode: 'XAMI-D5E6F7',
  },
  {
    id: 'wl-3',
    email: 'cho-1@hoc.vn',
    koreanLevel: 'INTERMEDIATE',
    learningGoal: 'STUDY_ABROAD',
    topikTarget: 4,
    examDate: '2026-11-15',
    referralSource: 'FACEBOOK',
    status: 'WAITING',
    createdAt: '2026-09-02T01:00:00Z',
  },
  {
    id: 'wl-4',
    email: 'cho-2@hoc.vn',
    koreanLevel: 'BEGINNER',
    learningGoal: 'WORK',
    status: 'WAITING',
    createdAt: '2026-09-02T02:00:00Z',
  },
  {
    id: 'wl-5',
    email: 'cho-3@hoc.vn',
    koreanLevel: 'ADVANCED',
    learningGoal: 'TOPIK',
    topikTarget: 6,
    status: 'WAITING',
    createdAt: '2026-09-03T01:00:00Z',
  },
]
