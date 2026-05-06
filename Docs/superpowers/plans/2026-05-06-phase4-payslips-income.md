# Phase 4 — Payslips & Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver payslip↔income linking, income dashboard, WFH hours tracker, and receipts vault under a new `/income` hub.

**Architecture:** Four features share a `/income` layout with sub-nav tabs. All schema is ready except `wfh_entries` (new table) and two receipt-metadata columns on `transactions`. Payslip linking reuses the `transaction_links` table (`link_type='income'`) and mirrors the transfer-detection pattern.

**Tech Stack:** Next.js App Router · Drizzle ORM · pg-boss · Recharts · `@aws-sdk/client-s3` · `@aws-sdk/s3-request-presigner` (new dep) · Vitest · Playwright

---

### Task 1: Migration + schema + test-helper update

**Goal:** Add `wfh_entries` table and `receipt_filename`/`receipt_content_type` columns to `transactions`; reflect in Drizzle schema and test-helper.

**Files:**
- Create: `lib/db/migrations/0005_phase4.sql`
- Modify: `lib/db/schema.ts`
- Modify: `tests/helpers/db.ts`

**Acceptance Criteria:**
- [ ] `npm run db:migrate` succeeds against a clean local DB
- [ ] `wfh_entries` table exists with unique constraint on `(user_id, date)`
- [ ] `transactions.receipt_filename` and `transactions.receipt_content_type` columns exist
- [ ] `resetTestDb()` truncates `wfh_entries`

**Verify:** `npx vitest run tests/unit/db/schema.test.ts` → PASS (schema smoke test)

**Steps:**

- [ ] **Step 1: Write the migration**

```sql
-- lib/db/migrations/0005_phase4.sql

create table wfh_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table transactions
  add column if not exists receipt_filename text,
  add column if not exists receipt_content_type text;
```

- [ ] **Step 2: Apply migration**

```bash
npm run db:migrate
```

Expected: migration runs without error.

- [ ] **Step 3: Add `wfhEntries` to `lib/db/schema.ts`**

Add after the `expectedEvents` table definition:

```ts
export const wfhEntries = pgTable('wfh_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  date: date('date').notNull(),
  hours: numeric('hours', { precision: 4, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userDateUniq: uniqueIndex('wfh_entries_user_date_idx').on(t.userId, t.date),
}));
```

- [ ] **Step 4: Add receipt columns to `transactions` in schema**

In the `transactions` table definition, after `receiptUploadedAt`:

```ts
  receiptFilename: text('receipt_filename'),
  receiptContentType: text('receipt_content_type'),
```

- [ ] **Step 5: Add `wfh_entries` to `resetTestDb` table list**

In `tests/helpers/db.ts`, update `ALL_TABLES`:

```ts
const ALL_TABLES = [
  'wfh_entries', 'expected_events', 'pay_cadences', 'recurrence_groups',
  'transaction_links', 'transactions',
  'subscriptions', 'goals', 'budgets', 'rules',
  'statements', 'accounts', 'payslips', 'merchants', 'categories',
  'session', 'account', 'verification', 'users',
];
```

- [ ] **Step 6: Verify**

```bash
npx vitest run tests/unit/db/schema.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/migrations/0005_phase4.sql lib/db/schema.ts tests/helpers/db.ts
git commit -m "phase4/schema: wfh_entries table + receipt columns on transactions"
```

---

### Task 2: FY utility + payslip queries

**Goal:** Shared FY date-bound helpers and all payslip read-queries the UI needs.

**Files:**
- Create: `lib/domain/fy.ts`
- Create: `lib/db/queries/payslips.ts`

**Acceptance Criteria:**
- [ ] `fyBounds(2026)` returns `{ start: '2025-07-01', end: '2026-06-30' }`
- [ ] `currentFyYear()` returns correct FY for today (2026-05-06 → 2026)
- [ ] `getPayslipsByUser` returns payslips ordered by `pay_date DESC` with link status
- [ ] `getUnlinkedPayslips` excludes payslips that have an `income` link

**Verify:** `npx vitest run tests/unit/domain/fy.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Write failing FY tests**

```ts
// tests/unit/domain/fy.test.ts
import { describe, it, expect } from 'vitest';
import { fyBounds, fyYear, currentFyYear, calYearBounds } from '@/lib/domain/fy';

describe('fyBounds', () => {
  it('returns Jul-Jun range for given FY year', () => {
    expect(fyBounds(2026)).toEqual({ start: '2025-07-01', end: '2026-06-30' });
    expect(fyBounds(2025)).toEqual({ start: '2024-07-01', end: '2025-06-30' });
  });
});

describe('fyYear', () => {
  it('returns next calendar year for dates Jul-Dec', () => {
    expect(fyYear(new Date('2025-07-01'))).toBe(2026);
    expect(fyYear(new Date('2025-12-31'))).toBe(2026);
  });
  it('returns same calendar year for dates Jan-Jun', () => {
    expect(fyYear(new Date('2026-01-01'))).toBe(2026);
    expect(fyYear(new Date('2026-06-30'))).toBe(2026);
  });
});

describe('calYearBounds', () => {
  it('returns Jan-Dec range', () => {
    expect(calYearBounds(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/domain/fy.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/domain/fy.ts`**

```ts
export function fyYear(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear();
}

export function currentFyYear(): number {
  return fyYear(new Date());
}

export function fyBounds(year: number): { start: string; end: string } {
  return { start: `${year - 1}-07-01`, end: `${year}-06-30` };
}

export function calYearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/domain/fy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write `lib/db/queries/payslips.ts`**

```ts
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { payslips, transactionLinks, transactions, accounts } from '@/lib/db/schema';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';

export interface PayslipRow {
  id: string;
  employer: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  grossCents: Cents;
  taxWithheldCents: Cents;
  superCents: Cents;
  netCents: Cents;
  source: string;
  cadence: string | null;
  linkStatus: 'linked' | 'suggested' | 'unlinked';
  linkedDepositDate: string | null;
  linkedAccountName: string | null;
  linkId: string | null;
}

export async function getPayslipsByUser(userId: string): Promise<PayslipRow[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: payslips.id,
        employer: payslips.employer,
        periodStart: payslips.periodStart,
        periodEnd: payslips.periodEnd,
        payDate: payslips.payDate,
        grossCents: payslips.grossCents,
        taxWithheldCents: payslips.taxWithheldCents,
        superCents: payslips.superCents,
        netCents: payslips.netCents,
        source: payslips.source,
        cadence: payslips.cadence,
        linkId: transactionLinks.id,
        linkSource: transactionLinks.source,
        linkedDepositDate: transactions.postedDate,
        linkedAccountName: accounts.name,
      })
      .from(payslips)
      .leftJoin(
        transactionLinks,
        and(
          eq(transactionLinks.payslipId, payslips.id),
          eq(transactionLinks.linkType, 'income'),
        ),
      )
      .leftJoin(transactions, eq(transactionLinks.fromTransactionId, transactions.id))
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(eq(payslips.userId, userId))
      .orderBy(desc(payslips.payDate));

    return rows.map(r => ({
      id: r.id,
      employer: r.employer,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      payDate: r.payDate,
      grossCents: toCents(r.grossCents),
      taxWithheldCents: toCents(r.taxWithheldCents),
      superCents: toCents(r.superCents),
      netCents: toCents(r.netCents),
      source: r.source,
      cadence: r.cadence,
      linkId: r.linkId ?? null,
      linkStatus: (r.linkId == null ? 'unlinked' : r.linkSource === 'suggested' ? 'suggested' : 'linked') as PayslipRow['linkStatus'],
      linkedDepositDate: r.linkedDepositDate ?? null,
      linkedAccountName: r.linkedAccountName ?? null,
    }));
  });
}

export async function getUnlinkedPayslips(userId: string): Promise<PayslipRow[]> {
  const all = await getPayslipsByUser(userId);
  return all.filter(p => p.linkStatus === 'unlinked');
}

export async function getPayslipById(userId: string, id: string): Promise<PayslipRow | null> {
  const all = await getPayslipsByUser(userId);
  return all.find(p => p.id === id) ?? null;
}

export async function getPayslipsForLinkingJob(
  userId: string,
): Promise<Array<{ id: string; payDate: string; netCents: Cents; employer: string }>> {
  return withUser(userId, async (tx) => {
    const linkedSub = sql<string>`(
      SELECT payslip_id FROM transaction_links
      WHERE user_id = ${userId} AND payslip_id IS NOT NULL AND link_type = 'income'
    )`;
    const rows = await tx
      .select({ id: payslips.id, payDate: payslips.payDate, netCents: payslips.netCents, employer: payslips.employer })
      .from(payslips)
      .where(and(
        eq(payslips.userId, userId),
        sql`${payslips.id} NOT IN ${linkedSub}`,
      ));
    return rows.map(r => ({ ...r, netCents: toCents(r.netCents) }));
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/fy.ts lib/db/queries/payslips.ts tests/unit/domain/fy.test.ts
git commit -m "phase4/queries: FY utility + payslip queries"
```

---

### Task 3: Payslip linking domain logic + unit tests

**Goal:** Pure `matchPayslipToIncome` function with confidence scoring, fully tested.

**Files:**
- Create: `lib/domain/payslip-linking.ts`
- Create: `tests/unit/domain/payslip-linking.test.ts`

**Acceptance Criteria:**
- [ ] Exact amount + same day → confidence 0.70
- [ ] Employer name in description → +0.20
- [ ] Matching pay cadence → +0.10
- [ ] Amount mismatch → excluded
- [ ] Date > 3 days apart → excluded
- [ ] Negative amount → excluded
- [ ] Results sorted descending by confidence

**Verify:** `npx vitest run tests/unit/domain/payslip-linking.test.ts` → PASS (7 tests)

**Steps:**

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/domain/payslip-linking.test.ts
import { describe, it, expect } from 'vitest';
import { matchPayslipToIncome } from '@/lib/domain/payslip-linking';

const payslip = { payDate: '2026-05-01', netCents: BigInt(423456), employer: 'Acme Corp' };

const baseTx = (overrides: Partial<{ id: string; postedDate: string; amountCents: bigint; descriptionRaw: string }> = {}) => ({
  id: 'tx-1',
  postedDate: '2026-05-01',
  amountCents: BigInt(423456),
  descriptionRaw: 'DEPOSIT',
  ...overrides,
});

describe('matchPayslipToIncome', () => {
  it('returns base confidence 0.70 on exact amount + same day', () => {
    const result = matchPayslipToIncome(payslip, [baseTx()], []);
    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBe(0.70);
  });

  it('adds 0.20 when description contains employer word', () => {
    const result = matchPayslipToIncome(payslip, [baseTx({ descriptionRaw: 'ACME PAYROLL' })], []);
    expect(result[0]!.confidence).toBeCloseTo(0.90);
  });

  it('adds 0.10 when pay cadence matches employer', () => {
    const result = matchPayslipToIncome(payslip, [baseTx()], [{ employer: 'Acme Corp', cadence: 'monthly' }]);
    expect(result[0]!.confidence).toBeCloseTo(0.80);
  });

  it('caps at 1.0 when all signals present', () => {
    const result = matchPayslipToIncome(
      payslip,
      [baseTx({ descriptionRaw: 'ACME PAYROLL' })],
      [{ employer: 'Acme Corp', cadence: 'monthly' }],
    );
    expect(result[0]!.confidence).toBe(1.0);
  });

  it('excludes transactions with wrong amount', () => {
    const result = matchPayslipToIncome(payslip, [baseTx({ amountCents: BigInt(400000) })], []);
    expect(result).toHaveLength(0);
  });

  it('excludes transactions more than 3 days apart', () => {
    const result = matchPayslipToIncome(payslip, [baseTx({ postedDate: '2026-05-05' })], []);
    expect(result).toHaveLength(0);
  });

  it('excludes negative (debit) transactions', () => {
    const result = matchPayslipToIncome(payslip, [baseTx({ amountCents: BigInt(-423456) })], []);
    expect(result).toHaveLength(0);
  });

  it('matches at exactly ±3 days', () => {
    const r1 = matchPayslipToIncome(payslip, [baseTx({ postedDate: '2026-04-28' })], []);
    const r2 = matchPayslipToIncome(payslip, [baseTx({ postedDate: '2026-05-04' })], []);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });

  it('sorts results descending by confidence', () => {
    const result = matchPayslipToIncome(payslip, [
      baseTx({ id: 'low', descriptionRaw: 'DEPOSIT' }),
      baseTx({ id: 'high', descriptionRaw: 'ACME PAYROLL' }),
    ], []);
    expect(result[0]!.transactionId).toBe('high');
    expect(result[1]!.transactionId).toBe('low');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/domain/payslip-linking.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/domain/payslip-linking.ts`**

```ts
export interface PayslipInput {
  payDate: string;
  netCents: bigint;
  employer: string;
}

export interface TransactionCandidate {
  id: string;
  postedDate: string;
  amountCents: bigint;
  descriptionRaw: string;
}

export interface PayCadenceInput {
  employer: string;
  cadence: string;
}

export interface LinkCandidate {
  transactionId: string;
  confidence: number;
}

export function matchPayslipToIncome(
  payslip: PayslipInput,
  candidates: TransactionCandidate[],
  payCadences: PayCadenceInput[],
): LinkCandidate[] {
  const results: LinkCandidate[] = [];
  const employerWord = payslip.employer.toLowerCase().split(/\s+/)[0] ?? '';

  for (const tx of candidates) {
    if (tx.amountCents !== payslip.netCents) continue;
    if (tx.amountCents <= BigInt(0)) continue;
    if (Math.abs(daysBetween(tx.postedDate, payslip.payDate)) > 3) continue;

    let confidence = 0.70;

    if (employerWord && tx.descriptionRaw.toLowerCase().includes(employerWord)) {
      confidence += 0.20;
    }

    if (payCadences.some(pc => pc.employer.toLowerCase().includes(employerWord))) {
      confidence += 0.10;
    }

    results.push({ transactionId: tx.id, confidence: Math.min(confidence, 1.0) });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

function daysBetween(a: string, b: string): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/domain/payslip-linking.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/payslip-linking.ts tests/unit/domain/payslip-linking.test.ts
git commit -m "phase4/domain: payslip-income linking pure function + tests"
```

---

### Task 4: Link-payslips job + payslip server actions

**Goal:** pg-boss job that auto-detects and inserts income links; server actions for UI confirmation.

**Files:**
- Create: `lib/jobs/link-payslips.ts`
- Modify: `lib/jobs/index.ts`
- Create: `app/actions/payslips.ts`

**Acceptance Criteria:**
- [ ] Job inserts `transaction_links` with `link_type='income'` and `source='auto'` for confidence ≥ 0.90
- [ ] Job inserts `source='suggested'` for confidence < 0.90
- [ ] Job skips payslips that already have an income link
- [ ] `confirmIncomeLink` action changes `source` to `'user'`
- [ ] `dismissIncomeLink` action deletes the link row

**Verify:** `npx vitest run tests/integration/jobs/link-payslips.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Write the job**

```ts
// lib/jobs/link-payslips.ts
import type { PgBoss, JobWithMetadata } from 'pg-boss';
import { and, between, eq, gt, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactionLinks, transactions, payCadences } from '@/lib/db/schema';
import { getPayslipsForLinkingJob } from '@/lib/db/queries/payslips';
import { matchPayslipToIncome } from '@/lib/domain/payslip-linking';

interface Payload { userId: string }

export async function registerLinkPayslips(boss: PgBoss): Promise<void> {
  await boss.createQueue('link-payslips').catch(() => {});
  await boss.work<Payload>('link-payslips', { batchSize: 4, localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs as JobWithMetadata<Payload>[]) {
      const { userId } = job.data;
      try {
        await runLinkPayslips(userId);
      } catch (err) {
        console.error(`[link-payslips] jobId=${job.id} userId=${userId}`, err);
        throw err;
      }
    }
  });
}

export async function runLinkPayslips(userId: string): Promise<void> {
  const unlinkedPayslips = await getPayslipsForLinkingJob(userId);
  if (unlinkedPayslips.length === 0) return;

  await withUser(userId, async (tx) => {
    const cadences = await tx
      .select({ employer: payCadences.employer, cadence: payCadences.cadence })
      .from(payCadences)
      .where(and(eq(payCadences.userId, userId), eq(payCadences.active, true)));

    // Already-linked transaction IDs (avoid re-linking the same deposit)
    const linkedTxSub = sql<string>`(
      SELECT from_transaction_id FROM transaction_links
      WHERE user_id = ${userId} AND link_type = 'income'
    )`;

    for (const payslip of unlinkedPayslips) {
      // Window: payDate ±7 days
      const payMs = new Date(payslip.payDate).getTime();
      const windowStart = new Date(payMs - 7 * 86_400_000).toISOString().slice(0, 10);
      const windowEnd   = new Date(payMs + 7 * 86_400_000).toISOString().slice(0, 10);

      const candidateTxs = await tx
        .select({ id: transactions.id, postedDate: transactions.postedDate, amountCents: transactions.amountCents, descriptionRaw: transactions.descriptionRaw })
        .from(transactions)
        .where(and(
          eq(transactions.userId, userId),
          gt(transactions.amountCents, BigInt(0)),
          between(transactions.postedDate, windowStart, windowEnd),
          sql`${transactions.id} NOT IN ${linkedTxSub}`,
        ));

      const matches = matchPayslipToIncome(payslip, candidateTxs, cadences);
      if (matches.length === 0) continue;

      const best = matches[0]!;
      await tx.insert(transactionLinks).values({
        userId,
        linkType: 'income',
        fromTransactionId: best.transactionId,
        toTransactionId: null,
        payslipId: payslip.id,
        confidence: best.confidence.toFixed(3),
        source: best.confidence >= 0.90 ? 'auto' : 'suggested',
      }).onConflictDoNothing();
    }
  });
}
```

- [ ] **Step 2: Register job in `lib/jobs/index.ts`**

Add import and registration:

```ts
import { registerLinkPayslips } from './link-payslips';
```

Inside `registerHandlers`, after `registerDetectTransfers(boss)`:

```ts
  await registerLinkPayslips(boss);
```

- [ ] **Step 3: Write `app/actions/payslips.ts`**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { withUser } from '@/lib/db/client';
import { transactionLinks } from '@/lib/db/schema';

async function getUser(): Promise<string> {
  try { return await getCurrentUserId(); }
  catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function confirmIncomeLink(linkId: string): Promise<void> {
  const userId = await getUser();
  await withUser(userId, async (tx) => {
    const [link] = await tx
      .update(transactionLinks)
      .set({ source: 'user' })
      .where(and(eq(transactionLinks.id, linkId), eq(transactionLinks.userId, userId), eq(transactionLinks.linkType, 'income')))
      .returning({ id: transactionLinks.id });
    if (!link) throw new Error('Link not found');
  });
  revalidatePath('/income/payslips');
}

export async function dismissIncomeLink(linkId: string): Promise<void> {
  const userId = await getUser();
  await withUser(userId, async (tx) => {
    await tx.delete(transactionLinks)
      .where(and(eq(transactionLinks.id, linkId), eq(transactionLinks.userId, userId), eq(transactionLinks.linkType, 'income')));
  });
  revalidatePath('/income/payslips');
}

export async function createManualIncomeLink(payslipId: string, depositTxId: string): Promise<void> {
  const userId = await getUser();
  await withUser(userId, async (tx) => {
    // Remove any existing income link for this payslip first
    await tx.delete(transactionLinks)
      .where(and(eq(transactionLinks.userId, userId), eq(transactionLinks.payslipId, payslipId), eq(transactionLinks.linkType, 'income')));
    await tx.insert(transactionLinks).values({
      userId,
      linkType: 'income',
      fromTransactionId: depositTxId,
      toTransactionId: null,
      payslipId,
      confidence: '1.000',
      source: 'user',
    });
  });
  revalidatePath('/income/payslips');
}
```

- [ ] **Step 4: Write integration test**

```ts
// tests/integration/jobs/link-payslips.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactions, transactionLinks, payslips } from '@/lib/db/schema';
import { resetTestDb, seedUserAndAccount } from '../../helpers/db';
import { runLinkPayslips } from '@/lib/jobs/link-payslips';

describe('runLinkPayslips', () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await resetTestDb();
    ({ userId, accountId } = await seedUserAndAccount());
  });

  it('auto-confirms high-confidence match (same-day + employer name)', async () => {
    await withUser(userId, async (tx) => {
      await tx.insert(transactions).values({
        userId, accountId, postedDate: '2026-05-01',
        descriptionRaw: 'ACME PAYROLL', amountCents: BigInt(423456),
        classificationSource: 'unclassified',
      });
      await tx.insert(payslips).values({
        userId, employer: 'Acme Corp', periodStart: '2026-04-16', periodEnd: '2026-04-30',
        payDate: '2026-05-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(36544), netCents: BigInt(423456), source: 'manual',
      });
    });

    await runLinkPayslips(userId);

    const links = await withUser(userId, tx =>
      tx.select().from(transactionLinks).where(and(eq(transactionLinks.userId, userId), eq(transactionLinks.linkType, 'income'))),
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.source).toBe('auto');
    expect(parseFloat(links[0]!.confidence ?? '0')).toBeGreaterThanOrEqual(0.90);
  });

  it('marks low-confidence match as suggested', async () => {
    await withUser(userId, async (tx) => {
      await tx.insert(transactions).values({
        userId, accountId, postedDate: '2026-05-03',
        descriptionRaw: 'DEPOSIT', amountCents: BigInt(423456),
        classificationSource: 'unclassified',
      });
      await tx.insert(payslips).values({
        userId, employer: 'Acme Corp', periodStart: '2026-04-16', periodEnd: '2026-04-30',
        payDate: '2026-05-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(36544), netCents: BigInt(423456), source: 'manual',
      });
    });

    await runLinkPayslips(userId);

    const links = await withUser(userId, tx =>
      tx.select().from(transactionLinks).where(and(eq(transactionLinks.userId, userId), eq(transactionLinks.linkType, 'income'))),
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.source).toBe('suggested');
  });

  it('skips payslips that already have an income link', async () => {
    let payslipId: string;
    let txId: string;
    await withUser(userId, async (tx) => {
      const [t] = await tx.insert(transactions).values({
        userId, accountId, postedDate: '2026-05-01',
        descriptionRaw: 'DEPOSIT', amountCents: BigInt(423456),
        classificationSource: 'unclassified',
      }).returning({ id: transactions.id });
      txId = t!.id;
      const [p] = await tx.insert(payslips).values({
        userId, employer: 'Acme Corp', periodStart: '2026-04-16', periodEnd: '2026-04-30',
        payDate: '2026-05-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(36544), netCents: BigInt(423456), source: 'manual',
      }).returning({ id: payslips.id });
      payslipId = p!.id;
      await tx.insert(transactionLinks).values({
        userId, linkType: 'income', fromTransactionId: txId!, payslipId: payslipId!,
        confidence: '0.700', source: 'user',
      });
    });

    await runLinkPayslips(userId);

    const links = await withUser(userId, tx =>
      tx.select().from(transactionLinks).where(and(eq(transactionLinks.userId, userId), eq(transactionLinks.linkType, 'income'))),
    );
    expect(links).toHaveLength(1); // not duplicated
  });
});
```

- [ ] **Step 5: Run integration test**

```bash
npx vitest run tests/integration/jobs/link-payslips.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/jobs/link-payslips.ts lib/jobs/index.ts app/actions/payslips.ts tests/integration/jobs/link-payslips.test.ts
git commit -m "phase4/jobs: link-payslips job + payslip server actions"
```

---

### Task 5: Income summary queries + integration tests

**Goal:** Three read-only queries that power the income dashboard: summary totals, monthly breakdown, per-employer breakdown.

**Files:**
- Create: `lib/db/queries/income-summary.ts`
- Create: `tests/integration/db/queries/income-summary.test.ts`

**Acceptance Criteria:**
- [ ] `getIncomeSummary` aggregates gross/tax/super/net across all payslips in range
- [ ] `getIncomeByMonth` returns one row per month containing payslips in range
- [ ] `getIncomeByEmployer` groups by `employer` field
- [ ] All queries return empty/zero for periods with no payslips

**Verify:** `npx vitest run tests/integration/db/queries/income-summary.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Write failing integration tests**

```ts
// tests/integration/db/queries/income-summary.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { withUser } from '@/lib/db/client';
import { payslips } from '@/lib/db/schema';
import { resetTestDb, seedUserAndAccount } from '../../helpers/db';
import { getIncomeSummary, getIncomeByMonth, getIncomeByEmployer } from '@/lib/db/queries/income-summary';

const seed = (userId: string) =>
  withUser(userId, tx =>
    tx.insert(payslips).values([
      { userId, employer: 'Acme Corp', periodStart: '2025-07-16', periodEnd: '2025-07-31',
        payDate: '2025-08-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(57000), netCents: BigInt(403000), source: 'manual' },
      { userId, employer: 'Acme Corp', periodStart: '2025-08-16', periodEnd: '2025-08-31',
        payDate: '2025-09-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(57000), netCents: BigInt(403000), source: 'manual' },
      { userId, employer: 'Beta Ltd', periodStart: '2025-09-01', periodEnd: '2025-09-30',
        payDate: '2025-10-01', grossCents: BigInt(500000), taxWithheldCents: BigInt(100000),
        superCents: BigInt(47500), netCents: BigInt(352500), source: 'manual' },
    ]),
  );

describe('income-summary queries', () => {
  let userId: string;
  beforeEach(async () => {
    await resetTestDb();
    ({ userId } = await seedUserAndAccount());
    await seed(userId);
  });

  it('getIncomeSummary totals all payslips in range', async () => {
    const s = await getIncomeSummary(userId, '2025-07-01', '2026-06-30');
    expect(Number(s.grossCents)).toBe(1_700_000);
    expect(Number(s.taxCents)).toBe(380_000);
    expect(Number(s.superCents)).toBe(161_500);
    expect(Number(s.netCents)).toBe(1_158_500);
    expect(s.count).toBe(3);
  });

  it('getIncomeSummary returns zeros for empty range', async () => {
    const s = await getIncomeSummary(userId, '2020-07-01', '2021-06-30');
    expect(Number(s.grossCents)).toBe(0);
    expect(s.count).toBe(0);
  });

  it('getIncomeByMonth groups by pay month', async () => {
    const rows = await getIncomeByMonth(userId, '2025-07-01', '2026-06-30');
    expect(rows.length).toBe(3);
    expect(rows[0]!.month).toBe('2025-08');
    expect(Number(rows[0]!.grossCents)).toBe(600_000);
  });

  it('getIncomeByEmployer groups by employer', async () => {
    const rows = await getIncomeByEmployer(userId, '2025-07-01', '2026-06-30');
    expect(rows).toHaveLength(2);
    const acme = rows.find(r => r.employer === 'Acme Corp')!;
    expect(Number(acme.grossCents)).toBe(1_200_000);
    expect(acme.count).toBe(2);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/integration/db/queries/income-summary.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/db/queries/income-summary.ts`**

```ts
import { and, between, count, eq, sql, sum } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { payslips } from '@/lib/db/schema';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';

export interface IncomeSummary {
  grossCents: Cents;
  taxCents: Cents;
  superCents: Cents;
  netCents: Cents;
  count: number;
}

export interface IncomeByMonth {
  month: string; // 'YYYY-MM'
  grossCents: Cents;
  taxCents: Cents;
  superCents: Cents;
  netCents: Cents;
}

export interface IncomeByEmployer {
  employer: string;
  grossCents: Cents;
  taxCents: Cents;
  superCents: Cents;
  netCents: Cents;
  count: number;
}

export async function getIncomeSummary(userId: string, start: string, end: string): Promise<IncomeSummary> {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select({
        grossCents: sql<bigint>`coalesce(sum(gross_cents), 0)::bigint`,
        taxCents:   sql<bigint>`coalesce(sum(tax_withheld_cents), 0)::bigint`,
        superCents: sql<bigint>`coalesce(sum(super_cents), 0)::bigint`,
        netCents:   sql<bigint>`coalesce(sum(net_cents), 0)::bigint`,
        count:      sql<number>`count(*)::int`,
      })
      .from(payslips)
      .where(and(eq(payslips.userId, userId), between(payslips.payDate, start, end)));
    return {
      grossCents: toCents(row!.grossCents),
      taxCents:   toCents(row!.taxCents),
      superCents: toCents(row!.superCents),
      netCents:   toCents(row!.netCents),
      count:      row!.count,
    };
  });
}

export async function getIncomeByMonth(userId: string, start: string, end: string): Promise<IncomeByMonth[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        month:      sql<string>`to_char(pay_date, 'YYYY-MM')`,
        grossCents: sql<bigint>`sum(gross_cents)::bigint`,
        taxCents:   sql<bigint>`sum(tax_withheld_cents)::bigint`,
        superCents: sql<bigint>`sum(super_cents)::bigint`,
        netCents:   sql<bigint>`sum(net_cents)::bigint`,
      })
      .from(payslips)
      .where(and(eq(payslips.userId, userId), between(payslips.payDate, start, end)))
      .groupBy(sql`to_char(pay_date, 'YYYY-MM')`)
      .orderBy(sql`to_char(pay_date, 'YYYY-MM')`);
    return rows.map(r => ({
      month: r.month,
      grossCents: toCents(r.grossCents),
      taxCents:   toCents(r.taxCents),
      superCents: toCents(r.superCents),
      netCents:   toCents(r.netCents),
    }));
  });
}

export async function getIncomeByEmployer(userId: string, start: string, end: string): Promise<IncomeByEmployer[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        employer:   payslips.employer,
        grossCents: sql<bigint>`sum(gross_cents)::bigint`,
        taxCents:   sql<bigint>`sum(tax_withheld_cents)::bigint`,
        superCents: sql<bigint>`sum(super_cents)::bigint`,
        netCents:   sql<bigint>`sum(net_cents)::bigint`,
        count:      sql<number>`count(*)::int`,
      })
      .from(payslips)
      .where(and(eq(payslips.userId, userId), between(payslips.payDate, start, end)))
      .groupBy(payslips.employer)
      .orderBy(sql`sum(gross_cents) desc`);
    return rows.map(r => ({
      employer:   r.employer,
      grossCents: toCents(r.grossCents),
      taxCents:   toCents(r.taxCents),
      superCents: toCents(r.superCents),
      netCents:   toCents(r.netCents),
      count:      r.count,
    }));
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/integration/db/queries/income-summary.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/income-summary.ts tests/integration/db/queries/income-summary.test.ts
git commit -m "phase4/queries: income summary, monthly, per-employer aggregations"
```

---

### Task 6: Income hub layout + nav entry

**Goal:** `/income` layout with sub-nav tabs; "Income" link added to the top nav.

**Files:**
- Create: `app/(authenticated)/income/layout.tsx`
- Modify: `components/nav.tsx`

**Acceptance Criteria:**
- [ ] `/income`, `/income/payslips`, `/income/wfh`, `/income/receipts` all render the sub-nav
- [ ] Active tab is highlighted based on current pathname
- [ ] "Income" appears in the top nav between Subscriptions and Runway

**Verify:** Start dev server (`npm run dev`), navigate to `/income` → sub-nav renders, no errors.

**Steps:**

- [ ] **Step 1: Create `app/(authenticated)/income/layout.tsx`**

```tsx
import Link from 'next/link';
import { headers } from 'next/headers';

const tabs = [
  { href: '/income',          label: 'Overview' },
  { href: '/income/payslips', label: 'Payslips' },
  { href: '/income/wfh',      label: 'WFH' },
  { href: '/income/receipts', label: 'Receipts' },
];

export default async function IncomeLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '';

  return (
    <div>
      <div className="mb-6 border-b">
        <nav className="flex gap-6">
          {tabs.map(tab => {
            const active = tab.href === '/income'
              ? pathname === '/income'
              : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
                  active
                    ? 'border-zinc-900 text-zinc-900'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
```

Note: Next.js App Router doesn't expose `pathname` server-side via `headers()` by default. The `x-pathname` header must be set by middleware. Check if a `middleware.ts` already exists that forwards it. If not, add the following to `middleware.ts` (create if absent):

```ts
// middleware.ts (at repo root)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('x-pathname', request.nextUrl.pathname);
  return response;
}

export const config = { matcher: '/((?!_next|api|favicon).*)' };
```

If middleware already exists, add the `x-pathname` header set line to it.

- [ ] **Step 2: Add "Income" link to `components/nav.tsx`**

In the nav links `<div>`, add after the Subscriptions link and before Runway:

```tsx
<Link href="/income" className="text-sm text-zinc-700 hover:text-zinc-900">Income</Link>
```

The full links section becomes:
```tsx
<Link href="/statements" ...>Statements</Link>
<Link href="/accounts" ...>Accounts</Link>
<Link href="/transfers" ...>Transfers {badge}</Link>
<Link href="/subscriptions" ...>Subscriptions</Link>
<Link href="/income" className="text-sm text-zinc-700 hover:text-zinc-900">Income</Link>
<Link href="/runway" ...>Runway</Link>
<Link href="/categories" ...>Categories</Link>
<Link href="/upload" ...>Upload</Link>
```

- [ ] **Step 3: Create stub pages so the layout renders**

```tsx
// app/(authenticated)/income/page.tsx (stub — replaced in Task 8)
export default function IncomePage() {
  return <p className="text-zinc-500">Income dashboard coming soon.</p>;
}
```

```tsx
// app/(authenticated)/income/payslips/page.tsx (stub — replaced in Task 7)
export default function PayslipsPage() {
  return <p className="text-zinc-500">Payslips coming soon.</p>;
}
```

```tsx
// app/(authenticated)/income/wfh/page.tsx (stub — replaced in Task 10)
export default function WfhPage() {
  return <p className="text-zinc-500">WFH tracker coming soon.</p>;
}
```

```tsx
// app/(authenticated)/income/receipts/page.tsx (stub — replaced in Task 13)
export default function ReceiptsPage() {
  return <p className="text-zinc-500">Receipts vault coming soon.</p>;
}
```

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Open `http://localhost:3000/income` — sub-nav with Overview / Payslips / WFH / Receipts tabs renders. "Income" appears in the top nav.

- [ ] **Step 5: Commit**

```bash
git add app/(authenticated)/income/ components/nav.tsx middleware.ts
git commit -m "phase4/nav: income hub layout + sub-nav + nav entry"
```

---

### Task 7: Payslips review page + link panel

**Goal:** `/income/payslips` lists all payslips with status badges; unlinked/suggested show a panel to confirm or dismiss the link.

**Files:**
- Modify: `app/(authenticated)/income/payslips/page.tsx`
- Create: `components/payslip-link-panel.tsx`

**Acceptance Criteria:**
- [ ] Payslip list renders with Linked / Review / Unlinked badges
- [ ] Clicking a Review payslip expands a panel showing candidate deposit + confidence
- [ ] Confirm button calls `confirmIncomeLink`; Dismiss calls `dismissIncomeLink`
- [ ] Linked payslips show matched deposit account + date

**Verify:** In browser with seeded data, the payslip list renders correctly.

**Steps:**

- [ ] **Step 1: Create `components/payslip-link-panel.tsx`**

```tsx
'use client';
import { useTransition } from 'react';
import { confirmIncomeLink, dismissIncomeLink } from '@/app/actions/payslips';
import { Button } from '@/components/ui/button';

interface Props {
  linkId: string;
  depositDate: string;
  depositDesc: string;
  depositAmountFormatted: string;
  confidence: number;
}

export function PayslipLinkPanel({ linkId, depositDate, depositDesc, depositAmountFormatted, confidence }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 p-3 rounded border border-amber-200 bg-amber-50 text-sm">
      <p className="font-medium text-amber-800 mb-2">Suggested deposit match</p>
      <p className="text-zinc-700">{depositDate} · {depositDesc} · {depositAmountFormatted}</p>
      <p className="text-zinc-500 text-xs mt-1">Confidence: {Math.round(confidence * 100)}%</p>
      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => confirmIncomeLink(linkId))}
        >
          Confirm link
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(() => dismissIncomeLink(linkId))}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the stub with the real payslips page**

```tsx
// app/(authenticated)/income/payslips/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getPayslipsByUser } from '@/lib/db/queries/payslips';
import { PayslipLinkPanel } from '@/components/payslip-link-panel';

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

const statusBadge: Record<string, string> = {
  linked:    'bg-green-100 text-green-700',
  suggested: 'bg-amber-100 text-amber-700',
  unlinked:  'bg-zinc-100 text-zinc-600',
};

const statusLabel: Record<string, string> = {
  linked: 'Linked', suggested: 'Review', unlinked: 'Unlinked',
};

export default async function PayslipsPage() {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const payslips = await getPayslipsByUser(userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Payslips</h1>
      {payslips.length === 0 && (
        <p className="text-zinc-500">No payslips yet. Add one via the manual entry form.</p>
      )}
      <ul className="divide-y">
        {payslips.map(p => (
          <li key={p.id} className="py-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{p.employer}</p>
                <p className="text-sm text-zinc-500">{p.payDate} · {p.periodStart} – {p.periodEnd}</p>
                <div className="flex gap-4 text-sm mt-1">
                  <span>Gross {fmt(p.grossCents)}</span>
                  <span>Tax {fmt(p.taxWithheldCents)}</span>
                  <span>Super {fmt(p.superCents)}</span>
                  <span className="font-medium">Net {fmt(p.netCents)}</span>
                </div>
                {p.linkStatus === 'linked' && p.linkedDepositDate && (
                  <p className="text-xs text-green-700 mt-1">
                    Deposit matched: {p.linkedDepositDate} · {p.linkedAccountName}
                  </p>
                )}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge[p.linkStatus]}`}>
                {statusLabel[p.linkStatus]}
              </span>
            </div>
            {p.linkStatus === 'suggested' && p.linkId && (
              <PayslipLinkPanel
                linkId={p.linkId}
                depositDate={p.linkedDepositDate ?? ''}
                depositDesc=""
                depositAmountFormatted={fmt(p.netCents)}
                confidence={0.70}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `/income/payslips`. With no payslips, the empty state renders. With seeded payslips, the list shows.

- [ ] **Step 4: Commit**

```bash
git add app/(authenticated)/income/payslips/page.tsx components/payslip-link-panel.tsx
git commit -m "phase4/ui: payslips review page + link panel"
```

---

### Task 8: Income dashboard — summary cards + chart + page

**Goal:** `/income` shows YTD summary cards and a grouped monthly bar chart with FY/cal-year toggle.

**Files:**
- Create: `components/income-summary-cards.tsx`
- Create: `components/income-chart.tsx`
- Modify: `app/(authenticated)/income/page.tsx`

**Acceptance Criteria:**
- [ ] Four summary cards render (Gross, Tax Withheld, Super, Net)
- [ ] Chart renders grouped bars by month
- [ ] `?period=fy&year=2026` and `?period=cal&year=2026` both work
- [ ] Default is current FY

**Verify:** In browser, `/income` renders with cards and chart (may show zeros if no payslips seeded).

**Steps:**

- [ ] **Step 1: Create `components/income-summary-cards.tsx`**

```tsx
import type { Cents } from '@/lib/types/money';

function fmt(cents: Cents): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

interface Props {
  grossCents: Cents;
  taxCents: Cents;
  superCents: Cents;
  netCents: Cents;
  count: number;
}

export function IncomeSummaryCards({ grossCents, taxCents, superCents, netCents, count }: Props) {
  const cards = [
    { label: 'Gross income',  value: grossCents },
    { label: 'Tax withheld',  value: taxCents },
    { label: 'Super',         value: superCents },
    { label: 'Net pay',       value: netCents },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map(c => (
        <div key={c.label} className="rounded border p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">{c.label}</p>
          <p className="text-2xl font-semibold mt-1">{fmt(c.value)}</p>
        </div>
      ))}
      <p className="col-span-full text-xs text-zinc-400">{count} payslip{count !== 1 ? 's' : ''} in period</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/income-chart.tsx`**

```tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DataPoint {
  month: string;
  gross: number;
  tax: number;
  super: number;
  net: number;
}

interface Props { data: DataPoint[] }

export function IncomeChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-zinc-400 text-sm">No data for this period</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={v => `$${(v / 100).toFixed(0)}`} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) =>
          new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v / 100)
        } />
        <Legend />
        <Bar dataKey="gross" name="Gross" fill="#6366f1" />
        <Bar dataKey="tax"   name="Tax withheld" fill="#f87171" />
        <Bar dataKey="super" name="Super" fill="#34d399" />
        <Bar dataKey="net"   name="Net" fill="#60a5fa" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Replace the stub income dashboard page**

```tsx
// app/(authenticated)/income/page.tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getIncomeSummary, getIncomeByMonth, getIncomeByEmployer } from '@/lib/db/queries/income-summary';
import { fyBounds, calYearBounds, currentFyYear } from '@/lib/domain/fy';
import { IncomeSummaryCards } from '@/components/income-summary-cards';
import { IncomeChart } from '@/components/income-chart';

interface Props { searchParams: Promise<Record<string, string>> }

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

export default async function IncomePage({ searchParams }: Props) {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const sp = await searchParams;
  const period = sp['period'] === 'cal' ? 'cal' : 'fy';
  const year = parseInt(sp['year'] ?? String(currentFyYear()), 10);
  const bounds = period === 'fy' ? fyBounds(year) : calYearBounds(year);
  const label = period === 'fy' ? `FY ${year - 1}–${String(year).slice(2)}` : String(year);

  const [summary, monthly, byEmployer] = await Promise.all([
    getIncomeSummary(userId, bounds.start, bounds.end),
    getIncomeByMonth(userId, bounds.start, bounds.end),
    getIncomeByEmployer(userId, bounds.start, bounds.end),
  ]);

  const chartData = monthly.map(m => ({
    month: m.month,
    gross: Number(m.grossCents),
    tax:   Number(m.taxCents),
    super: Number(m.superCents),
    net:   Number(m.netCents),
  }));

  const otherPeriod = period === 'fy' ? 'cal' : 'fy';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Income — {label}</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/income?period=${otherPeriod}&year=${year}`}
            className="text-zinc-500 hover:text-zinc-800"
          >
            {period === 'fy' ? 'Switch to calendar year' : 'Switch to financial year'}
          </Link>
          <div className="flex gap-1">
            <Link href={`/income?period=${period}&year=${year - 1}`} className="px-2 py-1 border rounded text-xs">←</Link>
            <Link href={`/income?period=${period}&year=${year + 1}`} className="px-2 py-1 border rounded text-xs">→</Link>
          </div>
        </div>
      </div>

      <IncomeSummaryCards
        grossCents={summary.grossCents}
        taxCents={summary.taxCents}
        superCents={summary.superCents}
        netCents={summary.netCents}
        count={summary.count}
      />

      <div className="mb-8">
        <IncomeChart data={chartData} />
      </div>

      {byEmployer.length >= 2 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-zinc-700 mb-3">By employer</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b">
                <th className="pb-2 pr-4">Employer</th>
                <th className="pb-2 pr-4 text-right">Gross</th>
                <th className="pb-2 pr-4 text-right">Tax</th>
                <th className="pb-2 pr-4 text-right">Super</th>
                <th className="pb-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byEmployer.map(e => (
                <tr key={e.employer}>
                  <td className="py-2 pr-4">{e.employer}</td>
                  <td className="py-2 pr-4 text-right">{fmt(e.grossCents)}</td>
                  <td className="py-2 pr-4 text-right">{fmt(e.taxCents)}</td>
                  <td className="py-2 pr-4 text-right">{fmt(e.superCents)}</td>
                  <td className="py-2 text-right">{fmt(e.netCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Navigate to `/income` — cards show zeros (or real data if payslips exist), chart renders empty state or bars.

- [ ] **Step 5: Commit**

```bash
git add app/(authenticated)/income/page.tsx components/income-summary-cards.tsx components/income-chart.tsx
git commit -m "phase4/ui: income dashboard with summary cards + monthly chart"
```

---

### Task 9: WFH queries + actions + integration tests

**Goal:** Database layer for WFH entries — upsert, delete, monthly fetch, FY summary.

**Files:**
- Create: `lib/db/queries/wfh-entries.ts`
- Create: `app/actions/wfh.ts`
- Create: `tests/integration/db/queries/wfh-entries.test.ts`

**Acceptance Criteria:**
- [ ] `upsertWfhEntry` inserts on first call and updates on second call for same date
- [ ] `deleteWfhEntry` removes the row
- [ ] `getWfhEntriesByMonth` returns only entries for the given month
- [ ] `getWfhSummaryByFY` sums hours correctly across months

**Verify:** `npx vitest run tests/integration/db/queries/wfh-entries.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Write failing integration tests**

```ts
// tests/integration/db/queries/wfh-entries.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { resetTestDb, seedUserAndAccount } from '../../helpers/db';
import {
  upsertWfhEntry, deleteWfhEntry,
  getWfhEntriesByMonth, getWfhSummaryByFY,
} from '@/lib/db/queries/wfh-entries';

describe('wfh-entries', () => {
  let userId: string;
  beforeEach(async () => {
    await resetTestDb();
    ({ userId } = await seedUserAndAccount());
  });

  it('upserts on same date', async () => {
    await upsertWfhEntry(userId, '2026-05-01', 8);
    await upsertWfhEntry(userId, '2026-05-01', 6); // update
    const entries = await getWfhEntriesByMonth(userId, 2026, 5);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.hours).toBe('6.00');
  });

  it('deletes an entry', async () => {
    await upsertWfhEntry(userId, '2026-05-01', 8);
    await deleteWfhEntry(userId, '2026-05-01');
    const entries = await getWfhEntriesByMonth(userId, 2026, 5);
    expect(entries).toHaveLength(0);
  });

  it('getWfhEntriesByMonth filters to correct month', async () => {
    await upsertWfhEntry(userId, '2026-05-01', 8);
    await upsertWfhEntry(userId, '2026-06-01', 7);
    const may = await getWfhEntriesByMonth(userId, 2026, 5);
    expect(may).toHaveLength(1);
    expect(may[0]!.date).toBe('2026-05-01');
  });

  it('getWfhSummaryByFY sums correctly and groups by month', async () => {
    await upsertWfhEntry(userId, '2025-08-01', 8);
    await upsertWfhEntry(userId, '2025-08-04', 7.5);
    await upsertWfhEntry(userId, '2025-09-01', 8);
    const summary = await getWfhSummaryByFY(userId, '2025-07-01', '2026-06-30');
    expect(parseFloat(summary.totalHours)).toBeCloseTo(23.5);
    expect(summary.byMonth).toHaveLength(2);
    const aug = summary.byMonth.find(m => m.month === '2025-08')!;
    expect(parseFloat(aug.hours)).toBeCloseTo(15.5);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/integration/db/queries/wfh-entries.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/db/queries/wfh-entries.ts`**

```ts
import { and, between, eq, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { wfhEntries } from '@/lib/db/schema';

export interface WfhEntry {
  id: string;
  date: string;
  hours: string; // numeric comes back as string from pg driver
}

export interface WfhSummary {
  totalHours: string;
  byMonth: Array<{ month: string; hours: string }>;
}

export async function upsertWfhEntry(userId: string, date: string, hours: number): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.insert(wfhEntries)
      .values({ userId, date, hours: String(hours) })
      .onConflictDoUpdate({
        target: [wfhEntries.userId, wfhEntries.date],
        set: { hours: String(hours), updatedAt: new Date() },
      });
  });
}

export async function deleteWfhEntry(userId: string, date: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.delete(wfhEntries)
      .where(and(eq(wfhEntries.userId, userId), eq(wfhEntries.date, date)));
  });
}

export async function getWfhEntriesByMonth(userId: string, year: number, month: number): Promise<WfhEntry[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end   = `${year}-${String(month).padStart(2, '0')}-31`;
  return withUser(userId, async (tx) => {
    return tx.select({ id: wfhEntries.id, date: wfhEntries.date, hours: wfhEntries.hours })
      .from(wfhEntries)
      .where(and(eq(wfhEntries.userId, userId), between(wfhEntries.date, start, end)))
      .orderBy(wfhEntries.date);
  });
}

export async function getWfhSummaryByFY(userId: string, fyStart: string, fyEnd: string): Promise<WfhSummary> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        month: sql<string>`to_char(date, 'YYYY-MM')`,
        hours: sql<string>`sum(hours)::text`,
      })
      .from(wfhEntries)
      .where(and(eq(wfhEntries.userId, userId), between(wfhEntries.date, fyStart, fyEnd)))
      .groupBy(sql`to_char(date, 'YYYY-MM')`)
      .orderBy(sql`to_char(date, 'YYYY-MM')`);

    const totalHours = rows.reduce((acc, r) => acc + parseFloat(r.hours), 0).toFixed(2);
    return { totalHours, byMonth: rows };
  });
}
```

- [ ] **Step 4: Write `app/actions/wfh.ts`**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { upsertWfhEntry as dbUpsert, deleteWfhEntry as dbDelete } from '@/lib/db/queries/wfh-entries';

async function getUser(): Promise<string> {
  try { return await getCurrentUserId(); }
  catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function upsertWfhEntry(date: string, hours: number): Promise<void> {
  const userId = await getUser();
  if (hours <= 0 || hours > 24) throw new Error('Hours must be between 0 and 24');
  await dbUpsert(userId, date, hours);
  revalidatePath('/income/wfh');
}

export async function deleteWfhEntry(date: string): Promise<void> {
  const userId = await getUser();
  await dbDelete(userId, date);
  revalidatePath('/income/wfh');
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/integration/db/queries/wfh-entries.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/wfh-entries.ts app/actions/wfh.ts tests/integration/db/queries/wfh-entries.test.ts
git commit -m "phase4/queries: WFH entries upsert, delete, monthly + FY summary"
```

---

### Task 10: WFH tracker page + calendar component

**Goal:** `/income/wfh` renders a clickable monthly calendar grid and a FY summary panel.

**Files:**
- Create: `components/wfh-calendar.tsx`
- Create: `components/wfh-summary-panel.tsx`
- Modify: `app/(authenticated)/income/wfh/page.tsx`

**Acceptance Criteria:**
- [ ] Calendar shows current month by default; prev/next navigation works via URL params
- [ ] Weekends are greyed and non-clickable
- [ ] Clicking a workday opens an inline popover with hours input
- [ ] Saving a day updates the display (server revalidation)
- [ ] Summary panel shows FY total hours and `totalHours × $0.67` deduction

**Verify:** In browser, click a weekday, enter 8, save — day turns green with "8h".

**Steps:**

- [ ] **Step 1: Create `components/wfh-summary-panel.tsx`**

```tsx
interface MonthRow { month: string; hours: string }

interface Props {
  totalHours: string;
  byMonth: MonthRow[];
  fyLabel: string;
}

const WFH_RATE = 0.67;

function fmtDeduction(hours: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
    .format(parseFloat(hours) * WFH_RATE);
}

export function WfhSummaryPanel({ totalHours, byMonth, fyLabel }: Props) {
  const deduction = fmtDeduction(totalHours);
  return (
    <div className="rounded border p-4 flex flex-col gap-4">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">{fyLabel} total</p>
        <p className="text-3xl font-semibold mt-1">{parseFloat(totalHours).toFixed(1)}h</p>
        <p className="text-sm text-zinc-500 mt-1">Estimated deduction: <span className="font-medium text-zinc-800">{deduction}</span></p>
      </div>
      {byMonth.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-400 text-xs">
              <th className="pb-1">Month</th>
              <th className="pb-1 text-right">Hours</th>
              <th className="pb-1 text-right">Deduction</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {byMonth.map(m => (
              <tr key={m.month}>
                <td className="py-1">{m.month}</td>
                <td className="py-1 text-right">{parseFloat(m.hours).toFixed(1)}</td>
                <td className="py-1 text-right text-green-700">{fmtDeduction(m.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-zinc-400">
        Estimated deduction under PCG 2023/1 fixed-rate method (67¢/hr). Maintain these records; consult a registered tax professional for your return.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/wfh-calendar.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { upsertWfhEntry, deleteWfhEntry } from '@/app/actions/wfh';

interface Entry { date: string; hours: string }

interface Props {
  year: number;
  month: number; // 1-12
  entries: Entry[];
  prevHref: string;
  nextHref: string;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildGrid(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  // Monday-indexed: getDay() returns 0=Sun,1=Mon..6=Sat → remap
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ date: string; dow: number } | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (new Date(year, month - 1, d).getDay() + 6) % 7;
    cells.push({ date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, dow });
  }
  return cells;
}

export function WfhCalendar({ year, month, entries, prevHref, nextHref }: Props) {
  const entryMap = new Map(entries.map(e => [e.date, e.hours]));
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [inputHours, setInputHours] = useState('8');
  const [pending, startTransition] = useTransition();

  const cells = buildGrid(year, month);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  function open(date: string) {
    setActiveDate(date);
    setInputHours(entryMap.get(date) ?? '8');
  }

  function save() {
    if (!activeDate) return;
    const h = parseFloat(inputHours);
    if (isNaN(h) || h <= 0) return;
    startTransition(async () => { await upsertWfhEntry(activeDate, h); setActiveDate(null); });
  }

  function clear() {
    if (!activeDate) return;
    startTransition(async () => { await deleteWfhEntry(activeDate); setActiveDate(null); });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Link href={prevHref} className="px-3 py-1 border rounded text-sm">←</Link>
        <span className="font-medium">{monthLabel}</span>
        <Link href={nextHref} className="px-3 py-1 border rounded text-sm">→</Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-400 mb-1">
        {DOW.map(d => <div key={d}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const isWeekend = cell.dow >= 5;
          const hours = entryMap.get(cell.date);
          const isActive = activeDate === cell.date;
          const day = parseInt(cell.date.slice(8), 10);

          return (
            <div key={cell.date} className="relative">
              <button
                disabled={isWeekend || pending}
                onClick={() => open(cell.date)}
                className={`w-full aspect-square rounded text-xs flex flex-col items-center justify-center gap-0.5
                  ${isWeekend ? 'text-zinc-300 cursor-default' : 'hover:bg-zinc-100 cursor-pointer'}
                  ${hours ? 'bg-green-100 text-green-800 font-medium' : ''}
                  ${isActive ? 'ring-2 ring-zinc-800' : ''}
                `}
              >
                <span>{day}</span>
                {hours && <span className="text-[10px]">{parseFloat(hours).toFixed(hours.endsWith('.00') ? 0 : 1)}h</span>}
              </button>

              {isActive && (
                <div className="absolute z-10 top-full mt-1 left-0 bg-white border rounded shadow-lg p-3 w-36 text-sm">
                  <input
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={inputHours}
                    onChange={e => setInputHours(e.target.value)}
                    className="w-full border rounded px-2 py-1 mb-2 text-sm"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button onClick={save} disabled={pending} className="flex-1 bg-zinc-900 text-white rounded px-2 py-1 text-xs">Save</button>
                    {hours && <button onClick={clear} disabled={pending} className="flex-1 border rounded px-2 py-1 text-xs">Clear</button>}
                    <button onClick={() => setActiveDate(null)} className="border rounded px-2 py-1 text-xs">✕</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the stub WFH page**

```tsx
// app/(authenticated)/income/wfh/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getWfhEntriesByMonth, getWfhSummaryByFY } from '@/lib/db/queries/wfh-entries';
import { fyBounds, currentFyYear } from '@/lib/domain/fy';
import { WfhCalendar } from '@/components/wfh-calendar';
import { WfhSummaryPanel } from '@/components/wfh-summary-panel';

interface Props { searchParams: Promise<Record<string, string>> }

export default async function WfhPage({ searchParams }: Props) {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const sp = await searchParams;
  const now = new Date();
  const year  = parseInt(sp['year']  ?? String(now.getFullYear()), 10);
  const month = parseInt(sp['month'] ?? String(now.getMonth() + 1), 10);
  const fyYear = parseInt(sp['fy'] ?? String(currentFyYear()), 10);
  const { start: fyStart, end: fyEnd } = fyBounds(fyYear);
  const fyLabel = `FY ${fyYear - 1}–${String(fyYear).slice(2)}`;

  const prevMonth = month === 1  ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextMonth = month === 12 ? { year: year + 1, month: 1  } : { year, month: month + 1 };

  const [entries, summary] = await Promise.all([
    getWfhEntriesByMonth(userId, year, month),
    getWfhSummaryByFY(userId, fyStart, fyEnd),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">WFH Hours Tracker</h1>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-8">
        <WfhCalendar
          year={year}
          month={month}
          entries={entries.map(e => ({ date: e.date, hours: e.hours }))}
          prevHref={`/income/wfh?year=${prevMonth.year}&month=${prevMonth.month}&fy=${fyYear}`}
          nextHref={`/income/wfh?year=${nextMonth.year}&month=${nextMonth.month}&fy=${fyYear}`}
        />
        <WfhSummaryPanel
          totalHours={summary.totalHours}
          byMonth={summary.byMonth}
          fyLabel={fyLabel}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Navigate to `/income/wfh`. Calendar renders for current month. Click a weekday, enter hours, save — day turns green.

- [ ] **Step 5: Commit**

```bash
git add app/(authenticated)/income/wfh/page.tsx components/wfh-calendar.tsx components/wfh-summary-panel.tsx
git commit -m "phase4/ui: WFH tracker page with calendar grid + summary panel"
```

---

### Task 11: Receipt storage utils + upload endpoint

**Goal:** R2 helpers for receipts (keyed by transactionId) and a `POST /api/receipts/upload` endpoint.

**Files:**
- Create: `lib/storage/put-receipt.ts`
- Create: `lib/storage/get-signed-url.ts`
- Create: `app/api/receipts/upload/route.ts`

**Acceptance Criteria:**
- [ ] `POST /api/receipts/upload` with valid PDF/image + transactionId → 200 with `{ ok: true }`
- [ ] R2 key format: `{userId}/receipts/{transactionId}/{uuid}.{ext}`
- [ ] Transaction row updated with `receiptObjectKey`, `receiptFilename`, `receiptContentType`, `receiptUploadedAt`
- [ ] 400 on wrong content type or file > 10 MB
- [ ] 403 if transactionId belongs to another user

**Verify:** `npx vitest run tests/integration/api/receipts-upload.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Install `@aws-sdk/s3-request-presigner`**

```bash
npm install @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Create `lib/storage/put-receipt.ts`**

```ts
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { r2, R2_BUCKET } from './r2';

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg':      'jpg',
  'image/png':       'png',
};
const MAX_BYTES = 10 * 1024 * 1024;

interface Args {
  userId: string;
  transactionId: string;
  body: Buffer;
  contentType: string;
  originalFilename: string;
}

export async function putReceiptObject(args: Args): Promise<{ key: string }> {
  if (!ALLOWED.has(args.contentType)) throw new Error(`Unsupported content type: ${args.contentType}`);
  if (args.body.byteLength > MAX_BYTES) throw new Error('File exceeds 10 MB limit');
  const ext = EXT[args.contentType]!;
  const key = `${args.userId}/receipts/${args.transactionId}/${randomUUID()}.${ext}`;
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: args.body,
    ContentLength: args.body.byteLength,
    ContentType: args.contentType,
  }));
  return { key };
}
```

- [ ] **Step 3: Create `lib/storage/get-signed-url.ts`**

```ts
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, R2_BUCKET } from './r2';

export async function getReceiptSignedUrl(key: string, expiresIn = 60): Promise<string> {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn });
}
```

- [ ] **Step 4: Create `app/api/receipts/upload/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { putReceiptObject } from '@/lib/storage/put-receipt';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';

export async function POST(req: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (e instanceof Error && e.message.includes('headers')) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    throw e;
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 }); }

  const file = formData.get('file');
  const transactionId = formData.get('transactionId');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (typeof transactionId !== 'string' || !transactionId) return NextResponse.json({ error: 'transactionId required' }, { status: 400 });

  // Verify transaction ownership
  const [tx] = await withUser(userId, db =>
    db.select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId))),
  );
  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 403 });

  const body = Buffer.from(await file.arrayBuffer());
  let key: string;
  try {
    ({ key } = await putReceiptObject({
      userId,
      transactionId,
      body,
      contentType: file.type,
      originalFilename: file.name,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Unsupported') || msg.includes('10 MB')) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: 'Upload failed', detail: msg }, { status: 502 });
  }

  await withUser(userId, db =>
    db.update(transactions)
      .set({
        receiptObjectKey:   key,
        receiptFilename:    file.name,
        receiptContentType: file.type,
        receiptUploadedAt:  new Date(),
      })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId))),
  );

  return NextResponse.json({ ok: true, key });
}
```

- [ ] **Step 5: Write integration test**

```ts
// tests/integration/api/receipts-upload.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { testDb } from '../../helpers/db';
import { resetTestDb, seedUserAndAccount } from '../../helpers/db';
import { POST } from '@/app/api/receipts/upload/route';

// Minimal 1×1 white PNG (base64)
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

async function makeRequest(userId: string, txId: string, contentType = 'image/png') {
  const buf = Buffer.from(PNG_B64, 'base64');
  const file = new File([buf], 'receipt.png', { type: contentType });
  const fd = new FormData();
  fd.append('file', file);
  fd.append('transactionId', txId);

  // Patch getCurrentUserId for test
  const { vi } = await import('vitest');
  const mod = await import('@/lib/auth/server');
  vi.spyOn(mod, 'getCurrentUserId').mockResolvedValue(userId);

  return POST(new Request('http://localhost/api/receipts/upload', { method: 'POST', body: fd }));
}

describe('POST /api/receipts/upload', () => {
  let userId: string;
  let accountId: string;
  let txId: string;

  beforeEach(async () => {
    await resetTestDb();
    ({ userId, accountId } = await seedUserAndAccount());
    const [t] = await withUser(userId, db =>
      db.insert(transactions).values({
        userId, accountId,
        postedDate: '2026-05-01',
        descriptionRaw: 'Coffee',
        amountCents: BigInt(-500),
        classificationSource: 'unclassified',
      }).returning({ id: transactions.id }),
    );
    txId = t!.id;
  });

  it('returns 200 and updates the transaction', async () => {
    const res = await makeRequest(userId, txId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const [row] = await testDb.select().from(transactions).where(eq(transactions.id, txId));
    expect(row!.receiptFilename).toBe('receipt.png');
    expect(row!.receiptContentType).toBe('image/png');
    expect(row!.receiptObjectKey).toMatch(/receipts\//);
  });

  it('returns 403 for unknown transactionId', async () => {
    const res = await makeRequest(userId, '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(403);
  });

  it('returns 400 for unsupported content type', async () => {
    const res = await makeRequest(userId, txId, 'text/plain');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run integration tests**

```bash
npx vitest run tests/integration/api/receipts-upload.test.ts
```

Expected: PASS (3 tests). Note: this test calls the real R2 — ensure `R2_*` env vars are set in `.env.test` or use a local MinIO instance.

- [ ] **Step 7: Commit**

```bash
git add lib/storage/put-receipt.ts lib/storage/get-signed-url.ts app/api/receipts/upload/route.ts tests/integration/api/receipts-upload.test.ts
git commit -m "phase4/storage: receipt upload endpoint + R2 helpers"
```

---

### Task 12: Receipts queries + actions + integration tests

**Goal:** Query to list receipts by FY for the vault; server action to delete a receipt.

**Files:**
- Create: `lib/db/queries/receipts.ts`
- Create: `app/actions/receipts.ts`
- Create: `tests/integration/db/queries/receipts.test.ts`

**Acceptance Criteria:**
- [ ] `getReceiptsByFY` returns only transactions with a non-null `receiptObjectKey` in the date range
- [ ] Results ordered by `posted_date DESC`
- [ ] `deleteReceipt` nulls out the receipt columns on the transaction row

**Verify:** `npx vitest run tests/integration/db/queries/receipts.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Write failing integration test**

```ts
// tests/integration/db/queries/receipts.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { resetTestDb, seedUserAndAccount } from '../../helpers/db';
import { getReceiptsByFY } from '@/lib/db/queries/receipts';

describe('getReceiptsByFY', () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await resetTestDb();
    ({ userId, accountId } = await seedUserAndAccount());
    await withUser(userId, db =>
      db.insert(transactions).values([
        { userId, accountId, postedDate: '2025-08-01', descriptionRaw: 'A', amountCents: BigInt(-100),
          classificationSource: 'unclassified', receiptObjectKey: 'u/receipts/tx1/file.pdf',
          receiptFilename: 'invoice.pdf', receiptContentType: 'application/pdf', receiptUploadedAt: new Date() },
        { userId, accountId, postedDate: '2025-09-01', descriptionRaw: 'B', amountCents: BigInt(-200),
          classificationSource: 'unclassified' }, // no receipt
        { userId, accountId, postedDate: '2024-08-01', descriptionRaw: 'C', amountCents: BigInt(-300),
          classificationSource: 'unclassified', receiptObjectKey: 'u/receipts/tx3/file.png',
          receiptFilename: 'photo.png', receiptContentType: 'image/png', receiptUploadedAt: new Date() },
      ]),
    );
  });

  it('returns only receipted transactions in FY range', async () => {
    const rows = await getReceiptsByFY(userId, '2025-07-01', '2026-06-30');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.descriptionRaw).toBe('A');
    expect(rows[0]!.receiptFilename).toBe('invoice.pdf');
  });

  it('returns empty for FY with no receipts', async () => {
    const rows = await getReceiptsByFY(userId, '2026-07-01', '2027-06-30');
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/integration/db/queries/receipts.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/db/queries/receipts.ts`**

```ts
import { and, between, desc, eq, isNotNull } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';

export interface ReceiptRow {
  id: string;
  postedDate: string;
  descriptionRaw: string;
  amountCents: Cents;
  receiptObjectKey: string;
  receiptFilename: string;
  receiptContentType: string;
  receiptUploadedAt: Date | null;
}

export async function getReceiptsByFY(userId: string, fyStart: string, fyEnd: string): Promise<ReceiptRow[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: transactions.id,
        postedDate: transactions.postedDate,
        descriptionRaw: transactions.descriptionRaw,
        amountCents: transactions.amountCents,
        receiptObjectKey: transactions.receiptObjectKey,
        receiptFilename: transactions.receiptFilename,
        receiptContentType: transactions.receiptContentType,
        receiptUploadedAt: transactions.receiptUploadedAt,
      })
      .from(transactions)
      .where(and(
        eq(transactions.userId, userId),
        isNotNull(transactions.receiptObjectKey),
        between(transactions.postedDate, fyStart, fyEnd),
      ))
      .orderBy(desc(transactions.postedDate));

    return rows.map(r => ({
      ...r,
      amountCents: toCents(r.amountCents),
      receiptObjectKey: r.receiptObjectKey!,
      receiptFilename: r.receiptFilename ?? 'receipt',
      receiptContentType: r.receiptContentType ?? 'application/octet-stream',
    }));
  });
}

export async function clearReceipt(userId: string, transactionId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.update(transactions)
      .set({ receiptObjectKey: null, receiptFilename: null, receiptContentType: null, receiptUploadedAt: null })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
  });
}
```

- [ ] **Step 4: Write `app/actions/receipts.ts`**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { clearReceipt } from '@/lib/db/queries/receipts';

async function getUser(): Promise<string> {
  try { return await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated'); throw e; }
}

export async function deleteReceipt(transactionId: string): Promise<void> {
  const userId = await getUser();
  await clearReceipt(userId, transactionId);
  revalidatePath('/income/receipts');
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/integration/db/queries/receipts.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/receipts.ts app/actions/receipts.ts tests/integration/db/queries/receipts.test.ts
git commit -m "phase4/queries: getReceiptsByFY + clearReceipt action"
```

---

### Task 13: Receipts vault page + transaction list paperclip

**Goal:** `/income/receipts` shows FY-tabbed receipt vault; transaction list gains paperclip icon for upload/view.

**Files:**
- Modify: `app/(authenticated)/income/receipts/page.tsx`
- Create: `components/receipt-upload-modal.tsx`
- Create: `components/receipt-viewer-modal.tsx`
- Modify: `app/(authenticated)/accounts/[id]/transactions/page.tsx`

**Acceptance Criteria:**
- [ ] Receipts vault shows FY tabs; current FY selected by default
- [ ] Each receipt card shows filename, transaction date + description + amount
- [ ] Delete button removes the receipt (calls `deleteReceipt`)
- [ ] Transaction list has paperclip icon per row: empty opens upload modal, filled opens viewer
- [ ] Upload modal POSTs to `/api/receipts/upload`; on success page refreshes

**Verify:** In browser — upload a receipt via transaction list paperclip, then view it in `/income/receipts`.

**Steps:**

- [ ] **Step 1: Create `components/receipt-upload-modal.tsx`**

```tsx
'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  transactionId: string;
  onClose: () => void;
}

export function ReceiptUploadModal({ transactionId, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) { setError('Please select a file'); return; }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) { setError('Only PDF, JPG, or PNG files are supported'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10 MB'); return; }

    startTransition(async () => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('transactionId', transactionId);
      const res = await fetch('/api/receipts/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? 'Upload failed');
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4">Attach receipt</h2>
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="mb-3 text-sm w-full" />
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cancel</button>
          <button onClick={submit} disabled={pending} className="px-3 py-1.5 text-sm bg-zinc-900 text-white rounded">
            {pending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/receipt-viewer-modal.tsx`**

```tsx
'use client';
import { useTransition } from 'react';
import { deleteReceipt } from '@/app/actions/receipts';

interface Props {
  transactionId: string;
  signedUrl: string;
  filename: string;
  contentType: string;
  onClose: () => void;
}

export function ReceiptViewerModal({ transactionId, signedUrl, filename, contentType, onClose }: Props) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteReceipt(transactionId);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-4 w-[90vw] max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium truncate">{filename}</span>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={pending} className="text-sm text-red-600 hover:underline">
              {pending ? 'Removing…' : 'Remove'}
            </button>
            <button onClick={onClose} className="text-sm border rounded px-2 py-0.5">Close</button>
          </div>
        </div>
        {contentType === 'application/pdf' ? (
          <iframe src={signedUrl} className="w-full h-[70vh] rounded border" title={filename} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} alt={filename} className="max-h-[70vh] mx-auto rounded" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create a client wrapper for transaction-row receipt interaction**

```tsx
// components/receipt-cell.tsx
'use client';
import { useState } from 'react';
import { ReceiptUploadModal } from './receipt-upload-modal';
import { ReceiptViewerModal } from './receipt-viewer-modal';

interface Props {
  transactionId: string;
  hasReceipt: boolean;
  signedUrl?: string;
  filename?: string;
  contentType?: string;
}

export function ReceiptCell({ transactionId, hasReceipt, signedUrl, filename, contentType }: Props) {
  const [mode, setMode] = useState<'upload' | 'view' | null>(null);

  return (
    <>
      <button
        onClick={() => setMode(hasReceipt ? 'view' : 'upload')}
        title={hasReceipt ? 'View receipt' : 'Attach receipt'}
        className={`text-base ${hasReceipt ? 'text-zinc-700' : 'text-zinc-300 hover:text-zinc-500'}`}
      >
        📎
      </button>
      {mode === 'upload' && (
        <ReceiptUploadModal transactionId={transactionId} onClose={() => setMode(null)} />
      )}
      {mode === 'view' && signedUrl && filename && contentType && (
        <ReceiptViewerModal
          transactionId={transactionId}
          signedUrl={signedUrl}
          filename={filename}
          contentType={contentType}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Modify the transaction list page to add `ReceiptCell`**

In `app/(authenticated)/accounts/[id]/transactions/page.tsx`:

Add import at the top:
```ts
import { getReceiptSignedUrl } from '@/lib/storage/get-signed-url';
import { ReceiptCell } from '@/components/receipt-cell';
```

After `getTransactions`, generate signed URLs for rows that have receipts:
```ts
const signedUrls = await Promise.all(
  displayRows.map(async r =>
    r.receiptObjectKey
      ? { id: r.id, url: await getReceiptSignedUrl(r.receiptObjectKey).catch(() => null) }
      : { id: r.id, url: null }
  )
);
const signedUrlMap = new Map(signedUrls.map(s => [s.id, s.url]));
```

In the table row JSX, add a receipt column after the balance cell:
```tsx
<td className="px-2 text-center">
  <ReceiptCell
    transactionId={row.id}
    hasReceipt={!!row.receiptObjectKey}
    signedUrl={signedUrlMap.get(row.id) ?? undefined}
    filename={row.receiptFilename ?? undefined}
    contentType={row.receiptContentType ?? undefined}
  />
</td>
```

Add a header `<th>` for the new column (align: center, label: empty or "📎").

- [ ] **Step 5: Replace the stub receipts page**

```tsx
// app/(authenticated)/income/receipts/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getReceiptsByFY } from '@/lib/db/queries/receipts';
import { getReceiptSignedUrl } from '@/lib/storage/get-signed-url';
import { fyBounds, currentFyYear } from '@/lib/domain/fy';
import Link from 'next/link';

interface Props { searchParams: Promise<Record<string, string>> }

const CURRENT_FY = currentFyYear();
const FY_RANGE = [CURRENT_FY, CURRENT_FY - 1, CURRENT_FY - 2];

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

export default async function ReceiptsPage({ searchParams }: Props) {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const sp = await searchParams;
  const fy = parseInt(sp['fy'] ?? String(CURRENT_FY), 10);
  const { start, end } = fyBounds(fy);
  const fyLabel = (y: number) => `FY ${y - 1}–${String(y).slice(2)}`;

  const receipts = await getReceiptsByFY(userId, start, end);
  const withUrls = await Promise.all(
    receipts.map(async r => ({
      ...r,
      signedUrl: await getReceiptSignedUrl(r.receiptObjectKey).catch(() => null),
    })),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Receipts</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {FY_RANGE.map(y => (
          <Link
            key={y}
            href={`/income/receipts?fy=${y}`}
            className={`px-3 py-1 rounded text-sm border ${fy === y ? 'bg-zinc-900 text-white border-zinc-900' : 'text-zinc-600 hover:border-zinc-400'}`}
          >
            {fyLabel(y)}
          </Link>
        ))}
      </div>

      {withUrls.length === 0 && (
        <p className="text-zinc-400 text-sm">No receipts for {fyLabel(fy)}. Attach receipts from the transaction list.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {withUrls.map(r => (
          <div key={r.id} className="border rounded p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <span className="text-sm font-medium truncate">{r.receiptFilename}</span>
              <span className="text-xs text-zinc-400 ml-2 shrink-0">
                {r.receiptContentType === 'application/pdf' ? '📄' : '🖼️'}
              </span>
            </div>
            <p className="text-xs text-zinc-500">{r.postedDate} · {r.descriptionRaw}</p>
            <p className="text-xs text-zinc-500">{fmt(r.amountCents)}</p>
            {r.signedUrl && (
              <a href={r.signedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                View receipt →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify end-to-end in browser**

1. Go to `/accounts/{id}/transactions`
2. Click an empty paperclip on any row → upload modal appears
3. Select a PNG or PDF ≤ 10 MB → Upload
4. Paperclip turns filled; navigate to `/income/receipts` → receipt card appears

- [ ] **Step 7: Commit**

```bash
git add \
  app/(authenticated)/income/receipts/page.tsx \
  app/(authenticated)/accounts/[id]/transactions/page.tsx \
  components/receipt-upload-modal.tsx \
  components/receipt-viewer-modal.tsx \
  components/receipt-cell.tsx
git commit -m "phase4/ui: receipts vault page + transaction list paperclip"
```

---

## Dependency order

```
Task 1 (schema)
  → Task 2 (payslip queries + FY util)
      → Task 3 (linking domain)
          → Task 4 (job + actions)
              → Task 7 (payslips page)   ← also needs Task 6
      → Task 5 (income summary queries)
          → Task 8 (dashboard)           ← also needs Task 6
  → Task 9 (WFH queries + actions)
      → Task 10 (WFH page)               ← also needs Task 6
  → Task 11 (receipt upload endpoint)
      → Task 12 (receipts queries)
          → Task 13 (vault + paperclip)  ← also needs Task 6

Task 6 (layout + nav) — no data deps, can run in parallel with Tasks 2–5
```
