import type {
  AccessCode,
  AccessCodeKind,
  AccessCodeStatus,
  KoreanLevel,
  LearningGoal,
  ReferralSource,
  WaitlistStatus,
} from '../../api/gen/model'

/**
 * The words the Truy cập sớm screen puts on the server's enums.
 *
 * The learner app has its own copy of the level, goal and source names in
 * `kolearn-web/src/features/earlyAccess/launchCopy.ts` — two repositories, two
 * lists — and these are the operator's shorter forms of the same answers.
 */

export const KIND_LABEL: Record<AccessCodeKind, string> = {
  CAMPAIGN: 'Chiến dịch',
  BATCH: 'Nhóm',
  PERSONAL: 'Cá nhân',
}

export const KIND_HINT: Record<AccessCodeKind, string> = {
  CAMPAIGN: 'Mã công khai cho nhiều người, như TIKTOK100 trên TikTok.',
  BATCH: 'Mã cho một nhóm được chọn: lớp học, cộng đồng, đối tác.',
  PERSONAL: 'Mã cho đúng một người: KOL, người thử nghiệm. Dùng được 1 lần.',
}

export const CODE_STATUS: Record<
  AccessCodeStatus,
  { text: string; tone: 'ok' | 'neutral' | 'warn' | 'bad' }
> = {
  ACTIVE: { text: 'Đang mở', tone: 'ok' },
  FULL: { text: 'Hết lượt', tone: 'warn' },
  EXPIRED: { text: 'Hết hạn', tone: 'neutral' },
  DISABLED: { text: 'Đã tắt', tone: 'bad' },
}

export const WAITLIST_STATUS: Record<
  WaitlistStatus,
  { text: string; tone: 'ok' | 'neutral' | 'warn' | 'bad' }
> = {
  WAITING: { text: 'Đang chờ', tone: 'neutral' },
  INVITED: { text: 'Đã mời', tone: 'warn' },
  REGISTERED: { text: 'Đã đăng ký', tone: 'warn' },
  ACTIVATED: { text: 'Đã kích hoạt', tone: 'ok' },
}

export const KOREAN_LEVEL: Record<KoreanLevel, string> = {
  NONE: 'Chưa biết',
  BEGINNER: 'Sơ cấp',
  INTERMEDIATE: 'Trung cấp',
  ADVANCED: 'Cao cấp',
}

export const LEARNING_GOAL: Record<LearningGoal, string> = {
  TOPIK: 'Thi TOPIK',
  STUDY_ABROAD: 'Du học',
  WORK: 'Làm việc',
  CULTURE: 'Văn hoá',
  OTHER: 'Khác',
}

export const REFERRAL: Record<ReferralSource, string> = {
  TIKTOK: 'TikTok',
  FACEBOOK: 'Facebook',
  YOUTUBE: 'YouTube',
  FRIEND: 'Bạn bè',
  SEARCH: 'Tìm kiếm',
  OTHER: 'Khác',
}

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** What a code gives, in one line for a table cell. */
export function benefits(c: Pick<AccessCode, 'trialDays' | 'discountPercent'>): string {
  const parts: string[] = []
  if (c.trialDays > 0) parts.push(`${c.trialDays} ngày Premium`)
  if (c.discountPercent > 0) parts.push(`giảm ${c.discountPercent}% tháng đầu`)
  return parts.length > 0 ? parts.join(' · ') : 'Chỉ mở khoá'
}

/** An ISO instant as a `datetime-local` value, in the operator's own zone. */
export function toLocalInput(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A `date` input's value as the END of that day, so "hết hạn 31/12" includes the 31st. */
export function endOfDay(date: string): string | undefined {
  return date ? new Date(`${date}T23:59:59`).toISOString() : undefined
}

/** An ISO instant as a `date` input's value, in the operator's own zone. */
export function toDateInput(iso: string | undefined): string {
  return toLocalInput(iso).slice(0, 10)
}
