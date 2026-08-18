import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { routeTree } from '../router'
import { AuthProvider } from '../lib/auth'
import { setAccessToken } from '../lib/http'

/**
 * Route-level tests drive the real router over the real route tree, so a test
 * exercises the screen the way a browser reaches it — including the root
 * layout's session and permission gates, which are where two of this app's
 * behaviours actually live.
 *
 * kolearn-web's equivalent also stubs `fetch`; here the network comes from the
 * shared MSW handlers in `src/mocks`, set up once in `src/test/setup.ts`.
 */
export function renderRoute(path: string) {
  setAccessToken('test-access-token')

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient }
}

/** For a component that needs the query client but not the router. */
export function renderWithQuery(ui: ReactNode) {
  setAccessToken('test-access-token')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
    queryClient,
  }
}
