import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * kolearn-web carries a second rule here — the band-scalar guard for điều cấm
 * #1. It is deliberately absent: this app renders no score and no band, so a
 * rule matching nothing would report nothing and read, a year from now, as if
 * the guard were in place.
 */
export default tseslint.config(
  {
    /* `.claude` holds git worktrees — full checkouts of this repo with their
       own tsconfig. Left unignored, the type-aware parser finds two candidate
       roots and refuses to parse anything. Same category as `dist`: not
       source. `public/mockServiceWorker.js` is vendored by msw. */
    ignores: [
      'dist',
      'src/api/gen',
      'node_modules',
      'coverage',
      '.claude',
      'public/mockServiceWorker.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
