import { env } from 'node:process'

import { proxyApiRequest } from '../shared/api-proxy'

// Vercel reaches this function through the rewrite in `vercel.json`, which
// carries the real path in a query parameter because a rewrite cannot pass a
// path segment to a function any other way. The Cloudflare Worker has the
// path already and does not need this.
const INTERNAL_PATH_PARAM = '__kolearn_path'

export default {
  async fetch(request: Request): Promise<Response> {
    const incoming = new URL(request.url)
    const forwardedPath = incoming.searchParams.get(INTERNAL_PATH_PARAM)
    incoming.searchParams.delete(INTERNAL_PATH_PARAM)

    return proxyApiRequest(request, {
      rawOrigin: env.KOLEARN_API_ORIGIN,
      forwardedPath,
      search: incoming.searchParams,
    })
  },
}
