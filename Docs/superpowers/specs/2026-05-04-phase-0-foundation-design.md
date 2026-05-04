# Phase 0 Foundation — Design

**Status:** Draft, pending review.
**Date:** 2026-05-04.
**Authors:** Kasper + Claude (brainstorming session).
**Scope:** Phase 0 of `PLAN.md` §8 — bootstrap the Conto repo from doc-only to a runnable app where a user can sign up, upload a file to R2, and see a no-op pg-boss job log against it. Includes test infrastructure, AU subcategory seeds, and a minimal UI shell so subsequent phases have a working canvas.

---

## 1. Why this spec exists

`PLAN.md` §8 Phase 0 names what's needed but doesn't pin the implementation choices. ADR-2 says "Lucia or Auth.js" — neither resolved. Plan A committed schema deltas (`recurrence_groups`, `pay_cadences`, `expected_events`, deduction flags, receipt slot, cashflow buffer) but didn't say *which* phase lands those tables; Plan A's PLAN.md update implies Phase 0. This spec resolves the remaining choices and lays out the executable shape of Phase 0.

### Goals
- Take the repo from doc-only to a running web + worker application.
- Land **all** §4 tables in V1 migrations — including Plan A's additions.
- Provide test infrastructure (Vitest + Playwright) so Phase 1 implementers can write tests immediately.
- Set up Tailwind + shadcn/ui basics so future UI work has primitives.
- Seed the AU deductible subcategory taxonomy (per ADR-9) automatically.
- Document a single "getting started" flow in the README.

### Non-goals
- Deploy pipeline (Vercel / Fly.io / Railway). Deferred until first feature actually needs it.
- GitHub Actions CI. Deferred — local `npm test` is the gate at Phase 0.
- Observability / error reporting (Sentry, etc.). Deferred.
- OAuth providers. Better Auth supports them but Phase 0 ships email + password only.
- Pre-signed R2 URLs. Server-side PUT is fine at Phase 0 file sizes.

### What "done" means

A reviewer clones the repo on a clean machine with Node 20+, Docker, and a Cloudflare R2 bucket. Following the README's "Getting started," they:

1. `cp .env.example .env` and fill in credentials.
2. `docker compose up -d` brings up Postgres.
3. `npm install`, `npm run db:migrate`, `npm run db:seed`.
4. `npm run dev` and `npm run worker:dev` in separate terminals.
5. Visit `http://localhost:3000`, sign up with email + password, upload a small file.
6. Worker terminal logs `[noop] { uploadedKey, userId, filename }`.
7. `npm test` and `npm run test:e2e` both pass against a fresh checkout.

---

## 2. Decisions ratified during brainstorming

These supersede or extend earlier ADRs:

- **Auth library: Better Auth** (v1.x) with the Drizzle adapter, Postgres provider. ADR-2 currently says "Lucia or Auth.js"; the implementation plan updates ADR-2 (or supersedes it) to commit Better Auth specifically. Rationale: Lucia v3 is in maintenance mode (since late 2024); Better Auth is the actively-maintained spirit-successor with a Drizzle adapter and email+password out of the box.
- **R2 in dev: real R2 from day one.** No MinIO mock. One set of credentials in `.env`.
- **Repo structure: single Next.js package** (Option 1 from brainstorming). Code under `app/`, `components/`, `lib/`, `tests/`. Worker runs as a separate process from the same package. No monorepo tooling.
- **Phase 0 done-when scope: Recommended.** PLAN.md done-when + Vitest + Playwright + Tailwind/shadcn + AU seed + README. Defers: deploy pipeline, GitHub Actions, observability.

### PLAN.md §4 update required

Better Auth manages credentials in its own `account` table. Conto's planned `users` table loses `password_hash` and gains Better Auth's standard columns. The Phase 0 plan must update PLAN.md §4 to:

```sql
users (
  id uuid pk,
  email text unique not null,
  email_verified boolean not null default false,
  name text,                              -- was display_name
  image text,                             -- Better Auth standard, nullable
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cashflow_buffer_cents bigint not null default 50000
)
-- Plus Better Auth's tables: session, account, verification (managed by Better Auth's CLI / migrations)
```

The implementation plan adds the PLAN.md §4 edit + an ADR-2 supersession note as explicit tasks.

---

## 3. Architecture — single Next.js package

### File structure

```
/
├── app/                                  Next.js routes (App Router)
│   ├── layout.tsx                        Root: Tailwind base, fonts
│   ├── page.tsx                          Redirects to /dashboard or /sign-in
│   ├── sign-in/page.tsx                  Email + password form
│   ├── sign-up/page.tsx                  Email + password + confirm form
│   ├── (authenticated)/
│   │   ├── layout.tsx                    Session gate; redirect to /sign-in
│   │   ├── dashboard/page.tsx            Greeting + nav + "Upload a file" link
│   │   └── upload/page.tsx               File upload demo (the done-when target)
│   └── api/
│       ├── auth/[...all]/route.ts        Better Auth's catch-all handler
│       └── upload/route.ts               POST multipart → R2 PUT → enqueue noop
├── components/
│   ├── ui/                               shadcn primitives (button, input, label, card, form)
│   └── nav.tsx                           Authenticated nav
├── lib/
│   ├── db/
│   │   ├── client.ts                     Drizzle client + transaction helper
│   │   ├── schema.ts                     All §4 tables (incl. Plan A deltas)
│   │   ├── migrations/                   Drizzle-generated SQL
│   │   └── seeds/
│   │       ├── index.ts                  runAllSeeds() entry
│   │       └── au-subcategories.ts       AU deductible taxonomy from ADR-9
│   ├── auth/
│   │   ├── better-auth.ts                Better Auth config + Drizzle adapter
│   │   ├── server.ts                     getCurrentUserId server helper
│   │   └── client.ts                     Better Auth React client
│   ├── storage/
│   │   ├── r2.ts                         S3 client configured for R2 (env-driven)
│   │   └── put-object.ts                 helper: putObject({ userId, body, ... })
│   ├── jobs/
│   │   ├── boss.ts                       pg-boss singleton + start()
│   │   ├── worker.ts                     entry — runs forever, registers handlers
│   │   ├── noop.ts                       done-when handler
│   │   └── index.ts                      registerHandlers(boss)
│   ├── types/
│   │   ├── index.ts                      Cents, branded ids, ISODate
│   │   └── env.ts                        zod schema for env, parseEnv()
│   └── domain/                           empty placeholder
├── tests/
│   ├── helpers/db.ts                     resetTestDb + seedUserAndAccount
│   ├── unit/smoke.test.ts                Vitest smoke
│   ├── e2e/auth-and-upload.spec.ts       Playwright happy path
│   └── fixtures/                         empty
├── docker-compose.yml                    Postgres 16 + named volume; init creates conto + conto_test
├── scripts/
│   └── db-reset.ts                       drop + recreate + migrate + seed
├── .env.example                          All required keys with comments
├── drizzle.config.ts
├── next.config.mjs
├── tailwind.config.ts · postcss.config.mjs
├── tsconfig.json                         strict: true, paths: { "@/*": ["./*"] }
├── vitest.config.ts · playwright.config.ts
├── package.json
└── README.md                             Updated "Getting started"
```

### `package.json` scripts

```json
{
  "scripts": {
    "dev":           "next dev",
    "build":         "next build",
    "start":         "next start",
    "worker:dev":    "tsx watch lib/jobs/worker.ts",
    "worker:start":  "node --import tsx lib/jobs/worker.ts",
    "db:generate":   "drizzle-kit generate",
    "db:migrate":    "drizzle-kit migrate",
    "db:seed":       "tsx lib/db/seeds/index.ts",
    "db:reset":      "tsx scripts/db-reset.ts",
    "test":          "vitest run",
    "test:watch":    "vitest",
    "test:e2e":      "playwright test",
    "lint":          "next lint",
    "typecheck":     "tsc --noEmit"
  }
}
```

### Module dependency rules

```
app/              → lib/*, components/*
components/       → lib/types only
lib/db/           → drizzle, lib/types
lib/auth/         → lib/db, lib/types, better-auth
lib/storage/      → lib/types only
lib/jobs/         → lib/db, lib/storage, lib/types
lib/types/        → leaf (no internal deps)
lib/domain/       → lib/db, lib/types (empty in Phase 0)
tests/            → all of the above
```

### Dev workflow

```
1. cp .env.example .env       # fill DATABASE_URL, BETTER_AUTH_SECRET, R2_*
2. docker compose up -d       # Postgres on localhost:5432
3. npm install
4. npm run db:migrate
5. npm run db:seed
6. npm run dev                # web on :3000
   npm run worker:dev         # worker (separate terminal)
7. http://localhost:3000 → sign up → upload → see worker log
```

---

## 4. Subsystems

### 4.1 Database (`lib/db/`)

- **ORM:** Drizzle (per ADR-2). Single client in `lib/db/client.ts`; transactions via `db.transaction(async (tx) => ...)`.
- **Schema:** all `PLAN.md` §4 tables in one `schema.ts` at Phase 0. Includes Plan A deltas: `recurrence_groups`, `pay_cadences`, `expected_events`, `categories.is_deductible_candidate`, `categories.deduction_kind`, `transactions.receipt_object_key`, `transactions.receipt_uploaded_at`, `transactions.recurrence_group_id`, `users.cashflow_buffer_cents`, `payslips.cadence`. Plus Better Auth's tables (`session`, `account`, `verification`) generated via Better Auth's CLI.
- **Migrations:** `drizzle-kit generate` + `migrate`. Forward-only (per CLAUDE.md hard rules). Migrations also include RLS policies (see below).
- **RLS policies (per ADR-1):** every domain table has `enable row level security` and a per-user policy:
  ```sql
  alter table <t> enable row level security;
  create policy <t>_per_user on <t>
    using (user_id = current_setting('app.user_id')::uuid);
  ```
  The Drizzle client wraps each authenticated request in a transaction that runs `set local app.user_id = $1` before any query. Implemented via a small `withUser(userId, fn)` helper exported from `lib/db/client.ts` and used by `getCurrentUserId()`-aware code paths.
- **Seeds:** `lib/db/seeds/index.ts` runs all seeds. Phase 0 seeds: `seedAuSubcategories(db)` from ADR-9 (creates ~6 subcategories under appropriate parents with `is_deductible_candidate=true` and the corresponding `deduction_kind`).

### 4.2 Auth — Better Auth (`lib/auth/`)

- **Library:** Better Auth v1.x with `betterAuth({ database: drizzleAdapter(db, { provider: 'pg', schema }) })`.
- **Provider:** email + password only at Phase 0. OAuth (Google/GitHub) plugs in later via Better Auth's social providers.
- **Catch-all route:** `app/api/auth/[...all]/route.ts` mounts Better Auth's request handler. Handles sign-in, sign-up, sign-out, session, password-reset endpoints.
- **Server helper:** `getCurrentUserId()` in `lib/auth/server.ts` — reads session via Better Auth's `auth.api.getSession({ headers })`, returns `UserId` or throws `UnauthenticatedError`. Used by every authenticated route + server action + API route.
- **Client helper:** `lib/auth/client.ts` exports the Better Auth React client (`authClient.signIn.email`, `signUp.email`, `signOut`, `useSession`).
- **Session config:** 7-day session, sliding expiry (Better Auth default), secure cookies, `SameSite=Lax`. Cookie name uses Better Auth's default.
- **Schema:** Better Auth's CLI generates `session`, `account`, `verification` tables and extends `user`. Conto's existing planned `users.password_hash` is dropped; `display_name` becomes Better Auth's `name`. See §2 for the merged `users` shape.

### 4.3 Storage — R2 (`lib/storage/`)

- **Client:** `lib/storage/r2.ts` exports a single `S3Client` instance configured for R2:
  ```typescript
  export const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  ```
- **Helper:** `putObject({ userId, body, contentType, originalFilename })` returns `{ key }`. Object keys are `${userId}/${randomUuid}/${originalFilename}` per ADR-1's user-prefixing.
- **Phase 0 upload flow:** server-side multipart parse via `Request.formData()` + direct R2 PUT in the API route. Pre-signed URLs deferred to Phase 1 when statement files become larger.

### 4.4 Worker — pg-boss (`lib/jobs/`)

- **Library:** pg-boss v10 against the same Postgres instance (per ADR-2 — no extra infra).
- **Singleton:** `lib/jobs/boss.ts` exports a configured boss instance; `await boss.start()` initialises pg-boss's own schema (`pgboss.*` tables) on first run.
- **Handler registration:** `lib/jobs/index.ts` exports `registerHandlers(boss)`. Phase 0 ships one handler:
  ```typescript
  await boss.work('noop', async (job) => {
    console.log('[noop]', job.data);
  });
  ```
- **Entry:** `lib/jobs/worker.ts` runs forever:
  ```typescript
  const boss = await import('./boss').then(m => m.boss);
  await boss.start();
  await registerHandlers(boss);
  console.log('[worker] ready');
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => { await boss.stop({ wait: true }); process.exit(0); });
  }
  ```
- **Demoable flow:** `app/api/upload/route.ts` calls `boss.send('noop', { uploadedKey, userId, filename })` after a successful R2 PUT. Worker logs the payload.

### 4.5 Env management (`lib/types/env.ts`)

- Zod schema validates env at module load; fails fast with a readable error if anything is missing or malformed.
- `parseEnv()` is exported and cached. Modules that need env (`lib/db/client.ts`, `lib/auth/better-auth.ts`, `lib/storage/r2.ts`) call it at top-level.
- Required keys, with `.env.example` documenting each:
  - `DATABASE_URL` — Postgres connection string
  - `TEST_DATABASE_URL` — separate db for tests (defaults to `${DATABASE_URL}_test` if absent)
  - `BETTER_AUTH_SECRET` — 32+ chars, used to sign session cookies
  - `BETTER_AUTH_URL` — base URL the app runs at (e.g. `http://localhost:3000`)
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET`

---

## 5. UI surfaces and end-to-end flow

### 5.1 Pages

| Path | Type | Purpose |
|---|---|---|
| `/` | server | Authed → `/dashboard`; else → `/sign-in`. |
| `/sign-in` | client | Email + password form via `authClient.signIn.email`. On success → `/dashboard`. |
| `/sign-up` | client | Email + password + confirm form via `authClient.signUp.email`. On success → `/dashboard`. |
| `/dashboard` | server | Greeting (uses `name` or `email`) + nav + "Upload a file" link. |
| `/upload` | server with client form | Multipart form posting to `/api/upload`. Re-renders with the returned key on success. |

### 5.2 Layouts

- `app/layout.tsx` — Tailwind base, system font, no nav.
- `app/(authenticated)/layout.tsx` — checks `getCurrentUserId()`, redirects to `/sign-in` if no session, otherwise renders `<Nav />` + `{children}`.

### 5.3 Components

- `components/nav.tsx` — brand link, Dashboard / Upload links, sign-out button (calls `authClient.signOut`).
- `components/ui/*` — shadcn primitives. Phase 0 installs: `button`, `input`, `label`, `card`, `form`. Future phases add more.

### 5.4 End-to-end happy path (the Phase 0 demo)

```
1. User visits /sign-up.
2. Submits email + password.
3. Better Auth creates user row, account row (hashed credential), session row, sets cookie.
4. Redirect to /dashboard.
5. User clicks "Upload a file" → /upload.
6. User picks a file (e.g. a small text file), submits multipart.
7. /api/upload runs:
   a. getCurrentUserId() — throws if no session.
   b. parse multipart via Request.formData().
   c. putObject({ userId, body, contentType, originalFilename }) → { key }.
   d. boss.send('noop', { uploadedKey: key, userId, filename: originalFilename }).
   e. Returns { ok: true, key }.
8. /upload page re-renders showing "Uploaded — key: <key>".
9. Worker process logs "[noop] { uploadedKey, userId, filename }".
```

This is the verifiable Phase 0 done-when (PLAN.md §8).

### 5.5 Error handling

| Failure | Detection | Behaviour |
|---|---|---|
| Auth failure | Better Auth typed error (`INVALID_EMAIL_OR_PASSWORD`, `USER_ALREADY_EXISTS`, etc.) | UI shows inline form error via shadcn's `Form` field-level message. |
| No session on `/api/upload` | `getCurrentUserId()` throws | Return 401; client redirects to `/sign-in`. |
| Multipart parse error | `Request.formData()` throws | Return 400 with reason. |
| R2 PUT fails | AWS SDK throws | Return 502; **boss.send is never called**, so no orphan job. R2 PUT happens before send. |
| Job enqueue fails | `boss.send` throws after R2 PUT succeeded | Return 502 + log; the file IS in R2 but the job didn't fire — surface to user. Out of scope to auto-recover at Phase 0. |
| Worker handler fails | pg-boss retry (3 attempts, exponential backoff) | Default. Phase 0 noop never fails; this is rehearsal. |
| Env validation fails | `parseEnv()` throws on import | Process exits with readable message. Same for worker. |

---

## 6. Testing

### 6.1 Test database

- Same Docker Postgres instance, separate database `conto_test`. `docker-compose.yml`'s init script creates both `conto` and `conto_test` databases on first boot.
- `TEST_DATABASE_URL` env var points at `conto_test`. Main app uses `DATABASE_URL`. Both required in `.env.example`.
- Tests run sequentially at Phase 0 (Vitest `pool: 'forks', singleFork: true` for integration project; default for unit). Revisit if test suite grows.

### 6.2 Vitest

- **Unit (`tests/unit/smoke.test.ts`):** trivial `expect(parseEnv()).toBeDefined()` — validates env-loading and Vitest config wiring.
- **Helpers (`tests/helpers/db.ts`):**
  - `resetTestDb()` — truncates every domain table in dependency order, then runs seeds.
  - `seedUserAndAccount(db, opts?)` — creates a user via Better Auth's server API + an `accounts` row, returns `{ userId, accountId }`. Used by future integration tests.
- **Vitest config:** two projects in `vitest.config.ts`:
  - `unit` — no DB, no env beyond defaults.
  - `integration` — uses `TEST_DATABASE_URL`, sets `app.user_id` per test as needed, uses the helpers above.

### 6.3 Playwright

- **`tests/e2e/auth-and-upload.spec.ts`** covers the happy path: visit `/sign-up`, sign up, navigate to `/upload`, upload `tests/fixtures/hello.txt`, assert the success message.
- **`playwright.config.ts`** uses the `webServer` config to start `npm run dev` and `npm run worker:dev` before tests; tears them down after. Uses `TEST_DATABASE_URL` so e2e doesn't pollute dev data.
- One test at Phase 0; future phases add coverage.

### 6.4 Phase 0 verification

A reviewer runs `npm test` and `npm run test:e2e` against a fresh checkout. Both pass. The Playwright test exercises sign-up + upload + R2 PUT + worker job. CLAUDE.md hard rules respected (cents are bigint, every domain table has user_id with RLS, migrations forward-only).

---

## 7. README updates

Replace the placeholder "Getting started — TBD — Phase 0" section with:

````markdown
## Getting started

Prerequisites: Node 20+, Docker, a Cloudflare R2 bucket.

```bash
cp .env.example .env
# fill in DATABASE_URL, BETTER_AUTH_SECRET, R2_*

docker compose up -d              # Postgres on localhost:5432
npm install
npm run db:migrate
npm run db:seed

# In separate terminals:
npm run dev                       # web on :3000
npm run worker:dev                # worker process
```

Visit http://localhost:3000 → sign up → upload a file → see the worker log the no-op job.

### Tests

```bash
npm test                          # Vitest unit
npm run test:e2e                  # Playwright (starts dev + worker automatically)
```
````

Also bump the "Status" line from "Early development" to "Phase 0 — foundation".

---

## 8. Open questions

None blocking implementation. Deferred:

- **Deploy pipeline.** Vercel for web + Fly.io/Railway for worker per PLAN.md §3. Stand up when first deploy is needed (likely end of Phase 1).
- **GitHub Actions CI.** Add when team grows beyond one developer or when external contributors are expected.
- **Pre-signed R2 URLs.** Revisit in Phase 1 when statement files become larger.
- **OAuth providers.** Add via Better Auth's social provider config when needed.
- **Multi-tenancy posture for partner/family data.** Already addressed by ADR-1's RLS-on-everything; user-facing UX is a Phase 7 concern.
- **PLAN.md §11 questions still open:** mobile-first PWA vs desktop-first (drives Phase 1 layout); hosting cost tolerance (decided implicitly by deferring deploy); tax depth (Phase 5+ concern).

---

## 9. Plan-level deliverables

The Phase 0 implementation plan must include, beyond the code:

1. **`PLAN.md` §4 update** — replace `users` table definition with the merged Better-Auth-aware shape from §2.
2. **ADR-2 supersession or update** — currently says "Lucia or Auth.js"; commits to **Better Auth**. Either supersede ADR-2 with a new ADR-12 ("Better Auth as the auth library") or amend ADR-2 in place. Convention in this repo (per CLAUDE.md) is "supersede, don't edit," so a new ADR-12 is the cleaner path.
3. **`PLAN.md` §2 entry for the new ADR-12** if that path is taken.
4. **`PLAN.md` Changelog v0.3 (2026-05-04)** entry naming the Phase 0 implementation start, the Better Auth commitment, and the `users` schema reconciliation.

---

## 10. Changelog

- **v0.1 (2026-05-04)** — Initial draft. Covers single-package Next.js scaffold, Better Auth with Drizzle adapter, real R2 from day one, pg-boss worker as a separate process, Vitest + Playwright at Phase 0, AU subcategory seed, README updates. Resolves Lucia-vs-Auth.js by selecting Better Auth (Lucia v3 in maintenance mode). Identifies the `users` table reconciliation needed in PLAN.md §4.
