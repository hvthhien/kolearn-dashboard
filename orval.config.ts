import { defineConfig } from 'orval'

/**
 * Reads ./api/openapi.yaml, which — unlike kolearn-web's — is *authored* here
 * rather than vendored from kolearn-server. The server has no /admin paths
 * yet, so this file is the proposal the Go handlers will be written against.
 * `npm run api:check` still guards the half the server already owns: the auth
 * operations below must stay byte-identical to its spec.
 */
export default defineConfig({
  kolearn: {
    input: { target: './api/openapi.yaml' },
    output: {
      target: './src/api/gen/kolearn.ts',
      schemas: './src/api/gen/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      // The spec's `servers: /api/v1` is not applied automatically, and every
      // path would otherwise be generated one segment short.
      baseUrl: '/api/v1',
      override: {
        mutator: { path: './src/lib/http.ts', name: 'apiFetch' },
        // apiFetch throws a ProblemError on a non-2xx, so the error arms of a
        // `{ data, status, headers }` union are unreachable and the wrapper
        // would be pure ceremony.
        fetch: { includeHttpResponseReturnType: false },
        query: { signal: true },
      },
    },
  },
})
