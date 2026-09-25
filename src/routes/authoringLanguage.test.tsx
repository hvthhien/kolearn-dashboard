import { waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { http } from 'msw'
import { server } from '../mocks/server'
import { renderRoute } from '../test/harness'

/**
 * The corpus every studio list names (docs/proposals/learning-language-contexts.md
 * §6). The API never lets an editor's own study language decide what the
 * studio shows, so a list that forgot `language` would fall back to Korean
 * silently — right today, and wrong on the day a second corpus exists. Fixed
 * to `ko` until the picker arrives; what is asserted here is that it is SENT.
 */

/** Records the `language` each matching GET was sent with, then lets the
 *  mock answer it as usual. */
function watch(path: string) {
  const sent: (string | null)[] = []
  server.use(
    http.get(path, ({ request }) => {
      sent.push(new URL(request.url).searchParams.get('language'))
    }),
  )
  return sent
}

describe('the studio lists name their corpus', () => {
  it.each([
    ['/exams', ['/api/v1/admin/exams']],
    ['/videos', ['/api/v1/admin/shadowing/videos', '/api/v1/admin/shadowing/categories']],
    ['/dictation', ['/api/v1/admin/dictation/sets', '/api/v1/admin/dictation/categories']],
  ])('%s', async (route, paths) => {
    const watched = paths.map((p) => [p, watch(p)] as const)
    renderRoute(route)

    for (const [path, sent] of watched) {
      await waitFor(() => expect(sent.length, `${path} was never requested`).toBeGreaterThan(0))
      expect(new Set(sent), path).toEqual(new Set(['ko']))
    }
  })
})
