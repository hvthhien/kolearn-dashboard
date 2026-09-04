/**
 * The Cloudflare Worker entry point.
 *
 * Static assets are matched before this handler runs, so a request only
 * arrives here when `dist/` has nothing for it. That leaves three cases: an
 * API call to proxy, a hashed asset that has gone away, and a client-side
 * route that needs the SPA shell.
 */
import { proxyApiRequest } from '../shared/api-proxy'

interface Env {
  /** Backend origin, no `/api` suffix. Set with `wrangler secret put`. */
  KOLEARN_API_ORIGIN?: string
  /** Binding to the built `dist/` directory, declared in `wrangler.jsonc`. */
  ASSETS: Fetcher
}

const API_PREFIX = '/api/'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith(API_PREFIX)) {
      // Unlike Vercel, nothing rewrote this request on the way in: the path is
      // still the one the browser asked for, so the segment below `/api/` is
      // read straight off it. `proxyApiRequest` rejects anything that does not
      // resolve under `/api/v1`.
      return proxyApiRequest(request, {
        rawOrigin: env.KOLEARN_API_ORIGIN,
        forwardedPath: url.pathname.slice(API_PREFIX.length),
        search: url.searchParams,
      })
    }

    // Reaching the Worker means the file is genuinely absent, and for a hashed
    // asset "absent" means the browser is holding an `index.html` from a build
    // that no longer exists. Falling back to the shell answers such a request
    // **200 with `text/html`** — index.html wearing a `.css` URL — which Chrome
    // reports as *"Did not parse stylesheet … because non CSS MIME types are
    // not allowed in strict mode"* and renders unstyled. A 404 lets the browser
    // fail the request honestly and reload.
    //
    // `vercel.json` here still uses the bare `/(.*)` catch-all and so does not
    // make this distinction; kolearn-web's does, and its README explains why at
    // length. Cloudflare's `not_found_handling: "single-page-application"` is
    // that same bare catch-all, which is why `wrangler.jsonc` leaves the
    // fallback to this handler instead.
    if (url.pathname.startsWith('/assets/')) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    // A body-bearing method on an unrouted path is not a deep link, and
    // answering it with the shell would turn a bad request into a 200.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    // Client-side route: serve the shell so a reload on a deep link into the
    // question bank does not 404.
    const shell = await env.ASSETS.fetch(new URL('/index.html', url.origin))
    const headers = new Headers(shell.headers)
    // `_headers` does not apply to responses a Worker produces, so the rule
    // that keeps the shell revalidating has to be set here as well as there.
    // A cached shell is a pinned deployment: it names asset hashes that stop
    // existing at the next deploy.
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
    return new Response(shell.body, {
      status: shell.status,
      statusText: shell.statusText,
      headers,
    })
  },
}
