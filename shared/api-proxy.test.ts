// Runs in the suite's default jsdom environment rather than `node`, because
// `src/test/setup.ts` is applied to every file and touches `document`. Vitest
// leaves Node's `fetch`, `Request` and `Response` reachable there, which is all
// this module needs.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { proxyApiRequest } from './api-proxy'

const ORIGIN = 'https://api.example.com'

function get(path: string, search = '') {
  return new Request(`https://app.example.com${path}${search}`)
}

/** Captures what the proxy sends upstream and replies with `response`. */
function stubUpstream(response: Response) {
  const sent: Request[] = []
  vi.stubGlobal('fetch', (input: URL | string, init?: RequestInit) => {
    sent.push(new Request(input, init))
    return Promise.resolve(response)
  })
  return sent
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('origin validation', () => {
  const cases: [string, string | undefined][] = [
    ['unset', undefined],
    ['blank', '   '],
    ['not a URL', 'not-a-url'],
    ['plain http on a public host', 'http://api.example.com'],
    ['carrying a path', 'https://api.example.com/api'],
    ['carrying credentials', 'https://user:pw@api.example.com'],
    ['carrying a query string', 'https://api.example.com/?k=v'],
  ]

  it.each(cases)('refuses an origin that is %s', async (_label, rawOrigin) => {
    const response = await proxyApiRequest(get('/api/v1/ping'), {
      rawOrigin,
      forwardedPath: 'v1/ping',
      search: new URLSearchParams(),
    })

    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
  })

  it('allows plain http on localhost, so the dev loop can reach a local API', async () => {
    stubUpstream(new Response('ok'))

    const response = await proxyApiRequest(get('/api/v1/ping'), {
      rawOrigin: 'http://localhost:8790',
      forwardedPath: 'v1/ping',
      search: new URLSearchParams(),
    })

    expect(response.status).toBe(200)
  })
})

describe('confinement to /api/v1', () => {
  it('refuses a missing path', async () => {
    const response = await proxyApiRequest(get('/api/'), {
      rawOrigin: ORIGIN,
      forwardedPath: null,
      search: new URLSearchParams(),
    })

    expect(response.status).toBe(400)
  })

  // The proxy is public on both hosts. Everything below would reach the backend
  // outside the namespace the generated client emits.
  const escapes = ['v2/internal', 'admin/users', 'v1/../../admin', 'v1/../v2/x', '../secrets']

  it.each(escapes)('refuses %s', async (forwardedPath) => {
    const sent = stubUpstream(new Response('ok'))

    const response = await proxyApiRequest(get('/api/v1/x'), {
      rawOrigin: ORIGIN,
      forwardedPath,
      search: new URLSearchParams(),
    })

    expect(response.status).toBe(400)
    expect(sent).toHaveLength(0)
  })

  it('allows the bare /api/v1 collection root', async () => {
    const sent = stubUpstream(new Response('ok'))

    await proxyApiRequest(get('/api/v1'), {
      rawOrigin: ORIGIN,
      forwardedPath: 'v1',
      search: new URLSearchParams(),
    })

    expect(sent[0]?.url).toBe(`${ORIGIN}/api/v1`)
  })
})

describe('forwarding', () => {
  it('carries method, path and query upstream', async () => {
    const sent = stubUpstream(new Response('ok'))

    await proxyApiRequest(
      new Request('https://app.example.com/api/v1/search?q=topik', { method: 'POST', body: '{}' }),
      {
        rawOrigin: ORIGIN,
        forwardedPath: 'v1/search',
        search: new URLSearchParams({ q: 'topik', page: '2' }),
      },
    )

    expect(sent[0]?.method).toBe('POST')
    expect(sent[0]?.url).toBe(`${ORIGIN}/api/v1/search?q=topik&page=2`)
    await expect(sent[0]?.text()).resolves.toBe('{}')
  })

  it('drops transport headers it must not restate for a new connection', async () => {
    const sent = stubUpstream(new Response('ok'))

    await proxyApiRequest(
      new Request('https://app.example.com/api/v1/ping', {
        headers: { 'accept-encoding': 'zstd', cookie: 'kolearn_refresh=abc' },
      }),
      { rawOrigin: ORIGIN, forwardedPath: 'v1/ping', search: new URLSearchParams() },
    )

    expect(sent[0]?.headers.get('accept-encoding')).toBeNull()
    // The refresh cookie is the whole reason this proxy exists, so it must survive.
    expect(sent[0]?.headers.get('cookie')).toBe('kolearn_refresh=abc')
  })

  it('strips hop-by-hop headers off the response', async () => {
    // Cloudflare rejects a Response constructed with `transfer-encoding` set,
    // so this is what keeps a chunked upstream reply from failing the request.
    stubUpstream(
      new Response('ok', {
        headers: {
          'content-encoding': 'gzip',
          connection: 'keep-alive',
          'x-request-id': 'keep-me',
        },
      }),
    )

    const response = await proxyApiRequest(get('/api/v1/ping'), {
      rawOrigin: ORIGIN,
      forwardedPath: 'v1/ping',
      search: new URLSearchParams(),
    })

    expect(response.headers.get('content-encoding')).toBeNull()
    expect(response.headers.get('connection')).toBeNull()
    expect(response.headers.get('x-request-id')).toBe('keep-me')
  })

  it('asks intermediaries not to buffer an event stream', async () => {
    stubUpstream(new Response('data: hi\n\n', { headers: { 'content-type': 'text/event-stream' } }))

    const response = await proxyApiRequest(get('/api/v1/assistant/stream'), {
      rawOrigin: ORIGIN,
      forwardedPath: 'v1/assistant/stream',
      search: new URLSearchParams(),
    })

    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(response.headers.get('x-accel-buffering')).toBe('no')
  })

  it('leaves cache-control alone on an ordinary JSON reply', async () => {
    stubUpstream(
      new Response('{}', {
        headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=30' },
      }),
    )

    const response = await proxyApiRequest(get('/api/v1/me'), {
      rawOrigin: ORIGIN,
      forwardedPath: 'v1/me',
      search: new URLSearchParams(),
    })

    expect(response.headers.get('cache-control')).toBe('private, max-age=30')
  })

  it('answers 502 when the backend cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')))

    const response = await proxyApiRequest(get('/api/v1/ping'), {
      rawOrigin: ORIGIN,
      forwardedPath: 'v1/ping',
      search: new URLSearchParams(),
    })

    expect(response.status).toBe(502)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
  })
})
