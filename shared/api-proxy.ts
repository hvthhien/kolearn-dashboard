/**
 * The API proxy, written against web standards only.
 *
 * Both hosts run the same code: `api/proxy.ts` is the Vercel function and
 * `worker/index.ts` is the Cloudflare Worker. They differ only in where the
 * backend origin comes from and how the forwarded path reaches them, so those
 * two things are arguments and everything else — the origin validation, the
 * `/api/v1` confinement, the header scrubbing — lives here once.
 *
 * Nothing in this file may import from `node:` or from a Workers-only global.
 * Vercel's Node runtime and Cloudflare's runtime both provide `fetch`,
 * `Request`, `Response`, `Headers` and `URL`; that intersection is the budget.
 */

export class ProxyRequestError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ProxyRequestError'
    this.status = status
  }
}

function apiOrigin(raw: string | undefined): string {
  const value = raw?.trim()
  if (!value) {
    throw new ProxyRequestError(500, 'KOLEARN_API_ORIGIN is not configured')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ProxyRequestError(500, 'KOLEARN_API_ORIGIN must be an absolute URL')
  }

  const localHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) {
    throw new ProxyRequestError(
      500,
      'KOLEARN_API_ORIGIN must use HTTPS (HTTP is allowed only for localhost)',
    )
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ProxyRequestError(
      500,
      'KOLEARN_API_ORIGIN must contain only the origin, without a path or credentials',
    )
  }

  return url.origin
}

function targetUrl(rawOrigin: string | undefined, forwardedPath: string | null, search: URLSearchParams): URL {
  if (!forwardedPath) {
    throw new ProxyRequestError(400, 'The API proxy path is missing')
  }

  const target = new URL(`/api/${forwardedPath}`, apiOrigin(rawOrigin))

  // The proxy is public on both hosts, so constrain it to the API namespace
  // emitted by the generated client. URL normalisation happens before this
  // check, which also rejects dot-segment attempts such as v1/../../another-path.
  if (target.pathname !== '/api/v1' && !target.pathname.startsWith('/api/v1/')) {
    throw new ProxyRequestError(400, 'The API proxy path is invalid')
  }

  target.search = search.toString()
  return target
}

export function problem(status: number, detail: string): Response {
  return Response.json(
    {
      type: 'about:blank',
      title: status === 502 ? 'Bad Gateway' : status === 500 ? 'Server Error' : 'Bad Request',
      status,
      detail,
    },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

export interface ProxyOptions {
  /** Raw `KOLEARN_API_ORIGIN`, however this host spells its environment. */
  rawOrigin: string | undefined
  /** Path below `/api/`, without a leading slash — for example `v1/auth/refresh`. */
  forwardedPath: string | null
  /** Query string to carry upstream, with any host-internal parameters removed. */
  search: URLSearchParams
}

export async function proxyApiRequest(request: Request, options: ProxyOptions): Promise<Response> {
  let target: URL
  try {
    target = targetUrl(options.rawOrigin, options.forwardedPath, options.search)
  } catch (error) {
    if (error instanceof ProxyRequestError) return problem(error.status, error.message)
    return problem(500, 'The API proxy is misconfigured')
  }

  const headers = new Headers(request.headers)
  // Let fetch generate transport headers for the backend origin and body.
  headers.delete('host')
  headers.delete('content-length')
  // Do not pass through browser-only codecs (for example zstd). Node's fetch
  // advertises only encodings it can decode before exposing upstream.body.
  headers.delete('accept-encoding')

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  // Buffered, deliberately. Every request body this proxy carries is small —
  // the largest is a 500-character question — and reading it whole is what
  // makes `duplex: 'half'` unnecessary. Passing `request.body` straight
  // through would be a streaming upload, which Node's fetch rejects without
  // that option and which nothing here needs.
  const body = hasBody ? await request.arrayBuffer() : undefined

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      signal: request.signal,
    })

    const responseHeaders = new Headers(upstream.headers)
    // Node fetch transparently decodes gzip/deflate/Brotli, but retains the
    // upstream representation headers. Forwarding those with the decoded
    // stream makes the browser attempt a second decompression.
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('content-length')
    // Hop-by-hop headers belong to the connection they arrived on. An
    // upstream `transfer-encoding: chunked` copied onto a new Response is
    // rejected outright by some runtimes — Cloudflare's among them, which is
    // why this matters more here than it did on Vercel alone.
    responseHeaders.delete('connection')
    responseHeaders.delete('keep-alive')
    responseHeaders.delete('transfer-encoding')

    // The trợ lý's answer is streamed, and the whole value of that is lost if
    // something between here and the browser buffers it.
    //
    // `no-transform` is the one that matters: re-encoding a body is how an
    // intermediary comes to hold all of it, and `no-store` alone does not ask
    // it not to. `X-Accel-Buffering` is the nginx-family spelling of the same
    // request. Both are set only for an event stream — `no-transform` on
    // every JSON response would switch off compression across the whole API
    // to fix one route.
    if (upstream.headers.get('content-type')?.includes('text/event-stream')) {
      responseHeaders.set('Cache-Control', 'no-cache, no-transform')
      responseHeaders.set('X-Accel-Buffering', 'no')
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch {
    return problem(502, 'The API server could not be reached')
  }
}
