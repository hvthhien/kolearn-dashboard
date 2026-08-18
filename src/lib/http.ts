import { ProblemError, type Problem } from './problem'
// Type-only, so this does not create a runtime cycle with the generated client
// that imports `apiFetch` from here.
import type { AuthTokens } from '../api/gen/model'

/**
 * The single fetch path for the whole app. Orval is configured to route every
 * generated hook through `apiFetch`, so there is exactly one place that knows
 * how a request is authenticated and how a failure becomes an error.
 *
 * The access token lives in this module, in memory, and nowhere else. The
 * refresh token is an httpOnly cookie the browser sends on its own. Neither
 * is reachable from injected script, which is the whole reason for the split
 * (§4 of the plan). Putting the access token in localStorage to survive a
 * reload would give that up; a reload instead replays `/auth/refresh`.
 */

let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

/** Called when refresh fails, so the router can send the learner to /login. */
let onSessionLost: () => void = () => {}

export function setSessionLostHandler(fn: () => void): void {
  onSessionLost = fn
}

/**
 * Endpoints that must never carry an Authorization header or trigger a refresh
 * retry. `/auth/refresh` in particular would recurse.
 */
const UNAUTHENTICATED = ['/auth/login', '/auth/refresh']

function isUnauthenticated(url: string): boolean {
  return UNAUTHENTICATED.some((p) => url.includes(p))
}

/**
 * Single-flight refresh, and the only path that may call `/auth/refresh`.
 *
 * Refresh tokens rotate, and the server treats a second use of a consumed
 * token as a stolen family and revokes the lot. So two concurrent refreshes
 * do not merely waste a request — they log the learner out for doing nothing
 * wrong. That happens easily: six queries 401 together when a token expires
 * mid-screen, and the app's own boot refresh can race a 401 retry from a
 * route loader on a cold load of a deep link.
 *
 * Everything therefore funnels through here, including AuthProvider's boot.
 */
let refreshInFlight: Promise<AuthTokens | null> | null = null

export function refreshSessionOnce(): Promise<AuthTokens | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) return null
      const tokens = (await res.json()) as AuthTokens
      if (!tokens.accessToken) return null
      accessToken = tokens.accessToken
      return tokens
    } catch {
      return null
    } finally {
      // Cleared in a microtask so every caller awaiting this attempt sees the
      // same result before a new attempt can start.
      queueMicrotask(() => {
        refreshInFlight = null
      })
    }
  })()
  return refreshInFlight
}

async function toError(res: Response): Promise<ProblemError> {
  let problem: Problem = {}
  try {
    const body = (await res.json()) as unknown
    if (body && typeof body === 'object') problem = body as Problem
  } catch {
    // A proxy or a crash can produce a non-JSON body. The status still stands.
  }
  return new ProblemError(res.status, problem)
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

/**
 * One request, with the bearer token attached and exactly one refresh retry.
 *
 * Shared by the JSON mutator and the binary fetch below. Listening audio and
 * exam images are binary bodies behind the same auth, and giving either its own
 * copy of the refresh dance is how they drift until one of them signs the
 * learner out mid-exam.
 */
async function send(url: string, options: RequestInit, accept: string): Promise<Response> {
  const once = async (): Promise<Response> => {
    const headers = new Headers(options.headers)
    headers.set('Accept', accept)
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (accessToken && !isUnauthenticated(url)) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return fetch(url, { ...options, headers, credentials: 'same-origin' })
  }

  let res = await once()

  // Exactly one retry, and only for the case a retry can fix.
  if (res.status === 401 && !isUnauthenticated(url)) {
    if (await refreshSessionOnce()) {
      res = await once()
    } else {
      setAccessToken(null)
      onSessionLost()
    }
  }
  return res
}

/** The mutator orval generates against. */
export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await send(url, options, 'application/json')
  if (!res.ok) throw await toError(res)
  return parse<T>(res)
}

/**
 * Fetches a binary body — a listening clip, or an image from the paper.
 *
 * Neither `<audio src>` nor `<img src>` can carry an Authorization header, and
 * both endpoints have to be authenticated because the bytes belong to one
 * learner's frozen attempt. So they are fetched here and handed to the element
 * as an object URL.
 *
 * The two bodies travel the same path under opposite rules, and the difference
 * is the caller's to keep. In EXAM mode an audio fetch **is the play**: the
 * server records it and refuses the next one, so nothing may request a clip
 * speculatively — not a prefetch, not a retry after a decode error, not React
 * re-running an effect. Images are rationed by nothing at all, and may be
 * fetched on mount and again on every remount.
 *
 * `accept` is explicit rather than defaulted so neither caller can inherit the
 * other's header by leaving it off.
 */
export async function apiFetchBlob(url: string, accept: string): Promise<Blob> {
  const res = await send(url, { method: 'GET' }, accept)
  if (!res.ok) throw await toError(res)
  return res.blob()
}

export default apiFetch
