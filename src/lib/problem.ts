/**
 * RFC 9457 problem+json, which the server returns for every error including
 * unmatched routes.
 *
 * `detail` is written in Vietnamese for the learner and is safe to display as
 * it stands; the server never puts `err.Error()` in it, because those strings
 * carry Go package prefixes. So the rule on this side is the mirror image:
 * show `detail` when it is there, and never invent a replacement for it.
 */
export interface Problem {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  /** Endpoint-specific extensions, e.g. AttemptInProgressProblem. */
  [key: string]: unknown
}

export class ProblemError extends Error {
  readonly status: number
  readonly problem: Problem

  constructor(status: number, problem: Problem) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`)
    this.name = 'ProblemError'
    this.status = status
    this.problem = problem
  }
}

export function isProblem(err: unknown): err is ProblemError {
  return err instanceof ProblemError
}

/**
 * What to show the learner. Falls back to a generic Vietnamese line rather
 * than to `err.message`, which for a network failure is browser-generated
 * English ("Failed to fetch").
 */
export function userMessage(err: unknown): string {
  if (isProblem(err) && err.problem.detail) return err.problem.detail
  if (isProblem(err) && err.problem.title) return err.problem.title
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.'
}
