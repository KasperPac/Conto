# Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the Conto repo from doc-only to a runnable web + worker application where a user can sign up, upload a file to Cloudflare R2, and see a no-op pg-boss job log against it.

**Architecture:** Single Next.js (App Router) package with `app/`, `components/`, `lib/`, `tests/`. Postgres via Docker (dev) and managed later (prod). Drizzle ORM. Better Auth for email + password sessions. Cloudflare R2 for object storage (real, not mocked). pg-boss worker as a separate process from the same package. Vitest + Playwright for tests. AU subcategory seed runs automatically. See spec §3 for the full file structure.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Drizzle ORM + drizzle-kit, Postgres 16, Better Auth v1, AWS SDK v3 S3 client (for R2), pg-boss v10, Tailwind + shadcn/ui, Vitest, Playwright, zod (env validation).

**Source spec:** `Docs/superpowers/specs/2026-05-04-phase-0-foundation-design.md`. Read it for the why; this plan is the how.

---

### Task 1: Next.js scaffold with TypeScript strict, Tailwind, shadcn/ui primitives

**Goal:** Bootstrap the Next.js app so `npm run dev` boots and `npm run build` succeeds.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `components/ui/button.tsx`
- Create: `components/ui/input.tsx`
- Create: `components/ui/label.tsx`
- Create: `components/ui/card.tsx`
- Create: `components/ui/form.tsx`
- Create: `lib/utils.ts` (shadcn `cn` helper)
- Create: `components.json` (shadcn config)

**Acceptance Criteria:**
- [ ] `npm install` completes without peer-dep errors.
- [ ] `npm run dev` serves `http://localhost:3000` showing a placeholder.
- [ ] `npm run build` and `npm run typecheck` both succeed.
- [ ] `tsconfig.json` has `"strict": true` and a `"@/*"` path alias.
- [ ] Tailwind classes work in `app/page.tsx`.
- [ ] shadcn `Button` renders correctly when imported.

**Verify:** `npm run typecheck && npm run build` exits 0.

**Steps:**

- [ ] **Step 1: Initialise Next.js**

```bash
npx create-next-app@15 . --ts --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm --no-turbopack
```

Decline the `src/` directory option. Answer "Yes" to App Router. Decline Turbopack (we want Next's stable bundler at Phase 0).

- [ ] **Step 2: Tighten `tsconfig.json`**

Edit `tsconfig.json` to ensure these compiler options:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowJs": false,
    "incremental": true,
    "jsx": "preserve",
    "isolatedModules": true,
    "resolveJsonModule": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Install shadcn/ui CLI and primitives**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label card form
```

Accept defaults. This creates `components/ui/*`, `lib/utils.ts`, and `components.json`.

- [ ] **Step 4: Add scripts to `package.json`**

Edit the `"scripts"` block in `package.json` to be:

```json
"scripts": {
  "dev":           "next dev",
  "build":         "next build",
  "start":         "next start",
  "lint":          "next lint",
  "typecheck":     "tsc --noEmit"
}
```

(Other scripts — `worker:dev`, `db:*`, `test`, `test:e2e` — are added in later tasks.)

- [ ] **Step 5: Replace `app/page.tsx` with a placeholder**

```tsx
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Conto</h1>
        <p className="text-zinc-600 text-sm">Phase 0 — bootstrap.</p>
        <Button>Hello</Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verify dev + build + typecheck**

```bash
npm run typecheck
npm run build
```
Expected: both succeed without errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.mjs app/ components/ lib/utils.ts components.json next-env.d.ts
git commit -m "phase0/scaffold: Next.js 15 + TS strict + Tailwind + shadcn primitives"
```

---

### Task 2: Env validation with zod + .env.example

**Goal:** Fail fast at startup if required environment variables are missing or malformed.

**Files:**
- Create: `lib/types/env.ts`
- Create: `.env.example`
- Test: `tests/unit/env.test.ts`

**Acceptance Criteria:**
- [ ] `parseEnv()` returns a typed object when all required vars are present.
- [ ] `parseEnv()` throws a readable error naming the missing key when one is absent.
- [ ] `.env.example` documents every required key with a comment.
- [ ] `lib/types/env.ts` exports a typed `Env` interface inferred from the zod schema.
- [ ] Result is cached after first call (don't re-parse `process.env` on every call).

**Verify:** `npm test -- tests/unit/env.test.ts` (after Vitest is configured in Task 11).

For now (before Vitest), verify by importing in `app/page.tsx` temporarily and checking the dev server boots without error when `.env` has all keys, and exits with a clear error when a key is removed. Remove the test import once verified.

**Steps:**

- [ ] **Step 1: Install zod**

```bash
npm install zod
```

- [ ] **Step 2: Write `lib/types/env.ts`**

```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function parseEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCheck .env against .env.example.`);
  }
  cached = result.data;
  return cached;
}

export function resetEnvCacheForTests(): void {
  cached = null;
}
```

- [ ] **Step 3: Write `.env.example`**

```bash
# Postgres connection string for the dev database.
# Format: postgres://user:password@host:port/database
DATABASE_URL=postgres://conto:conto@localhost:5432/conto

# Postgres connection string for the test database.
# Optional — defaults to ${DATABASE_URL} with the database name suffixed _test if absent in code that needs it.
TEST_DATABASE_URL=postgres://conto:conto@localhost:5432/conto_test

# Better Auth — at least 32 random characters. Generate with: openssl rand -base64 48
BETTER_AUTH_SECRET=replace-me-with-a-32-character-or-longer-random-string

# Base URL the app runs at — used for cookie domain + redirects.
BETTER_AUTH_URL=http://localhost:3000

# Cloudflare R2 — create a bucket + API token at https://dash.cloudflare.com/?to=/:account/r2.
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=conto-dev
```

- [ ] **Step 4: Write the unit test (will run in Task 11)**

```typescript
// tests/unit/env.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEnv, resetEnvCacheForTests } from '@/lib/types/env';

describe('parseEnv', () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    process.env = { ...ORIGINAL };
    resetEnvCacheForTests();
  });

  it('returns parsed env when all required keys present', () => {
    process.env.DATABASE_URL = 'postgres://x:y@localhost:5432/z';
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.R2_ACCOUNT_ID = 'a';
    process.env.R2_ACCESS_KEY_ID = 'a';
    process.env.R2_SECRET_ACCESS_KEY = 'a';
    process.env.R2_BUCKET = 'b';
    const env = parseEnv();
    expect(env.DATABASE_URL).toBe('postgres://x:y@localhost:5432/z');
  });

  it('throws a readable error naming the missing key', () => {
    delete process.env.DATABASE_URL;
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    expect(() => parseEnv()).toThrowError(/DATABASE_URL/);
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add lib/types/env.ts .env.example tests/unit/env.test.ts package.json package-lock.json
git commit -m "phase0/env: zod-validated env loader + .env.example"
```

---

### Task 3: Docker compose for Postgres (dev + test databases)

**Goal:** A single `docker compose up -d` brings up Postgres with both `conto` and `conto_test` databases ready.

**Files:**
- Create: `docker-compose.yml`
- Create: `scripts/db-init.sql`

**Acceptance Criteria:**
- [ ] `docker compose up -d` starts a Postgres 16 container.
- [ ] Both `conto` and `conto_test` databases exist and are owned by user `conto`.
- [ ] Postgres listens on `localhost:5432`.
- [ ] Container persists data via a named volume (so a restart doesn't wipe everything).
- [ ] `docker compose down -v` cleanly removes everything including the volume.

**Verify:**
```bash
docker compose up -d
sleep 3
docker compose exec postgres psql -U conto -c "\\l" | grep -E "conto( |_test)"
```
Expected: both `conto` and `conto_test` listed.

**Steps:**

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: conto-postgres
    environment:
      POSTGRES_USER: conto
      POSTGRES_PASSWORD: conto
      POSTGRES_DB: conto
    ports:
      - "5432:5432"
    volumes:
      - conto_pg_data:/var/lib/postgresql/data
      - ./scripts/db-init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U conto -d conto"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  conto_pg_data:
```

- [ ] **Step 2: Write `scripts/db-init.sql`**

```sql
-- Postgres entrypoint: runs only on first container boot (when the data volume is empty).
-- Creates the test database alongside the default one.
create database conto_test;
grant all privileges on database conto_test to conto;
```

- [ ] **Step 3: Bring up + verify**

```bash
docker compose up -d
docker compose exec postgres pg_isready -U conto
docker compose exec postgres psql -U conto -c "\l"
```
Expected: `pg_isready` returns `accepting connections`; `\l` lists both `conto` and `conto_test`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml scripts/db-init.sql
git commit -m "phase0/db: docker compose with conto + conto_test databases"
```

---

### Task 4: Drizzle scaffold + full schema + initial migration with RLS

**Goal:** All `PLAN.md` §4 tables (including Plan A deltas) plus Better Auth's tables exist in `lib/db/schema.ts` and the initial migration applies cleanly to a fresh db. Every domain table has RLS enabled.

**Files:**
- Create: `drizzle.config.ts`
- Create: `lib/db/client.ts`
- Create: `lib/db/schema.ts`
- Create: `lib/db/migrations/0000_init.sql` (drizzle-generated, with manual RLS additions)
- Create: `lib/db/migrations/meta/_journal.json` (drizzle-generated)
- Test: `tests/integration/db/schema.test.ts`

**Acceptance Criteria:**
- [ ] `npm run db:migrate` against a fresh `conto_test` db applies cleanly with no errors.
- [ ] Every `PLAN.md` §4 table exists in `schema.ts` with the Plan A deltas:
  - `categories.is_deductible_candidate`, `categories.deduction_kind`
  - `transactions.receipt_object_key`, `transactions.receipt_uploaded_at`, `transactions.recurrence_group_id`
  - `users.cashflow_buffer_cents`
  - `payslips.cadence`
  - new tables: `recurrence_groups`, `pay_cadences`, `expected_events`
- [ ] `users` table reflects the Better Auth merger (no `password_hash`; has `email_verified`, `name`, `image`, `updated_at`).
- [ ] Better Auth tables (`session`, `account`, `verification`) exist in the schema.
- [ ] RLS is enabled on every domain table (`accounts`, `statements`, `transactions`, `transaction_links`, `categories`, `merchants`, `rules`, `payslips`, `subscriptions`, `goals`, `budgets`, `recurrence_groups`, `pay_cadences`, `expected_events`) with a `current_setting('app.user_id')::uuid` policy. (Better Auth's tables and `users` itself do NOT need RLS — Better Auth handles its own scoping.)
- [ ] The partial index `expected_events_pending_idx` exists.
- [ ] The unique index on `transactions(account_id, posted_date, amount_cents, description_raw)` exists (per `PLAN.md` §4).
- [ ] `withUser(userId, fn)` helper is exported from `lib/db/client.ts` and runs `set local app.user_id = $1` before invoking `fn`.

**Verify:**
```bash
npm run db:migrate
npm test -- tests/integration/db/schema.test.ts
```
Both succeed.

**Steps:**

- [ ] **Step 1: Install Drizzle + Postgres driver**

```bash
npm install drizzle-orm pg
npm install --save-dev drizzle-kit @types/pg
```

- [ ] **Step 2: Add db scripts to `package.json`**

Add to `"scripts"`:
```json
"db:generate":   "drizzle-kit generate",
"db:migrate":    "drizzle-kit migrate",
```

- [ ] **Step 3: Write `drizzle.config.ts`**

```typescript
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://conto:conto@localhost:5432/conto',
  },
  verbose: true,
  strict: true,
});
```

(`dotenv/config` is imported so `DATABASE_URL` from `.env` is read by drizzle-kit at CLI invocation time. Install it: `npm install dotenv`.)

- [ ] **Step 4: Write `lib/db/schema.ts`**

This is large. Code below is complete.

```typescript
import {
  pgTable, uuid, text, boolean, bigint, integer, numeric, date, timestamp, jsonb,
  uniqueIndex, index,
} from 'drizzle-orm/pg-core';

// =====================================================
// Identity (Better Auth tables + Conto users extensions)
// =====================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  cashflowBufferCents: bigint('cashflow_buffer_cents', { mode: 'bigint' }).notNull().default(50000n),
});

export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountsAuth = pgTable('account', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// =====================================================
// Conto domain tables (PLAN.md §4)
// =====================================================

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  institution: text('institution').notNull(),
  type: text('type').notNull(),
  currency: text('currency').notNull().default('AUD'),
  openingBalanceCents: bigint('opening_balance_cents', { mode: 'bigint' }).notNull(),
  openingBalanceDate: date('opening_balance_date').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const statements = pgTable('statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  sourceFilename: text('source_filename').notNull(),
  sourceObjectKey: text('source_object_key').notNull(),
  format: text('format').notNull(),
  parserTemplate: text('parser_template'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  status: text('status').notNull(),
  parseError: text('parse_error'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  parsedAt: timestamp('parsed_at', { withTimezone: true }),
});

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  canonicalName: text('canonical_name').notNull(),
  defaultCategoryId: uuid('default_category_id'),
  patterns: jsonb('patterns'),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  icon: text('icon'),
  isIncome: boolean('is_income').notNull().default(false),
  isEssential: boolean('is_essential').notNull().default(false),
  isDiscretionary: boolean('is_discretionary').notNull().default(false),
  isDeductibleCandidate: boolean('is_deductible_candidate').notNull().default(false),
  deductionKind: text('deduction_kind'),
});

export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  pattern: text('pattern').notNull(),
  matchField: text('match_field').notNull(),
  categoryId: uuid('category_id').references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => categories.id),
  priority: integer('priority').notNull().default(0),
  source: text('source').notNull(),
  createdFromTransactionId: uuid('created_from_transaction_id'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const recurrenceGroups = pgTable('recurrence_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  merchantId: uuid('merchant_id').references(() => merchants.id),
  descriptionPattern: text('description_pattern').notNull(),
  cadence: text('cadence').notNull(),
  medianAmountCents: bigint('median_amount_cents', { mode: 'bigint' }).notNull(),
  amountStddevCents: bigint('amount_stddev_cents', { mode: 'bigint' }).notNull(),
  medianIntervalDays: integer('median_interval_days').notNull(),
  lastSeenDate: date('last_seen_date').notNull(),
  nextExpectedDate: date('next_expected_date').notNull(),
  status: text('status').notNull(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  statementId: uuid('statement_id').references(() => statements.id),
  postedDate: date('posted_date').notNull(),
  descriptionRaw: text('description_raw').notNull(),
  descriptionClean: text('description_clean'),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  balanceAfterCents: bigint('balance_after_cents', { mode: 'bigint' }),
  categoryId: uuid('category_id').references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => categories.id),
  merchantId: uuid('merchant_id').references(() => merchants.id),
  classificationSource: text('classification_source').notNull(),
  classificationRuleId: uuid('classification_rule_id').references(() => rules.id),
  isExcludedFromSpending: boolean('is_excluded_from_spending').notNull().default(false),
  notes: text('notes'),
  receiptObjectKey: text('receipt_object_key'),
  receiptUploadedAt: timestamp('receipt_uploaded_at', { withTimezone: true }),
  recurrenceGroupId: uuid('recurrence_group_id').references(() => recurrenceGroups.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dedupeIdx: uniqueIndex('transactions_dedupe_idx').on(t.accountId, t.postedDate, t.amountCents, t.descriptionRaw),
}));

export const payslips = pgTable('payslips', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  employer: text('employer').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  payDate: date('pay_date').notNull(),
  grossCents: bigint('gross_cents', { mode: 'bigint' }).notNull(),
  taxWithheldCents: bigint('tax_withheld_cents', { mode: 'bigint' }).notNull(),
  superCents: bigint('super_cents', { mode: 'bigint' }).notNull(),
  salarySacrificeCents: bigint('salary_sacrifice_cents', { mode: 'bigint' }).notNull().default(0n),
  preTaxDeductionsCents: bigint('pre_tax_deductions_cents', { mode: 'bigint' }).notNull().default(0n),
  postTaxDeductionsCents: bigint('post_tax_deductions_cents', { mode: 'bigint' }).notNull().default(0n),
  netCents: bigint('net_cents', { mode: 'bigint' }).notNull(),
  sourceObjectKey: text('source_object_key'),
  source: text('source').notNull(),
  cadence: text('cadence'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactionLinks = pgTable('transaction_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  linkType: text('link_type').notNull(),
  fromTransactionId: uuid('from_transaction_id').notNull().references(() => transactions.id),
  toTransactionId: uuid('to_transaction_id').references(() => transactions.id),
  payslipId: uuid('payslip_id').references(() => payslips.id),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  merchantId: uuid('merchant_id').references(() => merchants.id),
  displayName: text('display_name').notNull(),
  cadence: text('cadence').notNull(),
  expectedAmountCents: bigint('expected_amount_cents', { mode: 'bigint' }).notNull(),
  lastChargeDate: date('last_charge_date'),
  nextExpectedDate: date('next_expected_date'),
  status: text('status').notNull(),
  notes: text('notes'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
});

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  targetAmountCents: bigint('target_amount_cents', { mode: 'bigint' }).notNull(),
  targetDate: date('target_date'),
  currentAmountCents: bigint('current_amount_cents', { mode: 'bigint' }).notNull().default(0n),
  linkedAccountId: uuid('linked_account_id').references(() => accounts.id),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  period: text('period').notNull(),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
});

export const payCadences = pgTable('pay_cadences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  employer: text('employer').notNull(),
  cadence: text('cadence').notNull(),
  expectedNetCents: bigint('expected_net_cents', { mode: 'bigint' }).notNull(),
  nextPayDate: date('next_pay_date').notNull(),
  source: text('source').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const expectedEvents = pgTable('expected_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  source: text('source').notNull(),
  sourceId: uuid('source_id'),
  expectedDate: date('expected_date').notNull(),
  expectedAmountCents: bigint('expected_amount_cents', { mode: 'bigint' }).notNull(),
  expectedAmountLowCents: bigint('expected_amount_low_cents', { mode: 'bigint' }).notNull(),
  expectedAmountHighCents: bigint('expected_amount_high_cents', { mode: 'bigint' }).notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('pending'),
  matchedTransactionId: uuid('matched_transaction_id').references(() => transactions.id),
  snoozedUntil: date('snoozed_until'),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  userNote: text('user_note'),
}, (t) => ({
  pendingByDateIdx: index('expected_events_pending_idx').on(t.userId, t.expectedDate),
}));
```

(Note: drizzle-kit's `index().where(...)` partial-index syntax has been intermittent. If the partial-index clause isn't generated by drizzle-kit cleanly, edit the migration SQL directly to read `where status = 'pending'`.)

- [ ] **Step 5: Write `lib/db/client.ts`**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import { parseEnv } from '@/lib/types/env';

const env = parseEnv();
const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export type Database = typeof db;

/**
 * Run `fn` inside a transaction with `app.user_id` set, so RLS policies match.
 * Use this for every authenticated DB operation.
 */
export async function withUser<T>(userId: string, fn: (tx: Database) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`set local app.user_id = ${userId}`);
    return await fn(tx as unknown as Database);
  });
}
```

- [ ] **Step 6: Generate the initial migration**

```bash
npm run db:generate -- --name init
```

This creates `lib/db/migrations/0000_init.sql` and `lib/db/migrations/meta/_journal.json`.

- [ ] **Step 7: Manually append RLS policies to the migration**

Open the generated `lib/db/migrations/0000_init.sql` and APPEND the following at the end:

```sql
-- RLS: every domain table is scoped by app.user_id. Set via withUser() in app code.
-- Bypass: connect as a superuser when running migrations / seeds. App code never uses superuser.

alter table accounts enable row level security;
create policy accounts_per_user on accounts using (user_id = current_setting('app.user_id', true)::uuid);

alter table statements enable row level security;
create policy statements_per_user on statements using (user_id = current_setting('app.user_id', true)::uuid);

alter table transactions enable row level security;
create policy transactions_per_user on transactions using (user_id = current_setting('app.user_id', true)::uuid);

alter table transaction_links enable row level security;
create policy transaction_links_per_user on transaction_links using (user_id = current_setting('app.user_id', true)::uuid);

alter table merchants enable row level security;
create policy merchants_per_user on merchants using (user_id is null or user_id = current_setting('app.user_id', true)::uuid);

alter table categories enable row level security;
create policy categories_per_user on categories using (user_id is null or user_id = current_setting('app.user_id', true)::uuid);

alter table rules enable row level security;
create policy rules_per_user on rules using (user_id = current_setting('app.user_id', true)::uuid);

alter table payslips enable row level security;
create policy payslips_per_user on payslips using (user_id = current_setting('app.user_id', true)::uuid);

alter table subscriptions enable row level security;
create policy subscriptions_per_user on subscriptions using (user_id = current_setting('app.user_id', true)::uuid);

alter table goals enable row level security;
create policy goals_per_user on goals using (user_id = current_setting('app.user_id', true)::uuid);

alter table budgets enable row level security;
create policy budgets_per_user on budgets using (user_id = current_setting('app.user_id', true)::uuid);

alter table recurrence_groups enable row level security;
create policy recurrence_groups_per_user on recurrence_groups using (user_id = current_setting('app.user_id', true)::uuid);

alter table pay_cadences enable row level security;
create policy pay_cadences_per_user on pay_cadences using (user_id = current_setting('app.user_id', true)::uuid);

alter table expected_events enable row level security;
create policy expected_events_per_user on expected_events using (user_id = current_setting('app.user_id', true)::uuid);

-- Partial index for the calendar / liquidity-preview hot path.
drop index if exists expected_events_pending_idx;
create index expected_events_pending_idx on expected_events (user_id, expected_date) where status = 'pending';
```

Note: `current_setting('app.user_id', true)` — the `true` argument makes it return NULL instead of erroring when unset. Migrations and seeds are run with the app user OR a superuser; queries from the app always set it via `withUser`.

- [ ] **Step 8: Apply the migration**

```bash
npm run db:migrate
```
Expected: applies cleanly.

- [ ] **Step 9: Write the schema test**

`tests/integration/db/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

describe('schema', () => {
  const pool = new Pool({ connectionString: url });

  it('every required table exists', async () => {
    const required = [
      'users','session','account','verification',
      'accounts','statements','transactions','transaction_links','merchants','categories','rules','payslips','subscriptions','goals','budgets',
      'recurrence_groups','pay_cadences','expected_events',
    ];
    const { rows } = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'"
    );
    const present = new Set(rows.map(r => r.table_name));
    for (const t of required) {
      expect(present.has(t), `expected table ${t}`).toBe(true);
    }
  });

  it('plan A schema deltas are present', async () => {
    const checks: Array<[string, string]> = [
      ['categories', 'is_deductible_candidate'],
      ['categories', 'deduction_kind'],
      ['transactions', 'receipt_object_key'],
      ['transactions', 'receipt_uploaded_at'],
      ['transactions', 'recurrence_group_id'],
      ['users', 'cashflow_buffer_cents'],
      ['payslips', 'cadence'],
    ];
    for (const [table, column] of checks) {
      const { rows } = await pool.query(
        "select 1 from information_schema.columns where table_name = $1 and column_name = $2",
        [table, column],
      );
      expect(rows.length, `expected ${table}.${column}`).toBe(1);
    }
  });

  it('users does not have password_hash (Better Auth manages credentials separately)', async () => {
    const { rows } = await pool.query(
      "select 1 from information_schema.columns where table_name = 'users' and column_name = 'password_hash'"
    );
    expect(rows.length).toBe(0);
  });

  it('RLS is enabled on domain tables', async () => {
    const tables = ['accounts','transactions','recurrence_groups','expected_events'];
    const { rows } = await pool.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = any($1)",
      [tables],
    );
    for (const r of rows) {
      expect(r.rowsecurity, `RLS expected on ${r.tablename}`).toBe(true);
    }
  });

  it('partial index expected_events_pending_idx exists', async () => {
    const { rows } = await pool.query(
      "select 1 from pg_indexes where indexname = 'expected_events_pending_idx'"
    );
    expect(rows.length).toBe(1);
  });
});
```

(This test will be runnable once Vitest is configured in Task 11. For Task 4 verification, run the SQL queries directly via `docker compose exec postgres psql -U conto -d conto_test -c "..."`.)

- [ ] **Step 10: Commit**

```bash
git add drizzle.config.ts lib/db/ tests/integration/db/schema.test.ts package.json package-lock.json
git commit -m "phase0/db: drizzle schema (PLAN.md §4 + Better Auth) + initial migration with RLS"
```

---

### Task 5: AU subcategory seed + db:seed script

**Goal:** Running `npm run db:seed` populates the AU deductible subcategory taxonomy from ADR-9. Idempotent.

**Files:**
- Create: `lib/db/seeds/au-subcategories.ts`
- Create: `lib/db/seeds/index.ts`
- Test: `tests/integration/db/seed.test.ts`

**Acceptance Criteria:**
- [ ] After `npm run db:seed`, the categories table contains at least one row for each documented `deduction_kind`: `wfh`, `donation`, `work_tools`, `motor_vehicle`, `professional_sub`.
- [ ] All seeded subcategories have `is_deductible_candidate = true` and `user_id = null` (system categories).
- [ ] Running `npm run db:seed` twice produces the same row count (idempotency).

**Verify:**
```bash
npm run db:seed
docker compose exec postgres psql -U conto -d conto -c "select count(*), deduction_kind from categories where is_deductible_candidate = true group by deduction_kind"
```
Expected: 5 distinct `deduction_kind` values, each with count ≥ 1.

**Steps:**

- [ ] **Step 1: Write `lib/db/seeds/au-subcategories.ts`**

```typescript
import type { Database } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

interface SubcategorySeed {
  name: string;
  deductionKind: 'wfh' | 'donation' | 'work_tools' | 'motor_vehicle' | 'professional_sub';
}

const AU_SUBCATEGORIES: SubcategorySeed[] = [
  { name: 'WFH — utilities (electricity portion)',     deductionKind: 'wfh' },
  { name: 'WFH — internet (work portion)',             deductionKind: 'wfh' },
  { name: 'Donations — DGR-registered',                deductionKind: 'donation' },
  { name: 'Work tools & equipment',                    deductionKind: 'work_tools' },
  { name: 'Motor vehicle — work travel',               deductionKind: 'motor_vehicle' },
  { name: 'Professional subscriptions / memberships',  deductionKind: 'professional_sub' },
];

export async function seedAuSubcategories(db: Database): Promise<void> {
  for (const sub of AU_SUBCATEGORIES) {
    await db.execute(sql`
      insert into categories (name, deduction_kind, is_deductible_candidate, is_essential, is_discretionary, is_income)
      select ${sub.name}, ${sub.deductionKind}, true, false, true, false
      where not exists (
        select 1 from categories
        where name = ${sub.name}
          and deduction_kind = ${sub.deductionKind}
          and user_id is null
      )
    `);
  }
}
```

- [ ] **Step 2: Write `lib/db/seeds/index.ts`**

```typescript
import { db } from '@/lib/db/client';
import { seedAuSubcategories } from './au-subcategories';

async function main(): Promise<void> {
  await seedAuSubcategories(db);
  console.log('[seed] AU subcategories seeded.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Add seed scripts to `package.json`**

Append to `"scripts"`:
```json
"db:seed":  "tsx lib/db/seeds/index.ts",
"db:reset": "tsx scripts/db-reset.ts"
```

Install `tsx`:
```bash
npm install --save-dev tsx
```

(`db:reset` script is added in a later task if needed; placeholder for now — create `scripts/db-reset.ts` with a one-liner: `console.log('Use docker compose down -v && docker compose up -d && npm run db:migrate && npm run db:seed')`.)

- [ ] **Step 4: Run + verify**

```bash
npm run db:seed
docker compose exec postgres psql -U conto -d conto -c "select count(*), deduction_kind from categories where is_deductible_candidate = true group by deduction_kind order by deduction_kind"
```
Expected: 5 rows, one per `deduction_kind`, counts ≥ 1.

- [ ] **Step 5: Run again (idempotency check)**

```bash
npm run db:seed
docker compose exec postgres psql -U conto -d conto -c "select count(*) from categories where is_deductible_candidate = true"
```
Expected: same count as before.

- [ ] **Step 6: Write the integration test**

`tests/integration/db/seed.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { seedAuSubcategories } from '@/lib/db/seeds/au-subcategories';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

describe('seedAuSubcategories', () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  beforeEach(async () => {
    await db.execute(sql`truncate table categories restart identity cascade`);
  });

  it('seeds at least one subcategory for each documented deduction_kind', async () => {
    await seedAuSubcategories(db);
    const kinds = ['wfh','donation','work_tools','motor_vehicle','professional_sub'];
    for (const k of kinds) {
      const { rows } = await pool.query(
        "select 1 from categories where deduction_kind = $1 and is_deductible_candidate = true",
        [k]
      );
      expect(rows.length, `expected at least one subcategory for ${k}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('is idempotent', async () => {
    await seedAuSubcategories(db);
    const { rows: before } = await pool.query("select count(*)::int as c from categories");
    await seedAuSubcategories(db);
    const { rows: after } = await pool.query("select count(*)::int as c from categories");
    expect(after[0].c).toBe(before[0].c);
  });
});
```

- [ ] **Step 7: Commit**

```bash
git add lib/db/seeds/ scripts/db-reset.ts tests/integration/db/seed.test.ts package.json package-lock.json
git commit -m "phase0/seeds: AU deductible subcategory taxonomy + idempotent seeder"
```

---

### Task 6: Better Auth server config + catch-all route + getCurrentUserId

**Goal:** Better Auth wired to Drizzle + Postgres. Email + password sign-up / sign-in / sign-out work via the catch-all route. Server-side `getCurrentUserId()` helper available.

**Files:**
- Create: `lib/auth/better-auth.ts`
- Create: `lib/auth/server.ts`
- Create: `app/api/auth/[...all]/route.ts`
- Test: `tests/integration/auth/sign-up.test.ts`

**Acceptance Criteria:**
- [ ] `POST /api/auth/sign-up/email` with `{ email, password }` creates a user + account + session and returns a session cookie.
- [ ] `POST /api/auth/sign-in/email` with valid credentials returns a session cookie.
- [ ] `POST /api/auth/sign-out` invalidates the session.
- [ ] `getCurrentUserId()` returns the authenticated user id when called from a request with a valid session cookie, throws `UnauthenticatedError` otherwise.
- [ ] Better Auth uses the existing `users` / `session` / `account` / `verification` tables from Task 4's schema.

**Verify:** `npm test -- tests/integration/auth/sign-up.test.ts` passes.

**Steps:**

- [ ] **Step 1: Install Better Auth**

```bash
npm install better-auth
```

- [ ] **Step 2: Write `lib/auth/better-auth.ts`**

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { parseEnv } from '@/lib/types/env';

const env = parseEnv();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accountsAuth,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.BETTER_AUTH_URL],
});
```

- [ ] **Step 3: Write `lib/auth/server.ts`**

```typescript
import { headers } from 'next/headers';
import { auth } from './better-auth';

export class UnauthenticatedError extends Error {
  constructor() { super('Unauthenticated'); this.name = 'UnauthenticatedError'; }
}

/** Returns the current user's id, or throws UnauthenticatedError. Server-side only. */
export async function getCurrentUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new UnauthenticatedError();
  return session.user.id;
}

/** Returns the current user (id, email, name) or null. */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
```

- [ ] **Step 4: Write the catch-all route**

`app/api/auth/[...all]/route.ts`:

```typescript
import { auth } from '@/lib/auth/better-auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth.handler);
```

- [ ] **Step 5: Write the integration test**

`tests/integration/auth/sign-up.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { auth } from '@/lib/auth/better-auth';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

describe('better-auth sign-up + sign-in', () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  beforeEach(async () => {
    await db.execute(sql`truncate table session, account, "user", verification restart identity cascade`);
  });

  it('signs up a new user and returns a session', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: 'test@conto.local',
        password: 'correct horse battery staple',
        name: 'Test User',
      },
      headers: new Headers(),
    });
    expect(result.user.email).toBe('test@conto.local');
    expect(result.token).toBeTruthy();

    const { rows: users } = await pool.query("select id, email from users where email = 'test@conto.local'");
    expect(users.length).toBe(1);
    const { rows: accounts } = await pool.query("select 1 from account where user_id = $1", [users[0].id]);
    expect(accounts.length).toBe(1);
  });

  it('rejects invalid credentials', async () => {
    await auth.api.signUpEmail({
      body: { email: 'a@b.com', password: 'correct horse battery staple', name: 'A' },
      headers: new Headers(),
    });
    await expect(auth.api.signInEmail({
      body: { email: 'a@b.com', password: 'WRONG' },
      headers: new Headers(),
    })).rejects.toThrow();
  });
});
```

(Note: Better Auth's exact API surface around `truncate` may need session/account cascades — adjust if needed. Use `delete from` instead of `truncate` if cascade ordering bites.)

- [ ] **Step 6: Run + commit**

```bash
npm test -- tests/integration/auth/sign-up.test.ts
git add lib/auth/ app/api/auth/ tests/integration/auth/ package.json package-lock.json
git commit -m "phase0/auth: better-auth server config + catch-all route + getCurrentUserId"
```

---

### Task 7: Better Auth client + sign-in / sign-up / dashboard pages + nav

**Goal:** Visiting `/sign-up`, signing up, landing on `/dashboard` works end-to-end in a browser. Authenticated layout enforces sessions; nav has sign-out.

**Files:**
- Create: `lib/auth/client.ts`
- Create: `app/sign-in/page.tsx`
- Create: `app/sign-up/page.tsx`
- Create: `app/(authenticated)/layout.tsx`
- Create: `app/(authenticated)/dashboard/page.tsx`
- Create: `components/nav.tsx`
- Modify: `app/page.tsx` (redirect logic)

**Acceptance Criteria:**
- [ ] Visiting `/` while unauthenticated → redirect to `/sign-in`.
- [ ] Visiting `/` while authenticated → redirect to `/dashboard`.
- [ ] `/sign-up` form submits; on success, redirects to `/dashboard`.
- [ ] `/sign-in` form submits; on success, redirects to `/dashboard`.
- [ ] `/dashboard` renders the user's `name || email` and a "Upload a file" link.
- [ ] Nav has a sign-out button that, when clicked, clears the session and redirects to `/sign-in`.
- [ ] Form validation errors (mismatched confirm, weak password, duplicate email) surface inline.

**Verify:** Manual smoke: `npm run dev`, visit pages, test the flow. Playwright e2e in Task 12.

**Steps:**

- [ ] **Step 1: Write `lib/auth/client.ts`**

```typescript
'use client';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  // baseURL inferred from window.location at runtime; no env access in client.
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

- [ ] **Step 2: Replace `app/page.tsx` with the redirect**

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? '/dashboard' : '/sign-in');
}
```

- [ ] **Step 3: Write `/sign-up`**

`app/sign-up/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUp } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    const res = await signUp.email({ email, password, name: email.split('@')[0] });
    setBusy(false);
    if (res.error) { setError(res.error.message ?? 'Sign-up failed'); return; }
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Create an account</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" name="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating…' : 'Create account'}</Button>
        </form>
        <p className="text-sm text-zinc-600">Already have an account? <a href="/sign-in" className="underline">Sign in</a>.</p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Write `/sign-in`**

`app/sign-in/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await signIn.email({ email, password });
    setBusy(false);
    if (res.error) { setError(res.error.message ?? 'Sign-in failed'); return; }
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <p className="text-sm text-zinc-600">Need an account? <a href="/sign-up" className="underline">Sign up</a>.</p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Authenticated layout**

`app/(authenticated)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { Nav } from '@/components/nav';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return (
    <div className="min-h-screen">
      <Nav userLabel={user.name ?? user.email} />
      <main className="p-6 max-w-4xl mx-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: Nav**

`components/nav.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';

export function Nav({ userLabel }: { userLabel: string }) {
  const router = useRouter();
  async function onSignOut() {
    await signOut();
    router.push('/sign-in');
    router.refresh();
  }
  return (
    <nav className="border-b">
      <div className="max-w-4xl mx-auto p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="font-semibold">Conto</Link>
          <Link href="/upload" className="text-sm text-zinc-700">Upload</Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600">{userLabel}</span>
          <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 7: Dashboard**

`app/(authenticated)/dashboard/page.tsx`:

```tsx
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/server';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Welcome, {user?.name ?? user?.email}.</h1>
      <p className="text-sm text-zinc-600">You're signed in. Phase 0 demo:</p>
      <Link href="/upload" className="inline-block px-4 py-2 border rounded">Upload a file</Link>
    </div>
  );
}
```

- [ ] **Step 8: Manual smoke**

`npm run dev`, visit `http://localhost:3000`. Verify:
- `/` redirects to `/sign-in` when logged out.
- `/sign-up` works and lands on `/dashboard`.
- Sign-out returns to `/sign-in`.

- [ ] **Step 9: Commit**

```bash
git add lib/auth/client.ts app/sign-in app/sign-up "app/(authenticated)" app/page.tsx components/nav.tsx
git commit -m "phase0/auth-ui: sign-in / sign-up / dashboard pages + authenticated layout + nav"
```

---

### Task 8: R2 storage client + putObject helper

**Goal:** A `putObject` helper that PUTs a buffer to Cloudflare R2 and returns the user-prefixed key.

**Files:**
- Create: `lib/storage/r2.ts`
- Create: `lib/storage/put-object.ts`
- Test: `tests/integration/storage/put-object.test.ts`

**Acceptance Criteria:**
- [ ] `putObject({ userId, body, contentType, originalFilename })` returns `{ key }` where `key` starts with `${userId}/` per ADR-1.
- [ ] After a successful call, the object is retrievable via the same R2 client at the same key (verified by a HEAD or GET).
- [ ] Failure modes (network, auth, bucket missing) throw with a readable error.

**Verify:** `npm test -- tests/integration/storage/put-object.test.ts` passes (against the real R2 bucket configured in `.env`).

**Steps:**

- [ ] **Step 1: Install AWS S3 SDK**

```bash
npm install @aws-sdk/client-s3
```

- [ ] **Step 2: Write `lib/storage/r2.ts`**

```typescript
import { S3Client } from '@aws-sdk/client-s3';
import { parseEnv } from '@/lib/types/env';

const env = parseEnv();

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export const R2_BUCKET = env.R2_BUCKET;
```

- [ ] **Step 3: Write `lib/storage/put-object.ts`**

```typescript
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { r2, R2_BUCKET } from './r2';

interface Args {
  userId: string;
  body: Uint8Array | Buffer;
  contentType: string;
  originalFilename: string;
}

export async function putObject(args: Args): Promise<{ key: string }> {
  const safeName = args.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const key = `${args.userId}/${randomUUID()}/${safeName}`;
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: args.body,
    ContentType: args.contentType,
  }));
  return { key };
}
```

- [ ] **Step 4: Write the integration test**

`tests/integration/storage/put-object.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET } from '@/lib/storage/r2';
import { putObject } from '@/lib/storage/put-object';
import 'dotenv/config';

describe('putObject', () => {
  it('uploads to R2 and returns a user-prefixed key', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const body = Buffer.from(`hello-${Date.now()}`);
    const { key } = await putObject({
      userId, body, contentType: 'text/plain', originalFilename: 'hello.txt',
    });

    expect(key.startsWith(`${userId}/`)).toBe(true);
    expect(key.endsWith('/hello.txt')).toBe(true);

    // Verify the object exists.
    const head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    expect(head.ContentLength).toBe(body.length);

    // Cleanup.
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  });

  it('rejects unsafe filenames by sanitising them', async () => {
    const userId = '00000000-0000-0000-0000-000000000002';
    const { key } = await putObject({
      userId, body: Buffer.from('x'),
      contentType: 'text/plain',
      originalFilename: '../../etc/passwd',
    });
    expect(key.includes('..')).toBe(false);
    expect(key.includes('/etc/')).toBe(false);
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
npm test -- tests/integration/storage/put-object.test.ts
git add lib/storage/ tests/integration/storage/ package.json package-lock.json
git commit -m "phase0/storage: r2 client + putObject helper with user-prefixed keys"
```

---

### Task 9: pg-boss singleton + worker entry + noop handler

**Goal:** A worker process that starts pg-boss, registers a `noop` handler, and runs forever. Web code can enqueue jobs via `boss.send`.

**Files:**
- Create: `lib/jobs/boss.ts`
- Create: `lib/jobs/noop.ts`
- Create: `lib/jobs/index.ts`
- Create: `lib/jobs/worker.ts`
- Test: `tests/integration/jobs/noop.test.ts`

**Acceptance Criteria:**
- [ ] `npm run worker:dev` starts a long-running process that logs `[worker] ready`.
- [ ] Calling `boss.send('noop', { hello: 'world' })` from a separate node process causes the worker to log `[noop] { hello: 'world' }`.
- [ ] Worker handles SIGINT / SIGTERM gracefully (calls `boss.stop({ wait: true })`).
- [ ] pg-boss creates its own `pgboss.*` schema in Postgres on first start.

**Verify:** `npm test -- tests/integration/jobs/noop.test.ts` passes; manual smoke confirms the worker runs.

**Steps:**

- [ ] **Step 1: Install pg-boss**

```bash
npm install pg-boss
```

- [ ] **Step 2: Write `lib/jobs/boss.ts`**

```typescript
import PgBoss from 'pg-boss';
import { parseEnv } from '@/lib/types/env';

const env = parseEnv();

export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  retryLimit: 3,
  retryBackoff: true,
});
```

- [ ] **Step 3: Write `lib/jobs/noop.ts`**

```typescript
import type PgBoss from 'pg-boss';

interface NoopPayload {
  uploadedKey?: string;
  userId?: string;
  filename?: string;
  [key: string]: unknown;
}

export async function registerNoop(boss: PgBoss): Promise<void> {
  await boss.work<NoopPayload>('noop', async (job) => {
    console.log('[noop]', job[0]?.data ?? job);
  });
}
```

(Note: pg-boss v10's `work` callback signature passes either a single job or an array depending on options. The `?? job` fallback handles both. Adjust if your pg-boss version is different.)

- [ ] **Step 4: Write `lib/jobs/index.ts`**

```typescript
import type PgBoss from 'pg-boss';
import { registerNoop } from './noop';

export async function registerHandlers(boss: PgBoss): Promise<void> {
  await boss.createQueue('noop');
  await registerNoop(boss);
}
```

- [ ] **Step 5: Write `lib/jobs/worker.ts`**

```typescript
import { boss } from './boss';
import { registerHandlers } from './index';

async function main(): Promise<void> {
  await boss.start();
  await registerHandlers(boss);
  console.log('[worker] ready');

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      console.log(`[worker] received ${sig}, shutting down…`);
      await boss.stop({ wait: true });
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 6: Add worker scripts to `package.json`**

Append to `"scripts"`:
```json
"worker:dev":   "tsx watch lib/jobs/worker.ts",
"worker:start": "node --import tsx lib/jobs/worker.ts"
```

- [ ] **Step 7: Manual smoke**

In one terminal:
```bash
npm run worker:dev
```
Expected: `[worker] ready`.

In a second terminal:
```bash
node --import tsx -e "import('./lib/jobs/boss.ts').then(async ({ boss }) => { await boss.start(); await boss.send('noop', { hello: 'world' }); await boss.stop(); })"
```
Expected: in the worker terminal, `[noop] { hello: 'world' }`.

- [ ] **Step 8: Write the integration test**

`tests/integration/jobs/noop.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import PgBoss from 'pg-boss';
import { registerHandlers } from '@/lib/jobs/index';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

describe('pg-boss noop', () => {
  it('starts, registers noop handler, processes a sent job', async () => {
    const boss = new PgBoss({ connectionString: url });
    await boss.start();

    let received: unknown = null;
    await boss.createQueue('noop');
    await boss.work('noop', async (job) => {
      received = (job as any)[0]?.data ?? (job as any).data;
    });

    await boss.send('noop', { hello: 'world' });
    // Wait briefly for the worker poll cycle.
    await new Promise(r => setTimeout(r, 1500));

    expect(received).toEqual({ hello: 'world' });
    await boss.stop({ wait: true });
  }, 10000);
});
```

- [ ] **Step 9: Commit**

```bash
git add lib/jobs/ tests/integration/jobs/ package.json package-lock.json
git commit -m "phase0/jobs: pg-boss singleton + worker entry + noop handler"
```

---

### Task 10: Upload route + page (the Phase 0 demo)

**Goal:** A signed-in user can submit a file at `/upload`, the server PUTs it to R2 and enqueues a `noop` job, the worker logs the noop. The page shows the resulting R2 key.

**Files:**
- Create: `app/(authenticated)/upload/page.tsx`
- Create: `app/api/upload/route.ts`
- Test: `tests/integration/api/upload.test.ts`

**Acceptance Criteria:**
- [ ] `POST /api/upload` with a multipart body and a valid session: returns `{ ok: true, key }`. The object exists in R2. A `noop` job has been enqueued.
- [ ] `POST /api/upload` without a session: returns 401.
- [ ] `POST /api/upload` with no file: returns 400.
- [ ] `/upload` page shows a form; on submit it posts to `/api/upload`; on success it shows the returned key.

**Verify:** `npm test -- tests/integration/api/upload.test.ts` passes; manual smoke completes the demo.

**Steps:**

- [ ] **Step 1: Write the API route**

`app/api/upload/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { putObject } from '@/lib/storage/put-object';
import { boss } from '@/lib/jobs/boss';

export async function POST(req: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    throw e;
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const arrayBuf = await file.arrayBuffer();
  const body = Buffer.from(arrayBuf);

  let key: string;
  try {
    ({ key } = await putObject({
      userId,
      body,
      contentType: file.type || 'application/octet-stream',
      originalFilename: file.name,
    }));
  } catch (err) {
    return NextResponse.json({ error: 'R2 upload failed', detail: String(err) }, { status: 502 });
  }

  // Job enqueue is best-effort. If it fails, log + return 502 with a hint that the file IS in R2.
  try {
    await boss.send('noop', { uploadedKey: key, userId, filename: file.name });
  } catch (err) {
    return NextResponse.json({
      error: 'Upload succeeded but job enqueue failed',
      key, detail: String(err),
    }, { status: 502 });
  }

  return NextResponse.json({ ok: true, key });
}
```

- [ ] **Step 2: Boss start in web context**

The web process is a long-lived Next.js server. pg-boss supports `boss.send` without a worker if the queue is initialised. Since we want the queue + tables created by the worker, but `send` from web should still work as long as `boss` is started — the cleanest pattern is to lazily start boss on first send.

Edit `lib/jobs/boss.ts` to wrap with a lazy starter:

```typescript
import PgBoss from 'pg-boss';
import { parseEnv } from '@/lib/types/env';

const env = parseEnv();

let _boss: PgBoss | null = null;
let _starting: Promise<PgBoss> | null = null;

async function ensureStarted(): Promise<PgBoss> {
  if (_boss) return _boss;
  if (_starting) return _starting;
  _starting = (async () => {
    const b = new PgBoss({ connectionString: env.DATABASE_URL, retryLimit: 3, retryBackoff: true });
    await b.start();
    _boss = b;
    return b;
  })();
  return _starting;
}

export const boss = {
  async send(name: string, data: unknown): Promise<void> {
    const b = await ensureStarted();
    await b.send(name, data as object);
  },
  async start(): Promise<PgBoss> {
    return ensureStarted();
  },
  async stop(opts?: { wait?: boolean }): Promise<void> {
    if (_boss) { await _boss.stop(opts as any); _boss = null; }
    _starting = null;
  },
};

// For places that need the raw PgBoss (the worker entry):
export async function getBossRaw(): Promise<PgBoss> {
  return ensureStarted();
}
```

Update `lib/jobs/worker.ts` to use `getBossRaw`:

```typescript
import { getBossRaw } from './boss';
import { registerHandlers } from './index';

async function main(): Promise<void> {
  const boss = await getBossRaw();
  await registerHandlers(boss);
  console.log('[worker] ready');
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      console.log(`[worker] received ${sig}, shutting down…`);
      await boss.stop({ wait: true });
      process.exit(0);
    });
  }
}

main().catch((err) => { console.error('[worker] fatal:', err); process.exit(1); });
```

- [ ] **Step 3: Write the upload page**

`app/(authenticated)/upload/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function UploadPage() {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setKey(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setError(json.error ?? 'Upload failed'); return; }
    setKey(json.key);
  }

  return (
    <Card className="p-6 space-y-4 max-w-lg">
      <h1 className="text-xl font-semibold">Upload a file</h1>
      <p className="text-sm text-zinc-600">Pick any small file. We'll PUT it to R2 and enqueue a no-op job.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="file" name="file" required className="block w-full text-sm" />
        <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Button>
      </form>
      {key && <p className="text-sm text-emerald-700">Uploaded — key: <code className="text-xs">{key}</code></p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Card>
  );
}
```

- [ ] **Step 4: Manual smoke**

In two terminals:
- `npm run dev`
- `npm run worker:dev`

Visit `http://localhost:3000`, sign up, upload a small file. Verify the page shows a key, the worker logs `[noop]` with that key.

- [ ] **Step 5: Write the integration test**

`tests/integration/api/upload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/upload/route';

// Bypass auth in this unit-style integration test by calling the handler directly with a mocked session.
// Better Auth's getSession reads from headers; for end-to-end coverage we use Playwright (Task 12).
// Here we test the failure paths and the structure.

describe('POST /api/upload', () => {
  it('returns 401 when unauthenticated', async () => {
    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: new FormData(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```

(Authenticated upload coverage is exercised by the Playwright e2e in Task 12.)

- [ ] **Step 6: Commit**

```bash
git add app/api/upload "app/(authenticated)/upload" lib/jobs/boss.ts lib/jobs/worker.ts tests/integration/api/
git commit -m "phase0/upload: /api/upload + /upload page integrating auth + R2 + pg-boss"
```

---

### Task 11: Vitest config + db helpers + smoke test

**Goal:** `npm test` runs unit + integration tests. Reusable `resetTestDb` and `seedUserAndAccount` helpers exist for future phases.

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/helpers/db.ts`
- Create: `tests/unit/smoke.test.ts` (already drafted in Task 2; finalise)

**Acceptance Criteria:**
- [ ] `npm test` runs both unit and integration projects.
- [ ] `tests/unit/smoke.test.ts` passes.
- [ ] `tests/unit/env.test.ts` from Task 2 passes.
- [ ] `tests/integration/db/schema.test.ts` from Task 4 passes.
- [ ] `tests/integration/db/seed.test.ts` from Task 5 passes.
- [ ] `tests/integration/auth/sign-up.test.ts` from Task 6 passes.
- [ ] `tests/integration/storage/put-object.test.ts` from Task 8 passes.
- [ ] `tests/integration/jobs/noop.test.ts` from Task 9 passes.
- [ ] `tests/helpers/db.ts` exports `resetTestDb()` and `seedUserAndAccount()`.

**Verify:** `npm test` exits 0.

**Steps:**

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest @vitest/ui dotenv
```

- [ ] **Step 2: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['dotenv/config'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: 15000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 3: Write `tests/helpers/db.ts`**

```typescript
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { auth } from '@/lib/auth/better-auth';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');
const pool = new Pool({ connectionString: url });
export const testDb = drizzle(pool, { schema });

const TABLES_IN_DEPENDENCY_ORDER = [
  'expected_events','pay_cadences','recurrence_groups',
  'transaction_links','transactions',
  'subscriptions','goals','budgets','rules',
  'statements','accounts','payslips','merchants','categories',
  'session','account','verification','users',
];

export async function resetTestDb(): Promise<void> {
  // pg-boss tables in pgboss schema are left alone.
  for (const t of TABLES_IN_DEPENDENCY_ORDER) {
    await testDb.execute(sql.raw(`truncate table "${t}" restart identity cascade`));
  }
}

export interface SeededUser {
  userId: string;
  accountId: string;
  email: string;
}

export async function seedUserAndAccount(opts?: {
  email?: string;
  openingBalanceCents?: bigint;
}): Promise<SeededUser> {
  const email = opts?.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@conto.local`;

  const result = await auth.api.signUpEmail({
    body: { email, password: 'correct horse battery staple', name: email.split('@')[0] },
    headers: new Headers(),
  });
  const userId = result.user.id;

  const inserted = await testDb.insert(schema.accounts).values({
    userId,
    name: 'Test Account',
    institution: 'TEST',
    type: 'checking',
    openingBalanceCents: opts?.openingBalanceCents ?? 100000n,
    openingBalanceDate: '2026-01-01',
  }).returning();

  return { userId, accountId: inserted[0].id, email };
}
```

- [ ] **Step 4: Finalise `tests/unit/smoke.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Add test scripts to `package.json`**

Append to `"scripts"`:
```json
"test":         "vitest run",
"test:watch":   "vitest"
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```
Expected: every test from Tasks 2, 4, 5, 6, 8, 9, 10, plus the smoke, all green.

If any test from a prior task fails because it referenced helpers that didn't yet exist, update those tests to use `tests/helpers/db.ts` now.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts tests/ package.json package-lock.json
git commit -m "phase0/tests: vitest config + db helpers + all integration tests passing"
```

---

### Task 12: Playwright config + e2e happy path

**Goal:** A Playwright test exercises the full Phase 0 demo: sign-up → upload → success message.

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/auth-and-upload.spec.ts`
- Create: `tests/fixtures/hello.txt`

**Acceptance Criteria:**
- [ ] `npm run test:e2e` boots `npm run dev` + `npm run worker:dev`, runs the test, and tears them down.
- [ ] The test signs up a fresh user, uploads `tests/fixtures/hello.txt`, asserts the success message includes the user-prefixed key.
- [ ] Test uses `TEST_DATABASE_URL` (not the dev DB) so it doesn't pollute dev data.

**Verify:** `npm run test:e2e` passes against a fresh test DB.

**Steps:**

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write `tests/fixtures/hello.txt`**

```
hello from conto phase 0
```

- [ ] **Step 3: Write `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: [
    {
      command: 'npm run dev',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test'),
        BETTER_AUTH_URL: `http://localhost:${PORT}`,
      },
    },
    {
      command: 'npm run worker:dev',
      port: undefined,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test'),
      },
    } as any,
  ],
});
```

(Note: Playwright's `webServer` array supports multiple servers. The worker has no port to wait on; the `port: undefined` plus `reuseExistingServer: false` is the typical pattern. If your Playwright version requires a different shape, consult docs.)

- [ ] **Step 4: Write the e2e test**

`tests/e2e/auth-and-upload.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('sign up, upload a file, see the key', async ({ page }) => {
  const email = `test-${Date.now()}@conto.local`;

  await page.goto('/sign-up');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'correct horse battery staple');
  await page.fill('input[name=confirm]', 'correct horse battery staple');
  await page.click('button[type=submit]');

  await page.waitForURL('**/dashboard', { timeout: 10_000 });
  await page.click('a:has-text("Upload a file")');

  await page.waitForURL('**/upload');
  await page.setInputFiles('input[type=file]', 'tests/fixtures/hello.txt');
  await page.click('button[type=submit]');

  await expect(page.getByText(/Uploaded — key:/i)).toBeVisible({ timeout: 15_000 });
  // Key should start with the user's UUID. We can't easily fetch the user id from the e2e,
  // but we can assert the key shape (uuid/uuid/filename).
  const codeText = await page.locator('code').first().innerText();
  expect(codeText).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/hello\.txt$/);
});
```

- [ ] **Step 5: Add e2e scripts to `package.json`**

Append:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 6: Reset test DB before running**

The e2e test signs up a fresh user but the test DB shouldn't have stale state. Add a small reset script or rely on truncating during test bootstrap. Simplest: add a `globalSetup` in `playwright.config.ts`:

Edit `playwright.config.ts` to add:
```typescript
globalSetup: './tests/e2e/global-setup.ts',
```

`tests/e2e/global-setup.ts`:
```typescript
import { resetTestDb } from '@/tests/helpers/db';

export default async function globalSetup(): Promise<void> {
  await resetTestDb();
}
```

- [ ] **Step 7: Run + verify**

```bash
npm run test:e2e
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/e2e tests/fixtures/hello.txt package.json package-lock.json
git commit -m "phase0/e2e: playwright happy path — sign-up + upload + key assertion"
```

---

### Task 13: ADR-12, README "Getting started," PLAN.md updates, Changelog v0.3

**Goal:** Codify the Phase 0 implementation choices in the planning docs. Adopt ADR-12 (Better Auth supersedes the auth choice in ADR-2). Update README with the runnable setup. Bump PLAN.md.

**Files:**
- Create: `Docs/adr/012-better-auth.md`
- Modify: `Docs/PLAN.md` (§2 add ADR-12, §4 update users, changelog v0.3)
- Modify: `README.md` (replace "Getting started — TBD" with the working steps; bump status)

**Acceptance Criteria:**
- [ ] `Docs/adr/012-better-auth.md` exists; supersedes ADR-2's "Lucia or Auth.js" with a commitment to Better Auth.
- [ ] `Docs/PLAN.md` §2 lists ADR-12 with a one-liner.
- [ ] `Docs/PLAN.md` §4 `users` block is updated to drop `password_hash` and add `email_verified`, `name` (replaces `display_name`), `image`, `updated_at`. `cashflow_buffer_cents` retained.
- [ ] `Docs/PLAN.md` Changelog has v0.3 entry naming Phase 0 implementation start, Better Auth commitment, and the users-table reconciliation.
- [ ] `README.md` "Getting started" section replaced with the working steps from spec §7. Status bumped from "Early development" to "Phase 0 — foundation".

**Verify:**
```powershell
Test-Path Docs/adr/012-better-auth.md
'ADR-12','email_verified','v0.3 \(2026' | ForEach-Object {
  (Select-String -Path Docs/PLAN.md -Pattern $_ | Measure-Object).Count
}
Select-String -Path README.md -Pattern 'docker compose up','npm run worker:dev','Phase 0 — foundation' | Measure-Object | Select-Object -ExpandProperty Count
```
Expected: ADR-12 file exists; each PLAN.md pattern returns ≥ 1; README pattern matches ≥ 3.

**Steps:**

- [ ] **Step 1: Write ADR-12**

`Docs/adr/012-better-auth.md`:

```markdown
# ADR-12: Better Auth as the auth library

## Status

Accepted — 2026-05-04. Supersedes the "Lucia or Auth.js" wording in ADR-2.

## Context

ADR-2 left the auth library open between Lucia and Auth.js. By Phase 0 implementation time:

1. Lucia v3 went into maintenance mode in late 2024 (the maintainer formally stopped active development and recommended users either roll their own auth with the `oslo` primitives or migrate to a successor).
2. Auth.js (NextAuth) is mature and popular but its abstractions assume OAuth-first flows; for an email + password single-user start that will grow into multi-tenant, the abstraction layer is more friction than help.
3. Better Auth (v1, released 2024) emerged as the actively-maintained spirit-successor to Lucia: lightweight, Postgres-native via a Drizzle adapter, session-based, type-safe, with email + password and social-provider plugins.

Conto needs:
- Email + password as the V1 provider (per `PLAN.md` §3 — auth provider was always email + password, no OAuth at start).
- Sessions backed by Postgres (per ADR-2 — TypeScript everywhere, Drizzle as the ORM, no extra infra).
- A clear path to add OAuth (Google / GitHub) later without rewriting auth.
- Active maintenance — auth touches enough of the stack that betting on a maintenance-mode library is a real risk.

Better Auth satisfies all four. Lucia satisfies (1)–(3) but fails (4). Auth.js satisfies (1) and (4) but its abstraction is heavier than needed for the V1 shape.

## Decision

Better Auth is the auth library for Conto. Specifically:

- `better-auth` v1.x with the Drizzle adapter against the existing Postgres database.
- Email + password provider only at Phase 0; OAuth providers can plug in later.
- Sessions stored in Better Auth's `session` table; credentials in its `account` table.
- The catch-all route at `app/api/auth/[...all]/route.ts` mounts Better Auth's request handler.
- `getCurrentUserId()` server helper at `lib/auth/server.ts` is the entry point all authenticated server code uses to scope queries.

## Consequences

- ADR-2's "Lucia or Auth.js" wording is superseded by this ADR. ADR-2 itself stands; only the auth-library option is rewritten by ADR-12.
- `users` table (PLAN.md §4) loses `password_hash` (Better Auth manages credentials in its own `account` table) and gains Better Auth's standard columns (`email_verified`, `name`, `image`, `updated_at`). `cashflow_buffer_cents` (ADR-10) is retained.
- Three new tables ship in Phase 0 alongside the §4 schema: `session`, `account`, `verification`. They are managed by Better Auth's CLI / Drizzle schema generation; Conto's domain code does not read them directly.
- `display_name` becomes `name` for consistency with Better Auth conventions.
- Adding OAuth (Google / GitHub / Apple) is a configuration change in `lib/auth/better-auth.ts`, not a rewrite.
- `next-auth` and `lucia` are NOT in `package.json`. If a future ADR supersedes this one, the migration path is straightforward (Better Auth's session shape is standard).

## References

- ADR-2: TypeScript everywhere; Drizzle ORM; Lucia or Auth.js (auth-library option superseded by this ADR).
- Spec: `Docs/superpowers/specs/2026-05-04-phase-0-foundation-design.md` §2 (auth decision) and §4.2 (Better Auth subsystem design).
```

- [ ] **Step 2: Update `Docs/PLAN.md` §2 — add ADR-12 entry**

After the existing ADR-11 paragraph (added by Plan A), and before the closing `---` of §2, insert:

```markdown
**ADR-12: Better Auth as the auth library.**
Supersedes the "Lucia or Auth.js" wording in ADR-2 with a commitment to **Better Auth** (v1, Drizzle adapter, email+password at V1 with OAuth providers added later). Lucia v3 in maintenance mode since late 2024; Auth.js abstraction heavier than needed. Full record: `/docs/adr/012-better-auth.md`.
```

- [ ] **Step 3: Update `Docs/PLAN.md` §4 `users` block**

Find the current `users` SQL block in §4. Replace it entirely with:

```sql
users (
  id uuid pk,
  email text unique not null,
  email_verified boolean not null default false,
  name text,                                -- was display_name; renamed for Better Auth conventions
  image text,                               -- nullable
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cashflow_buffer_cents bigint not null default 50000  -- $500 default; user-adjustable in settings
)
-- Plus Better Auth's tables: session, account, verification (managed by Better Auth's schema; see ADR-12).
-- password_hash from earlier drafts is dropped — credentials live in Better Auth's `account` table.
```

- [ ] **Step 4: Update `Docs/PLAN.md` Changelog**

Append:
```markdown
- **v0.3 (2026-05-04)** — Phase 0 implementation begins. Adopt ADR-12 (Better Auth supersedes the Lucia/Auth.js option in ADR-2). `users` schema reconciled (drops `password_hash`, adds `email_verified`/`name`/`image`/`updated_at`). All §4 tables — including Plan A deltas — now live in `lib/db/schema.ts` and ship via `lib/db/migrations/0000_init.sql`. AU subcategory seed automatic on `npm run db:seed`. README "Getting started" reflects the runnable Docker + Next.js + worker stack.
```

- [ ] **Step 5: Update `README.md`**

Replace the existing `## Status` line:
```markdown
## Status

Phase 0 — foundation.
```

Replace the `## Getting started` block (currently `_TBD — Phase 0._`) with:

````markdown
## Getting started

Prerequisites: Node 20+, Docker, a Cloudflare R2 bucket.

```bash
cp .env.example .env
# fill in DATABASE_URL, BETTER_AUTH_SECRET, R2_*

docker compose up -d              # Postgres on localhost:5432
npm install
npm run db:migrate                # apply migrations
npm run db:seed                   # seed AU subcategories

# In separate terminals:
npm run dev                       # web on :3000
npm run worker:dev                # worker process
```

Visit http://localhost:3000 → sign up → upload a file → see the worker log the no-op job.

### Tests

```bash
npm test                          # Vitest unit + integration
npm run test:e2e                  # Playwright (auto-starts dev + worker)
```
````

- [ ] **Step 6: Verify**

```powershell
Test-Path Docs/adr/012-better-auth.md
Select-String -Path Docs/PLAN.md -Pattern 'ADR-12','email_verified','v0.3 \(2026' | Measure-Object | Select-Object -ExpandProperty Count
Select-String -Path README.md -Pattern 'docker compose up','npm run worker:dev','Phase 0 — foundation' | Measure-Object | Select-Object -ExpandProperty Count
```
Expected: file exists; PLAN.md returns ≥ 3 matches across patterns; README returns ≥ 3 matches.

- [ ] **Step 7: Commit**

```bash
git add Docs/adr/012-better-auth.md Docs/PLAN.md README.md
git commit -m "phase0/docs: ADR-12 (Better Auth) + PLAN.md v0.3 + README getting-started"
```

---

## Self-Review Notes (informational)

**Spec coverage:**
- Spec §2 decisions ratified: auth (Better Auth — Tasks 6/7/13), R2 (Tasks 8/10), repo structure (Task 1), scope (all tasks).
- Spec §3 file structure: Task 1 (scaffold) + Task 11 (vitest) + Task 12 (playwright) + Tasks 2–10 (per-subsystem files).
- Spec §3 `package.json` scripts: Task 1 adds dev/build/start; Task 4 adds db:generate + db:migrate; Task 5 adds db:seed + db:reset; Task 9 adds worker:dev + worker:start; Task 11 adds test scripts; Task 12 adds test:e2e.
- Spec §3 module dependency rules: enforced implicitly by file placement; not explicitly tested. (Future: lint rule in a follow-up plan.)
- Spec §4.1 db: Task 4. RLS-via-`withUser`: Task 4 Step 5.
- Spec §4.2 auth: Tasks 6, 7, 13.
- Spec §4.3 storage: Task 8.
- Spec §4.4 worker: Tasks 9, 10.
- Spec §4.5 env: Task 2.
- Spec §5 UI / E2E: Tasks 7, 10, 12.
- Spec §6 testing: Tasks 11, 12.
- Spec §7 README: Task 13.
- Spec §9 plan-level deliverables: Task 13 (ADR-12, PLAN.md updates, changelog v0.3).

**Placeholders:** searched for TBD/TODO/"add appropriate"/"similar to". None present in code blocks. The `db-reset.ts` placeholder in Task 5 Step 3 is a one-liner stub; functional, not aspirational.

**Type consistency:** `withUser`, `getCurrentUserId`, `putObject`, `boss.send`, `parseEnv`, `seedAuSubcategories`, `resetTestDb`, `seedUserAndAccount` are defined once each and used identically across tasks. Drizzle table exports (`users`, `sessions`, `accountsAuth`, `verifications`, etc.) consistent.

**Scope check:** 13 tasks for Phase 0 foundation. Each is independently committable; integration tests gate each subsystem; the Playwright e2e (Task 12) is the cross-cutting verification. Scope is one coherent foundation deliverable; not split-able further without losing the shared schema/env coupling.

**Drift hooks not in this plan:**
- GitHub Actions CI — out of scope per spec.
- Vercel / Fly.io deploy pipeline — out of scope per spec.
- Pre-signed R2 URLs — out of scope per spec (revisit Phase 1).
- OAuth providers — Better Auth supports them; add when needed.
