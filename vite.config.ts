import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Refuses to build a deployable bundle with the mock backend switched on.
 *
 * `VITE_MOCK_API` is read at build time and inlined, so a deployment built with
 * it set serves the fixtures in `src/mocks` to whoever opens it — and this is an
 * authoring console, so what they would see is a bank of exams that do not
 * exist, a publish gate that always agrees, and a "Đã lưu" on every save. None
 * of it errors. An editor could spend a morning authoring into a browser tab.
 *
 * That is the same shape as the failures the server guards below the layer that
 * could regress: nothing reports a problem, and the damage surfaces much later.
 * A checkbox in the Vercel dashboard — or a stray `wrangler deploy` from a shell
 * that still has the variable set — is exactly how it would happen, so the
 * refusal is here rather than in a paragraph of the README.
 *
 * A mock-backed deployment is occasionally the point — a preview for someone
 * reviewing the screens with no backend to hand. `KOLEARN_ALLOW_MOCK_BUILD=1`
 * says so out loud, which is all this needs to ask for.
 */
function refuseMockProductionBuild(): Plugin {
  return {
    name: 'kolearn-refuse-mock-production-build',
    apply: 'build',
    config(_config, { mode }) {
      if (process.env.VITE_MOCK_API !== '1') return
      if (process.env.KOLEARN_ALLOW_MOCK_BUILD === '1') {
        // Loud on the way past, so it appears in the build log of the
        // deployment it applies to rather than only in whoever's memory set it.
        console.warn(
          '\n  ⚠  Building with the MOCK backend (KOLEARN_ALLOW_MOCK_BUILD=1).\n' +
            '     Every screen in this bundle shows fixtures, not the question bank.\n',
        )
        return
      }
      throw new Error(
        `VITE_MOCK_API=1 during a ${mode} build.\n\n` +
          'The mock backend is for local development. A bundle built with it serves\n' +
          'invented exams and an always-agreeable publish gate, with nothing on screen\n' +
          'saying so — an editor could author a paper into a browser tab.\n\n' +
          'Unset VITE_MOCK_API for a real deployment (on Vercel: Settings →\n' +
          'Environment Variables; on Cloudflare: the Worker\'s Variables, or your\n' +
          'shell before `npm run cf:deploy`), or set KOLEARN_ALLOW_MOCK_BUILD=1 to\n' +
          'build a deliberately mock-backed preview.',
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), refuseMockProductionBuild()],
  server: {
    // 5174 rather than 5173: kolearn-web owns that one and the two apps are
    // routinely run side by side against the same server. PORT still wins, so
    // a second checkout or a tool that assigns the port can override it.
    port: Number(process.env.PORT) || 5174,
    // Proxied rather than called cross-origin so the refresh cookie is a
    // same-origin httpOnly cookie in development too. Testing auth against a
    // different cookie posture than production ships is how refresh bugs hide.
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  // `npm run preview` serves the built bundle, and it gets the same proxy as
  // the dev server for the same reason: it is the last chance to exercise a
  // production build against a real backend before Vercel does, and a preview
  // that cannot reach the API can only tell you the page renders.
  preview: {
    port: Number(process.env.PORT) || 4174,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
