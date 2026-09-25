import { LearningLanguage } from '../api/gen/model'

/**
 * The corpus this dashboard lists and authors in, sent as `language` on every
 * studio list and create — exams, videos, dictation sets, their categories,
 * and the chủ điểm picker (docs/proposals/learning-language-contexts.md §6).
 *
 * Explicit rather than left to the server's default, and never the editor's
 * own study language: the API refuses to let what someone is learning steer
 * what they author, so the dashboard has to say which corpus it means.
 *
 * Fixed to Korean while Korean is the only corpus. The picker in the app bar
 * arrives with the second language and changes only where this value comes
 * from; every call site already passes it.
 */
export function authoringLanguage(): LearningLanguage {
  return LearningLanguage.ko
}
