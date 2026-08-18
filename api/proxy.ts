import { env } from 'node:process'

const INTERNAL_PATH_PARAM = '__kolearn_path'

class ProxyRequestError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ProxyRequestError'
    this.status = status
  }
}

function apiOrigin(): string {
  const value = env.KOLEARN_API_ORIGIN?.trim()
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

function targetUrl(request: Request): URL {
  const incoming = new URL(request.url)
  const forwardedPath = incoming.searchParams.get(INTERNAL_PATH_PARAM)
  if (!forwardedPath) {
    throw new ProxyRequestError(400, 'The API proxy path is missing')
  }

  incoming.searchParams.delete(INTERNAL_PATH_PARAM)
  const target = new URL(`/api/${forwardedPath}`, apiOrigin())

  // The function is public, so constrain it to the API namespace emitted by
  // the generated client. URL normalisation happens before this check, which
  // also rejects dot-segment attempts such as v1/../../another-path.
  if (target.pathname !== '/api/v1' && !target.pathname.startsWith('/api/v1/')) {
    throw new ProxyRequestError(400, 'The API proxy path is invalid')
  }

  target.search = incoming.searchParams.toString()
  return target
}

function problem(status: number, detail: string): Response {
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

export default {
  async fetch(request: Request): Promise<Response> {
    let target: URL
    try {
      target = targetUrl(request)
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

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      })
    } catch {
      return problem(502, 'The API server could not be reached')
    }
  },
}
