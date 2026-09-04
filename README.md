# kolearn-dashboard

Question-bank admin for Kolearn — `SC-BANK-ADMIN`. **Internal. Not a learner
screen.**

Vite · React 19 · TypeScript · TanStack Router · TanStack Query · Tailwind 4 —
the same stack as `kolearn-web`, deliberately, so that moving between the two
costs nothing.

It covers three requirements: **YC-301** (author exams, questions, the five
explanation layers and the Vietnamese translation), **YC-302** (exam structure
read from blueprint configuration, both TOPIK II sittings), and **YC-303**
(per-question difficulty).

## Running it

Needs `kolearn-server` on `:8080` with a migrated, seeded database:

```bash
cd ../kolearn-server && make db-create && make migrate && make seed && make run
```

```bash
npm install && npm run dev
```

Vite proxies `/api` to `localhost:8080`, so the refresh cookie is a same-origin
httpOnly cookie in development exactly as it is in production.

Signing in needs an account with `exam:read`, which means a `content_editor`,
`content_admin` or `admin` role. Registration assigns `learner` and nothing
else, so a new account is granted its role in SQL:

```bash
psql -d kolearn -c "INSERT INTO user_roles (user_id, role_code) SELECT id, 'content_admin' FROM users WHERE email = 'you@example.com' ON CONFLICT DO NOTHING;"
```

`content_admin` rather than `admin`: the `admin` role is systems
administration and holds `exam:read` but none of `exam:write`,
`question:write` or `exam:publish`, so it opens this app and then cannot save a
question.

To work without a backend — offline, or on a screen the server does not serve
yet — set `VITE_MOCK_API=1` and the in-repo MSW handlers answer instead.

```bash
npm run check      # api:check + lint + typecheck + test
```

## Deploying to Vercel

The checked-in `vercel.json` and `api/proxy.ts` make this app deployment-ready:

- Vercel builds with Node 22 (from `engines`), runs `npm run build`, and
  publishes `dist/`;
- client-side routes fall back to `index.html`, so a reload on `/exams` or a
  question editor route does not 404;
- `/api/v1/*` is reverse-proxied to `kolearn-server`, which is what keeps the
  refresh cookie a **same-origin httpOnly cookie** in production. The browser
  never makes a cross-origin request, so this app does not need to appear in the
  server's `HTTP_ALLOWED_ORIGINS`;
- hashed Vite assets are cached for a year, while `index.html` is revalidated.

First deploy `kolearn-server` to a public HTTPS origin. Then import this Git
repository in Vercel and configure:

1. Set **Root Directory** to `kolearn-dashboard` when importing the parent
   repository. Leave it as `.` when this repository is imported on its own.
2. Add `KOLEARN_API_ORIGIN` under **Settings → Environment Variables** for both
   Production and Preview. Its value is the backend origin only, for example
   `https://kolearn-server.vercel.app` — no `/api` suffix, no path.
3. Deploy. Framework, build command, output directory, API proxy and SPA
   routing all come from `vercel.json`; none of it needs dashboard overrides.

CLI deployment is equivalent:

```bash
cd kolearn-dashboard
```

```bash
npx vercel@latest link
```

```bash
npx vercel@latest env add KOLEARN_API_ORIGIN production
```

```bash
npx vercel@latest --prod
```

After deploying, open `/login`, sign in with an account that has `exam:read`,
reload the page, and confirm in the network panel that
`/api/v1/auth/refresh` returns 200. That exercises both the SPA fallback and
the refresh-cookie proxy, which are the two things a static host gets wrong.

### **Do not set `VITE_MOCK_API` on Vercel**

The build refuses it, and the refusal is the point rather than a convenience.
`VITE_MOCK_API` is read at build time and inlined, so a deployment built with it
serves the fixtures in `src/mocks` to whoever opens it: a bank of exams that do
not exist, a publish gate that always agrees, and a "Đã lưu" on every save,
with nothing erroring. An editor could spend a morning authoring into a browser
tab. That is the same shape as the failures the server blocks below the layer
that could regress, so the block is in `vite.config.ts` rather than in this
paragraph.

A mock-backed preview is occasionally what you want — showing the screens to
someone with no backend to hand. `KOLEARN_ALLOW_MOCK_BUILD=1` asks for it out
loud, the build log says so, and every screen carries a banner saying the data
is invented.

`public/mockServiceWorker.js` ships with the bundle either way. It is inert
unless the app registers it, which only the mock branch does, and it has to be
served from the site root for local development to work at all.

## Deploying to Cloudflare Workers

The app deploys to Cloudflare as an alternative to Vercel; both configurations
are checked in and neither disturbs the other. `wrangler.jsonc` uploads `dist/`
as [static assets](https://developers.cloudflare.com/workers/static-assets/) and
puts `worker/index.ts` in front of them.

```bash
npx wrangler login
```

```bash
npx wrangler secret put KOLEARN_API_ORIGIN
```

```bash
npm run cf:deploy
```

`KOLEARN_API_ORIGIN` is the backend origin only, exactly as on Vercel — no
`/api` suffix, no path. The proxy is the same code on both hosts
(`shared/api-proxy.ts`), so the same-origin httpOnly refresh cookie works the
same way here, and this app still does not need to appear in the server's
`HTTP_ALLOWED_ORIGINS`.

Two differences from the Vercel setup are worth knowing:

- **the SPA fallback is written in the Worker, not in config.** Cloudflare's
  `not_found_handling: "single-page-application"` behaves like this repo's
  `/(.*)` rewrite: it answers *every* unmatched path with `index.html`,
  including a hashed `/assets/` URL from a build that no longer exists — served
  200 as `text/html`, which the browser then refuses to parse as CSS or JS.
  `worker/index.ts` returns a plain 404 under `/assets/` and the shell
  everywhere else. (kolearn-web's README explains the failure in full; its
  `vercel.json` carries the exclusion and this one does not.)
- **cache headers live in `public/_headers`**, read by Cloudflare and ignored by
  Vercel, which takes the same rules from `vercel.json`. `_headers` does not
  apply to responses the Worker builds, so the shell sets its own
  `Cache-Control` in `worker/index.ts`.

`npm run cf:dev` serves the built `dist/` through the real Worker locally, which
is the only way to exercise the fallback and the proxy together. `npm run dev`
remains the everyday loop.

```bash
npm run build
```

```bash
npm run cf:dev
```

`VITE_MOCK_API` is inlined at build time, so the guard in `vite.config.ts`
refuses a mock-backed build here exactly as it does on Vercel — a shell that
still has the variable set is the way it would otherwise reach a deploy.

## The API client is generated

`src/api/gen/` is orval output and is committed. `api/openapi.yaml` is a
**vendored copy** of the server's spec, so this repo builds on its own.

```bash
npm run api:gen    # regenerate after copying a new spec
npm run api:check  # fails on a stale client, or on drift from the server's spec
```

This app was built contract-first, against an `/admin` surface the server did
not have: the spec here was authored as a proposal and served by MSW. The
server implements it now, so the direction has reversed and the spec is
vendored like `kolearn-web`'s. Three things the proposal got wrong are worth
knowing, because each is a place where writing a contract without reading the
implementation produced something plausible and false:

- Problem codes are `snake_case` and `type` is a full URL
  (`https://kolearn.vn/problems/question_answer_locked`).
- The import report counts what the gate produces — passages, questions,
  choices, new topics — not created/updated/skipped. An import whose exam code
  already exists is refused outright rather than merged, so there is no diff to
  describe.
- Import issues carry `where` (`questions[14].choices`), not a line number. The
  gate validates the parsed bundle; by then the line is gone.

`/auth/register` is not used here. Admin accounts are provisioned with a role;
a console that lets a visitor create their own account is not an admin
console.

## Why MSW is here

`kolearn-web` fakes the network with a hand-rolled `vi.stubGlobal('fetch')`
harness. This repo uses MSW because it was built before the server had an
`/admin` surface, and the mock had to serve both `npm run dev` and the test
suite — two mock layers would have drifted, with the one that disagreed with
the eventual server being whichever nobody was looking at.

It stays now that the server is real, for the tests: they need no database, no
running API and no seeded content, so the suite is a few seconds rather than a
migration away. `src/mocks/handlers.ts` is the single set, used by
`setupWorker` in the browser behind `VITE_MOCK_API` and `setupServer` in tests.
It holds mutable state on purpose — several criteria are statements about what
happens *after* a write, and a save that does not change what the next GET
returns cannot demonstrate that a save works.

Fixtures are lifted from `kolearn-server/db/seed/exam-topik-ii-83.json`, so the
Korean, the Vietnamese, the evidence offsets and the topic names are shapes the
real importer produces.

The tests are therefore a check on this app against the *agreed* contract, not
on the server. `npm run api:check` is what keeps the two honest.

## Three things that are load-bearing

**A layer that has not been written is absent, not empty.** Every explanation
field is nullable and nothing defaults to `""`. `blankToNull` in
`src/features/question/useQuestionDraft.ts` is the single place blank becomes
`null`, because this screen is the only thing in the whole system that can
manufacture an empty string in the first place — the server nulls blanks on the
way in, and the learner's client has nowhere that substitutes "Chưa có". The
difference is invisible until it is on a learner's screen, where an empty
string renders a layer heading with nothing under it: read as *the author had
nothing to say* rather than *this layer is not written yet* (TCCN-301-3).

**Blockers and warnings stay two lists.** `bank.Publish` returns them
separately and `PublishDialog` shows them separately. Merging them into one
friendly "problems" list reads better and destroys the reason both exist: a
blocker refuses the publish, a warning is a judgement call — and if warnings
blocked too, nobody would publish anything and the gate would be routed around
(TCCN-301-7).

**Nothing here is a constant that R-16 owns.** Every question count, time limit
and score on the blueprint panel comes from the exam's own sections, copied out
of `exam_blueprints` when the paper was created. GĐ-1 warns the TOPIK format
changes between years and must be checked against the official publication,
which only works if a format change is a new version of a config row rather
than an edit to a component (TCCN-302-1). `blueprintPanel.test.tsx` serves a
paper with deliberately non-standard numbers, so a screen holding constants
cannot pass.

## What this repo does not prove

**TCCN-301-8 is now enforced below this app, which is what the criterion
asked for.** Migration `00016` adds a trigger refusing any change to
`question_choices.is_correct` once the question appears in a SUBMITTED attempt,
and `internal/prohibitions` asserts it — the same two-layer shape as điều cấm
#2 and #3. The tests in `src/routes/answerLock.test.tsx` cover this side of it:
that the 409 is surfaced with its reason and the versioning path offered.
Neither half is evidence for the other, and both exist.

**TCCN-303-2 is still checked indirectly.** The criterion is about
*kolearn-web*'s screens, which no test here can look at.
`src/api/learnerSpecGuard.test.ts` checks one layer down — that only the
authoring schemas in the vendored spec carry a difficulty field — and
recognises "authoring schema" by the `Admin` name prefix, which is a convention
rather than a proof of reachability. The real guarantee belongs in
`kolearn-web`, beside the screens.

## Acceptance criteria

`kolearn-server/cmd/tccn` scans this repo for `TCCN-` ids, so the tests here
feed its matrix:

```bash
cd ../kolearn-server && make tccn
```

All 17 of `TCCN-301-1…10`, `TCCN-302-1…4` and `TCCN-303-1…3` are named by a
test. Every one of them is `source=drafted` — written by the development team
because the requirement had none, not agreed with the BA — so passing against
them is a weaker claim than passing against the specification, and
`docs/drafted-criteria.md` in the server repo carries two questions still
waiting on an answer.

## What is not here yet

Creating an exam from scratch, editing exam metadata, editing passages and
uploading assets, and adding to the topic catalogue: all three are permissions
the server grants (`exam:write`, `passage:write`, `topic:manage`) with no
screen behind them. Bulk import through the API cannot carry audio or images —
a paper with media still goes through `cmd/importer -assets`. No Playwright.

Difficulty is a TOPIK band, 1–6, and the ver1.1 placement test is what reads
it — the first and so far only reader. It ran 1–5 until migration 00021; the
scale changed because R-32 addresses difficulty in bands ("độ khó ở TOPIK4"),
and it changed while it was still cheap, with no real paper tagged yet. It
stays off every learner screen (TCCN-303-2), which `learnerSpecGuard` checks
from here and `leak_test.go` checks again on the server.

Two gaps in the server are worth knowing about from here. `roles.requires_mfa`
is `true` for every staff role and **nothing reads it** — TOTP returns
`ErrNotImplemented` — so this console is protected by a password alone. And
`audit_logs` exists, is append-only, and has no writer, while this app
publishes and supersedes questions.
