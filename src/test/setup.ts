import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from '../mocks/server'
import { resetMockBank } from '../mocks/handlers'
import { setAccessToken } from '../lib/http'

/**
 * `error` rather than `bypass`: in a test an unhandled request is a call the
 * suite did not know the screen made, and letting it fall through to a real
 * socket turns that into a timeout somewhere unrelated.
 */
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  // The mock bank is mutable, so one test's save would otherwise be the next
  // test's starting state — the kind of coupling that makes a suite pass in
  // order and fail alone.
  resetMockBank()
  setAccessToken(null)
})

afterAll(() => server.close())
