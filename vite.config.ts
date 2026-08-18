import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
