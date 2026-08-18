import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** Started from `main.tsx`, and only when `VITE_MOCK_API=1`. */
export const worker = setupWorker(...handlers)

/**
 * The fallback for a browser that will not register a service worker.
 *
 * MSW's browser mode is a service worker, and there are real environments that
 * refuse to install one for reasons that have nothing to do with this app:
 * embedded webviews and preview panes, private windows, a policy that disables
 * them. When that happens the app boots against no backend at all, and every
 * screen shows the same network error — which looks exactly like the app being
 * broken.
 *
 * So the same handlers are run over a patched `fetch` instead. It intercepts
 * less than the service worker does — anything not going through `fetch`, and
 * anything a page loads directly, is untouched — but every call this app makes
 * is a `fetch` through `apiFetch`, which is the whole of what needs mocking.
 *
 * Development only. Nothing imports this outside `main.tsx`'s mock branch.
 */
export function installFetchMock(): void {
  const real = globalThis.fetch.bind(globalThis)
  let counter = 0

  globalThis.fetch = async (input, init) => {
    const request = new Request(input as RequestInfo, init)

    for (const handler of handlers) {
      const result = await handler.run({ request: request.clone(), requestId: `m${counter++}` })
      if (result?.response) return result.response
    }
    // Unhandled requests fall through to the network, matching the worker's
    // `onUnhandledRequest: 'bypass'`: Vite's own module and asset requests go
    // through here too.
    return real(request)
  }
}
