import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

/**
 * A guard for the theme, not for the app.
 *
 * Two defects shipped because Tailwind has no way to complain about them:
 *
 *   - `bg-page` was used in six places while `@theme` only ever defined
 *     `--color-surface`. An unknown utility is not an error; it emits nothing,
 *     so those elements rendered with no background at all.
 *
 *   - `--color-right` was renamed to `--color-correct`, and one file kept
 *     saying `right`. That is worse than the first case, because `text-right`
 *     and `bg-right` are *built-in* utilities: with the token gone the class
 *     did not go dead, it quietly changed meaning to `text-align: right`, so
 *     the verdict green became an alignment change.
 *
 * Neither shows up in `tsc`, in ESLint, or in a render test that only asks
 * whether a class name is on an element. ESLint sees `'bg-page'` as a string;
 * only Tailwind knows whether it resolves to a custom property. So this asks
 * Tailwind, by compiling the real stylesheet and reading what came out. There
 * is no allowlist to keep in sync — the theme is the source of truth.
 *
 * The second guard is about the *name*, and needs its mechanism stated
 * precisely, because the obvious guess is wrong. While `--color-right` existed
 * it worked: Tailwind emitted the token's colour *and* the built-in, so
 * `bg-right` really did paint the background. The name was never safe though —
 * it dragged a stray `background-position: right` along with it, and it sat one
 * rename away from silently becoming a different property. That is the trap
 * this rejects, by requiring a colour token to emit its colour declaration and
 * nothing else.
 *
 * Like the band-scalar rule's meta-test, the last three cases prove the
 * detector still fires. A guard that matches nothing reports nothing, and the
 * build stays green while the guard is gone.
 *
 * Known gap, stated rather than papered over: once the token is gone, a bare
 * `text-right` where a colour was meant is NOT caught, and cannot be — it
 * compiles to valid alignment CSS, and `text-right` is a legitimate utility.
 * The second guard closes that hole at the other end, when the name is chosen.
 */

const ROOT = process.cwd()
const THEME = path.join(ROOT, 'src/styles/index.css')
const GENERATED = path.join(ROOT, 'src/api/gen')

/** This file quotes broken class names on purpose, so it must not scan itself. */
const SELF = path.join(ROOT, 'src/styles/colourTokens.test.ts')

const require_ = createRequire(import.meta.url)

/** Resolves `@import 'tailwindcss'` and its relative children off disk. */
async function loadStylesheet(id: string, base: string) {
  const file = id.startsWith('.')
    ? path.resolve(base, id)
    : require_.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id)
  return { path: file, base: path.dirname(file), content: await readFile(file, 'utf8') }
}

/** Index of the `}` closing the `{` at `open`. */
function matchBrace(css: string, open: number): number {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return i
  }
  return css.length
}

/**
 * Emitted `@layer utilities` as class name → declarations.
 *
 * Brace-depth rather than a `[^{}]*` body pattern, because an opacity modifier
 * emits a nested `@supports` block: a flat regex reports working classes like
 * `bg-correct/5` as dead, which is a false positive that would make this guard
 * worse than useless. The last test below pins that down.
 */
function utilityRules(css: string): Map<string, string> {
  const rules = new Map<string, string>()

  const at = css.indexOf('@layer utilities')
  if (at < 0) return rules
  const open = css.indexOf('{', at)
  if (open < 0) return rules

  const body = css.slice(open + 1, matchBrace(css, open))
  let i = 0
  while (i < body.length) {
    const brace = body.indexOf('{', i)
    if (brace < 0) break
    const selector = body.slice(i, brace).trim()
    const end = matchBrace(body, brace)
    if (selector.startsWith('.')) {
      // `.bg-correct\/5` is the class `bg-correct/5`.
      const name = selector.slice(1).replace(/\\(.)/g, '$1')
      const declarations = body.slice(brace + 1, end).replace(/\s+/g, ' ').trim()
      // Tailwind emits one class as two rules when a token and a built-in share
      // its name, and merges them when they land adjacent. Joining rather than
      // overwriting means the second guard sees the same declarations the
      // browser would apply, whichever way the output happened to come out.
      const seen = rules.get(name)
      rules.set(name, seen === undefined ? declarations : `${seen} ${declarations}`)
    }
    i = end + 1
  }
  return rules
}

/**
 * Every candidate in one `build()`. The compiler accumulates what it has been
 * asked for, so building twice on one instance leaks results between checks.
 */
async function buildUtilities(css: string, candidates: string[]): Promise<Map<string, string>> {
  const compiler = await compile(css, { base: ROOT, loadStylesheet })
  return utilityRules(compiler.build(candidates))
}

/** The one declaration each utility should produce for a colour token. */
const COLOUR_PROPERTY = {
  bg: 'background-color',
  text: 'color',
  border: 'border-color',
} as const

/**
 * Every `--text-*` size token in `@theme`, ignoring the `--*--line-height`
 * companions — those are read by the font-size utility, they do not emit one.
 *
 * `--text-*: initial` does not match: `*` is outside the character class.
 */
function textTokens(theme: string): string[] {
  return [
    ...new Set(
      [...theme.matchAll(/--text-([a-z0-9-]+):/g)]
        .map((match) => match[1])
        .filter((name): name is string => name !== undefined && !name.endsWith('--line-height')),
    ),
  ]
}

/**
 * What `text-<token>` must emit, and nothing else.
 *
 * Tailwind pairs a font-size token with its `--*--line-height` companion when
 * one exists, so the clean output is one declaration or two depending on the
 * token — not a fixed count.
 */
function expectedTextDeclarations(theme: string, token: string): string[] {
  const declarations = [`font-size: var(--text-${token})`]
  if (theme.includes(`--text-${token}--line-height:`)) {
    declarations.push(`line-height: var(--tw-leading, var(--text-${token}--line-height))`)
  }
  return declarations
}

/** Every `--color-*` in `@theme`, as the three utilities that must stay clean. */
function tokenCandidates(theme: string): string[] {
  const tokens = new Set(
    [...theme.matchAll(/--color-([a-z0-9-]+):/g)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined),
  )
  return [...tokens].flatMap((token) =>
    Object.keys(COLOUR_PROPERTY).map((utility) => `${utility}-${token}`),
  )
}

/** Utilities that take a colour — the ones a missing token can hide inside. */
const COLOUR_UTILITY =
  /^(?:bg|text|border|ring|fill|stroke|divide|outline|accent|caret|decoration|shadow|from|via|to|placeholder)-/

/** Conservative: anything with an interpolation or a stray character is skipped. */
const CLASS_SHAPE = /^[a-z0-9/[\].,%()#-]+$/

const STRING_LITERAL = /'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g

/** `md:hover:bg-brand` is the same token question as `bg-brand`. */
const VARIANTS = /^(?:[a-z0-9-]+:)+/

async function sourceFiles(dir: string, acc: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (full !== GENERATED) await sourceFiles(full, acc)
    } else if (/\.tsx?$/.test(entry.name) && full !== SELF) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * Class name → the file it came from, for a failure message that names the fix.
 *
 * Every string literal is read, not just `className={...}`: the renamed-token
 * defect lived in a `const mark = cond ? 'border-right …' : …` ternary, which a
 * JSX-attribute-only scan would have walked straight past.
 */
async function colourUtilitiesInSource(): Promise<Map<string, string>> {
  const found = new Map<string, string>()

  for (const file of await sourceFiles(path.join(ROOT, 'src'))) {
    const source = await readFile(file, 'utf8')
    for (const literal of source.matchAll(STRING_LITERAL)) {
      const text = literal[1] ?? literal[2] ?? literal[3] ?? ''
      for (const word of text.split(/\s+/)) {
        const candidate = word.replace(VARIANTS, '')
        if (!COLOUR_UTILITY.test(candidate)) continue
        if (!CLASS_SHAPE.test(candidate)) continue
        if (!found.has(candidate)) found.set(candidate, path.relative(ROOT, file))
      }
    }
  }
  return found
}

describe('colour utilities resolve to the tokens they name', () => {
  it('leaves no class in src/ that compiles to nothing', async () => {
    const used = await colourUtilitiesInSource()
    const rules = await buildUtilities(await readFile(THEME, 'utf8'), [...used.keys()])

    const dead = [...used]
      .filter(([candidate]) => !rules.has(candidate))
      .map(([candidate, file]) => `${candidate} — ${file}`)

    expect(dead).toEqual([])
  })

  it('gives no --color token a name that collides with a built-in utility', async () => {
    const theme = await readFile(THEME, 'utf8')
    const rules = await buildUtilities(theme, tokenCandidates(theme))

    // Exactly the colour declaration, nothing beside it. A token sharing its
    // name with a built-in still paints — it just drags the built-in's property
    // along, which is the tell that the name is one rename from changing
    // meaning. `--color-right` fails here on `background-position: right`.
    const collisions = tokenCandidates(theme)
      .map((candidate) => {
        const utility = candidate.slice(0, candidate.indexOf('-')) as keyof typeof COLOUR_PROPERTY
        const token = candidate.slice(candidate.indexOf('-') + 1)
        const emitted = (rules.get(candidate) ?? '')
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean)
        const expected = `${COLOUR_PROPERTY[utility]}: var(--color-${token})`
        return emitted.length === 1 && emitted[0] === expected
          ? null
          : `${candidate} — ${emitted.join(' | ') || 'no css'}`
      })
      .filter((failure): failure is string => failure !== null)

    expect(collisions).toEqual([])
  })

  it('still detects a class that names no token', async () => {
    const rules = await buildUtilities(await readFile(THEME, 'utf8'), ['bg-page', 'bg-surface'])

    expect(rules.has('bg-surface')).toBe(true)
    expect(rules.has('bg-page')).toBe(false)
  })

  it('still detects a token name that collides with a built-in utility', async () => {
    // The pre-rename theme, which is how `text-right` came to mean alignment.
    const theme = (await readFile(THEME, 'utf8')).replace(
      '--color-correct:',
      '--color-right: oklch(0.505 0.09 168);\n  --color-correct:',
    )
    const rules = await buildUtilities(theme, ['bg-right', 'text-right', 'border-correct'])

    // The colour is there — the name was never *broken*, only booby-trapped —
    // and the built-in rides along beside it. That second declaration is the
    // whole signal.
    expect(rules.get('bg-right')).toContain('var(--color-right)')
    expect(rules.get('bg-right')).toContain('background-position: right')
    expect(rules.get('text-right')).toContain('text-align: right')

    // The control: a token no built-in claims emits its colour and nothing else.
    expect(rules.get('border-correct')).toBe('border-color: var(--color-correct);')
  })

  it('does not mistake an opacity modifier for a dead class', async () => {
    const rules = await buildUtilities(await readFile(THEME, 'utf8'), ['bg-correct/5'])

    expect(rules.has('bg-correct/5')).toBe(true)
  })
})

/**
 * The same two questions, asked of the type scale.
 *
 * The colour guard above was written for `--color-*` and stops there, but the
 * trap it was built for is a property of the `text-` prefix, not of colour:
 * `text-right`, `text-balance`, `text-nowrap`, `text-ellipsis` and `truncate`
 * are all built-in utilities, and `--text-right` would emit `text-align: right`
 * beside its font-size exactly the way `--color-right` did. Nothing caught that
 * until this block existed, and the scale has role-named tokens — `--text-ko`,
 * `--text-gloss` — so the next one is a plausible name away.
 *
 * Deadness is already covered from the other end: `COLOUR_UTILITY` includes
 * `text-`, so the first test in this file fails on any `text-*` class in `src/`
 * that compiles to nothing. That is what makes `--text-*: initial` in the theme
 * enforceable — with the namespace closed, a step outside the scale is a dead
 * class and the build says so.
 */
describe('the type scale emits what it names', () => {
  it('gives no --text token a name that collides with a built-in utility', async () => {
    const theme = await readFile(THEME, 'utf8')
    const tokens = textTokens(theme)
    const rules = await buildUtilities(
      theme,
      tokens.map((token) => `text-${token}`),
    )

    const collisions = tokens
      .map((token) => {
        const emitted = (rules.get(`text-${token}`) ?? '')
          .split(';')
          .map((declaration) => declaration.trim())
          .filter(Boolean)
        const expected = expectedTextDeclarations(theme, token)
        return emitted.length === expected.length &&
          expected.every((declaration, i) => emitted[i] === declaration)
          ? null
          : `text-${token} — ${emitted.join(' | ') || 'no css'}`
      })
      .filter((failure): failure is string => failure !== null)

    expect(collisions).toEqual([])
  })

  // The meta-test. Same reasoning as the colour one: a guard that matches
  // nothing reports nothing, and the build stays green while the guard is gone.
  it('still detects a --text token name that collides with a built-in utility', async () => {
    const theme = (await readFile(THEME, 'utf8')).replace(
      '--text-ko:',
      '--text-right: 1rem;\n  --text-balance: 2rem;\n  --text-ko:',
    )
    const rules = await buildUtilities(theme, ['text-right', 'text-balance', 'text-ko'])

    // The size lands, so the name is not *broken* — it drags the built-in along
    // beside it, which is the whole signal, and one rename from being the only
    // thing left.
    expect(rules.get('text-right')).toContain('font-size: var(--text-right)')
    expect(rules.get('text-right')).toContain('text-align: right')
    expect(rules.get('text-balance')).toContain('text-wrap: balance')

    // And the detector built on that output rejects them while passing a token
    // no built-in claims.
    const failed = ['right', 'balance', 'ko'].filter((token) => {
      const emitted = (rules.get(`text-${token}`) ?? '')
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean)
      const expected = expectedTextDeclarations(theme, token)
      return !(
        emitted.length === expected.length &&
        expected.every((declaration, i) => emitted[i] === declaration)
      )
    })

    expect(failed).toEqual(['right', 'balance'])
  })

  // The control for the namespace wipe. `--text-*: initial` is what makes the
  // scale closed, and it is one line that silently does nothing if it is
  // dropped or misspelt — after which every off-scale step compiles again and
  // the first test in this file goes quiet for the wrong reason.
  it('leaves no font-size step outside the scale', async () => {
    const theme = await readFile(THEME, 'utf8')
    const rules = await buildUtilities(theme, ['text-xs', 'text-4xl', 'text-5xl', 'text-9xl'])

    expect(rules.has('text-xs')).toBe(true)
    expect(rules.has('text-4xl')).toBe(true)
    expect(rules.has('text-5xl')).toBe(false)
    expect(rules.has('text-9xl')).toBe(false)
  })

  // Clearing the font-size namespace must not take the alignment, wrapping and
  // overflow utilities with it — they share the prefix and nothing else.
  it('leaves the non-size text utilities alone', async () => {
    const rules = await buildUtilities(await readFile(THEME, 'utf8'), [
      'text-right',
      'text-balance',
      'text-ellipsis',
      'truncate',
    ])

    expect(rules.get('text-right')).toBe('text-align: right;')
    expect(rules.get('text-balance')).toBe('text-wrap: balance;')
    expect(rules.get('text-ellipsis')).toBe('text-overflow: ellipsis;')
    expect(rules.has('truncate')).toBe(true)
  })
})
