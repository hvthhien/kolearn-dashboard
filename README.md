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

There is no backend to run against yet — see below — so the app serves itself
from the in-repo mock:

```bash
npm install
VITE_MOCK_API=1 npm run dev
```

Sign in with any email and password; the mock returns a `content_admin`
session. Against a real server, drop `VITE_MOCK_API` and start
`kolearn-server` on `:8080`; Vite proxies `/api` to it so the refresh cookie is
a same-origin httpOnly cookie in development exactly as in production.

```bash
npm run check      # api:check + lint + typecheck + test
```

## The contract is authored here, not vendored

This is the one real difference from `kolearn-web`, and it decides how several
other things in the repo are arranged.

`kolearn-web` vendors `kolearn-server/api/openapi.yaml` byte for byte and
generates its client from the copy. This repo cannot: **the server has no admin
API.** All 38 paths in its spec are auth and learner-facing, and authoring
today happens only through `cmd/importer`. So `api/openapi.yaml` here is a
*proposal* — the contract this app is built against and the server is expected
to implement.

What is not proposed is anything underneath it. The permissions each operation
names (`exam:write`, `exam:publish`, `question:write`, `topic:manage`,
`import:manage`), the publish report's split into blockers and warnings, and
the column each field maps to all exist already, in
`db/migrations/00003_rbac.sql`, `internal/bank/publish.go` and
`db/migrations/00005_question_bank.sql`. The spec is written to fit them rather
than the other way round.

```bash
npm run api:gen    # regenerate after editing the spec
npm run api:check  # fails on a stale client, or on drift in the shared half
```

`api:check` compares only the blocks the server already owns — `/auth/login`,
`/auth/refresh`, `/auth/logout`, `/me`, and the `Problem`, `AuthTokens` and
`CurrentUser` schemas — against `../kolearn-server/api/openapi.yaml`, and skips
when that checkout is absent. An admin signs in through the learner's own
endpoints, and a login client generated from last week's copy of somebody
else's contract compiles perfectly and fails at runtime.

**When the server implements `/admin`, the direction reverses.** This file
becomes vendored, `scripts/api-check.sh` becomes `kolearn-web`'s, and the
proposal stops being a proposal. Until then, a change here is a change to a
document two repositories are supposed to agree on.

`/auth/register` is deliberately absent. Admin accounts are provisioned with a
role; a console that lets a visitor create their own account is not an admin
console.

## Why MSW is here

`kolearn-web` fakes the network with a hand-rolled `vi.stubGlobal('fetch')`
harness, and that works because a real server exists to run against. Here it
does not, so the mock has to serve two consumers — `npm run dev` in a browser
and the test suite — and two mock layers would drift, with the one that
disagrees with the eventual server being whichever nobody was looking at.

So `src/mocks/handlers.ts` is the single set, used by `setupWorker` in the
browser and `setupServer` in tests. It holds mutable state on purpose: three of
the criteria are statements about what happens *after* a write, and a save that
does not change what the next GET returns cannot demonstrate that a save works.

Fixtures are lifted from `kolearn-server/db/seed/exam-topik-ii-83.json`, so the
Korean, the Vietnamese, the evidence offsets and the topic names are shapes the
real importer produces.

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

**TCCN-301-8 is only half-covered here, and the missing half is the important
one.** The criterion says the block on changing a sat question's answer key
must sit *at the data layer, not the admin UI* — the other four prohibitions
are enforced beneath the layer that could regress, precisely because the layer
above them is a screen like this one. `kolearn-server` has no such trigger:
nothing in `db/migrations` guards `question_choices.is_correct`. The tests in
`src/routes/answerLock.test.tsx` cover the client half — that the refusal is
surfaced with its reason and the versioning path offered — and they are not
evidence that the answer key cannot be changed.

The drafted criteria propose this as the product's **fifth prohibition**. It
needs a migration in `kolearn-server` before it is true.

**TCCN-303-2 is checked indirectly and skips without a sibling checkout.** The
criterion is about *kolearn-web*'s screens, which no test here can look at.
`src/api/learnerSpecGuard.test.ts` checks the layer underneath — that no
learner-facing schema in the server's spec carries a difficulty field — and
skips when `../kolearn-server` is absent, the same posture `api-check.sh`
takes. A skipped test proves nothing; the full check belongs in `kolearn-web`,
beside the screens.

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

Creating an exam from scratch (the contract has `POST /admin/exams`; the screen
does not), editing passages and uploading assets, the topic catalogue's own
management screen, question versions beyond the one the answer lock creates,
and Playwright. Difficulty is authored but nothing reads it — its user is the
ver1.1 placement test.
