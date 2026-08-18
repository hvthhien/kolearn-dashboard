import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from './lib/auth'
import { queryClient } from './lib/queryClient'
import { router } from './router'
import './styles/index.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root is missing from index.html')

/**
 * The mock backend is started before the tree mounts, and only when asked for.
 *
 * kolearn-server has no `/admin` routes yet, so without this the app has
 * nothing to talk to. The switch is an env var rather than a `DEV` check
 * because the day the server does implement them, running against the real
 * thing must be the default and turning the mocks back on must be deliberate.
 */
async function start() {
  if (import.meta.env.VITE_MOCK_API === '1') {
    const { worker, installFetchMock } = await import('./mocks/browser')
    try {
      await worker.start({ onUnhandledRequest: 'bypass' })
    } catch (err) {
      // Registration fails in environments that have nothing to do with this
      // app — embedded webviews and preview panes, private windows, a policy
      // that disables service workers. Falling back to a patched `fetch`
      // keeps the app usable there; rendering is never conditional on either,
      // because a failed mock should produce visible request errors rather
      // than a blank page with one line in the console.
      console.warn('[mocks] service worker unavailable, using the fetch fallback.', err)
      installFetchMock()
    }
  }

  createRoot(rootElement!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}

void start()
