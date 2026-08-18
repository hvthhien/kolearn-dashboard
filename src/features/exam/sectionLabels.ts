import type { SectionKind } from '../../api/gen/model'

/**
 * One place for the Vietnamese names of the three sections.
 *
 * Not a lookup anyone would miss until two screens disagree about whether
 * `WRITING` is "Viết" or "Phần Viết", and a criteria test matches one of them.
 */
export const SECTION_LABEL: Record<SectionKind, string> = {
  LISTENING: 'Nghe',
  WRITING: 'Viết',
  READING: 'Đọc',
}

/** `3600` → `60 phút`. Section limits are stored in seconds (R-16). */
export function minutes(seconds: number): string {
  return `${Math.round(seconds / 60)} phút`
}
