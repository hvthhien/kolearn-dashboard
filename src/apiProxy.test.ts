import { env } from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import proxy from '../api/proxy'

const originalOrigin = env.KOLEARN_API_ORIGIN

afterEach(() => {
  if (originalOrigin === undefined) delete env.KOLEARN_API_ORIGIN
  else env.KOLEARN_API_ORIGIN = originalOrigin
  vi.unstubAllGlobals()
})

/**
 * The Vercel Function that keeps the refresh cookie same-origin in production.
 *
 * This file has a second job beyond its assertions: `tsconfig.json` includes
 * `src` and not `api`, so `api/proxy.ts` is only typechecked because this test
 * imports it. Delete this and `npm run build` stops looking at the proxy
 * entirely — a type error there would ship, and the first sign of it would be
 * every request failing on a deployment nobody could log into.
 */
describe('Vercel API proxy', () => {
  it('forwards the API path, query, cookies, and authorization header', async () => {
    env.KOLEARN_API_ORIGIN = 'https://api.example.com'
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Content-Length': '123',
          'Set-Cookie': 'kolearn_refresh=token; Path=/api/v1/auth; HttpOnly; Secure',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await proxy.fetch(
      new Request(
        'https://admin.example.com/api/proxy?__kolearn_path=v1/admin/exams&status=DRAFT',
        {
          headers: {
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            Authorization: 'Bearer access-token',
            Cookie: 'kolearn_refresh=refresh-token',
          },
        },
      ),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('kolearn_refresh=token')
    expect(response.headers.has('content-encoding')).toBe(false)
    expect(response.headers.has('content-length')).toBe(false)
    expect(fetchMock).toHaveBeenCalledOnce()

    const [target, init] = fetchMock.mock.calls[0]!
    expect(target.toString()).toBe('https://api.example.com/api/v1/admin/exams?status=DRAFT')
    expect(new Headers(init?.headers).has('accept-encoding')).toBe(false)
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer access-token')
    expect(new Headers(init?.headers).get('cookie')).toBe('kolearn_refresh=refresh-token')
  })

  it('forwards a request body without its original transport length', async () => {
    env.KOLEARN_API_ORIGIN = 'https://api.example.com'
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await proxy.fetch(
      new Request('https://admin.example.com/api/proxy?__kolearn_path=v1/admin/questions/q-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '20' },
        body: '{"stemKo":"문제"}',
      }),
    )

    const [, init] = fetchMock.mock.calls[0]!
    expect(init?.method).toBe('PUT')
    expect(new Headers(init?.headers).has('content-length')).toBe(false)
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"stemKo":"문제"}')
  })

  // The function is public, and the backend has routes outside /api/v1 that no
  // browser should be able to reach through it — `POST /internal/writing/drain`
  // above all. Normalisation happens before the namespace check, so a
  // dot-segment cannot walk out of it.
  it('rejects paths that escape the generated API namespace', async () => {
    env.KOLEARN_API_ORIGIN = 'https://api.example.com'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    for (const escape of [
      'v1/../../internal/writing/drain',
      'v1/../healthz',
      'v2/admin/exams',
    ]) {
      const response = await proxy.fetch(
        new Request(`https://admin.example.com/api/proxy?__kolearn_path=${escape}`),
      )
      expect(response.status, escape).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a missing backend origin without making a request', async () => {
    delete env.KOLEARN_API_ORIGIN
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const response = await proxy.fetch(
      new Request('https://admin.example.com/api/proxy?__kolearn_path=v1/admin/exams'),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ detail: 'KOLEARN_API_ORIGIN is not configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
