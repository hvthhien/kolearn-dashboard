import type { AdminUser, AdminUserStatus } from '../../api/gen/model'

/**
 * The three states `users.status` can hold, and how the row says each one.
 *
 * DELETED appears here although nothing in this app can set it: the list can
 * return one, and a row whose badge said nothing would read as ACTIVE.
 */
export const STATUS_LABEL: Record<
  AdminUserStatus,
  { text: string; tone: 'ok' | 'neutral' | 'warn' | 'bad' }
> = {
  ACTIVE: { text: 'đang hoạt động', tone: 'ok' },
  SUSPENDED: { text: 'đã đình chỉ', tone: 'bad' },
  DELETED: { text: 'đã xoá', tone: 'neutral' },
}

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * `lastSeenAt` in the words an operator uses about it.
 *
 * Absent is "không có thiết bị nào" rather than "chưa bao giờ": the field reads
 * live sessions, so an account that signed in last year and has not refreshed
 * since leaves nothing behind — saying "never" would be the screen asserting
 * something it cannot know.
 */
export function lastSeen(iso: string | undefined): string {
  if (!iso) return 'không có thiết bị nào'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'hôm nay'
  if (days === 1) return 'hôm qua'
  if (days < 30) return `${days} ngày trước`
  return day(iso)
}

/** What the row calls the person: their name, or their address if they have none. */
export function nameOf(u: AdminUser): string {
  return u.displayName.trim() || u.email
}
