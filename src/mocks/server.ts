import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/**
 * The same handlers the browser worker serves, over Node's request
 * interception. Tests narrow a case with `server.use(...)` rather than
 * standing up a second, divergent set of fakes.
 */
export const server = setupServer(...handlers)
