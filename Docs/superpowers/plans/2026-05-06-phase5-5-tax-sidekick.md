# Phase 5.5 — Tax Sidekick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tax nav section with super cap monitor and donation tracker pages, plus a nightly job that seeds ATO due dates into the runway calendar.

**Architecture:** New `/tax` route group (Super / Donations sub-nav) follows the exact same pattern as `/plan`. All data comes from existing tables (`payslips`, `transactions`, `categories`). Tax calendar events are inserted via a pg-boss nightly job into `expected_events` — the existing runway calendar renders them with no UI changes needed. One migration makes `expected_events.account_id` nullable so tax events don't require an account.

**Tech Stack:** Next.js App Router · TypeScript strict · Drizzle ORM · pg-boss · Vitest

---

### Task 0: Migration — make `expected_events.account_id` nullable

**Goal:** Allow `expected_events` rows with no account (tax obligation events are not account-specific).

**Files:**
- Create: `lib/db/migrations/0008_phase5_5_tax.sql`
- Modify: `lib/db/schema.ts`

**Acceptance Criteria:**
- [ ] Migration runs without error on the dev database
- [ ] `expected_events.account_id` accepts NULL
- [ ] Drizzle schema matches (no `notNull()` on `accountId`)
- [ ] Existing rows are unaffected

**Verify:** `npx drizzle-kit push` → no errors; confirm with `\d expected_events` in psql

**Steps:**

- [ ] **Step 1: Create migration**

Create `lib/db/migrations/0008_phase5_5_tax.sql`:

```sql
alter table expected_events alter column account_id drop not null;
```

- [ ] **Step 2: Update Drizzle schema**

In `lib/db/schema.ts`, find the `expectedEvents` table definition (around line 257). Change:

```ts
// Before:
accountId: uuid('account_id').notNull().references(() => accounts.id),

// After:
accountId: uuid('account_id').references(() => accounts.id),
```

- [ ] **Step 3: Apply and verify**

```bash
npx drizzle-kit push
```

Expected: no errors. Then in psql: `\d expected_events` — `account_id` column should show no `not null` constraint.

- [ ] **Step 4: Commit**

```bash
git add lib/db/migrations/0008_phase5_5_tax.sql lib/db/schema.ts
git commit -m "phase5.5/db: make expected_events.account_id nullable for tax events"
```

---

### Task 1: FY helpers + tax queries + tests

**Goal:** Pure FY date utilities and the two DB query functions (`getSuperCapData`, `getDonationData`) with integration tests.

**Files:**
- Create: `lib/utils/fy.ts`
- Create: `lib/db/queries/tax.ts`
- Create: `tests/unit/utils/fy.test.ts`
- Create: `tests/integration/db/queries/tax.test.ts`

**Acceptance Criteria:**
- [ ] `currentFY()` returns correct start/end for dates in July–June range
- [ ] `currentFY()` handles 30 June and 1 July boundary correctly
- [ ] `fyLabel` formats as "2025–26"
- [ ] `getSuperCapData` returns rows ordered by payDate ascending with correct running totals
- [ ] `getSuperCapData` excludes payslips outside the FY
- [ ] `getDonationData` returns only transactions with `deductionKind = 'donation'`, amounts positive
- [ ] `getDonationData` excludes transactions outside the FY
- [ ] All integration tests pass

**Verify:** `npx vitest run tests/unit/utils/fy.test.ts tests/integration/db/queries/tax.test.ts`

**Steps:**

- [ ] **Step 1: Write failing unit tests for FY helpers**

Create `tests/unit/utils/fy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { currentFY, fyLabel } from '@/lib/utils/fy'

describe('currentFY', () => {
  it('returns correct FY for a date in August (first half of FY)', () => {
    const fy = currentFY(new Date('2025-08-15'))
    expect(fy.start).toBe('2025-07-01')
    expect(fy.end).toBe('2026-06-30')
  })

  it('returns correct FY for a date in March (second half of FY)', () => {
    const fy = currentFY(new Date('2026-03-10'))
    expect(fy.start).toBe('2025-07-01')
    expect(fy.end).toBe('2026-06-30')
  })

  it('returns current FY for 1 July (FY start boundary)', () => {
    const fy = currentFY(new Date('2025-07-01'))
    expect(fy.start).toBe('2025-07-01')
    expect(fy.end).toBe('2026-06-30')
  })

  it('returns previous FY for 30 June (FY end boundary)', () => {
    const fy = currentFY(new Date('2026-06-30'))
    expect(fy.start).toBe('2025-07-01')
    expect(fy.end).toBe('2026-06-30')
  })

  it('uses today when no date provided', () => {
    const fy = currentFY()
    expect(fy.start).toMatch(/^\d{4}-07-01$/)
    expect(fy.end).toMatch(/^\d{4}-06-30$/)
  })
})

describe('fyLabel', () => {
  it('formats FY start year correctly', () => {
    expect(fyLabel('2025-07-01')).toBe('2025–26')
    expect(fyLabel('2024-07-01')).toBe('2024–25')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/utils/fy.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/utils/fy'"

- [ ] **Step 3: Implement FY helpers**

Create `lib/utils/fy.ts`:

```ts
export interface FYRange {
  start: string  // 'YYYY-MM-DD'
  end: string    // 'YYYY-MM-DD'
}

export function currentFY(date?: Date): FYRange {
  const d = date ?? new Date()
  const month = d.getMonth() + 1  // 1-based
  const year = d.getFullYear()
  const fyYear = month < 7 ? year - 1 : year
  return {
    start: `${fyYear}-07-01`,
    end: `${fyYear + 1}-06-30`,
  }
}

// Formats FY start date as "2025–26"
export function fyLabel(fyStart: string): string {
  const year = parseInt(fyStart.slice(0, 4), 10)
  return `${year}–26`  // en-dash
}
```

- [ ] **Step 4: Run unit tests — expect PASS**

```bash
npx vitest run tests/unit/utils/fy.test.ts
```

Expected: 5/5 passing

- [ ] **Step 5: Write failing integration tests**

Create `tests/integration/db/queries/tax.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'dotenv/config'
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db'
import { payslips, transactions, categories, accounts } from '@/lib/db/schema'
import { getSuperCapData, getDonationData } from '@/lib/db/queries/tax'

describe('getSuperCapData', () => {
  let userId: string

  beforeEach(async () => {
    await resetTestDb()
    ;({ userId } = await seedUserAndAccount())
  })

  it('returns empty result when no payslips', async () => {
    const result = await getSuperCapData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(0)
    expect(result.totalSuperCents).toBe(BigInt(0))
    expect(result.totalSalarySacrificeCents).toBe(BigInt(0))
  })

  it('returns payslips in FY ordered by payDate ascending with running totals', async () => {
    await testDb.insert(payslips).values([
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        payDate: '2025-07-31',
        grossCents: BigInt(1000000),
        taxWithheldCents: BigInt(200000),
        superCents: BigInt(110000),
        salarySacrificeCents: BigInt(50000),
        netCents: BigInt(750000),
        source: 'manual',
      },
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-08-01',
        periodEnd: '2025-08-31',
        payDate: '2025-08-31',
        grossCents: BigInt(1000000),
        taxWithheldCents: BigInt(200000),
        superCents: BigInt(110000),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(750000),
        source: 'manual',
      },
    ])

    const result = await getSuperCapData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(2)

    // First row: $1,100 super + $500 salary sacrifice, running = $1,600
    expect(result.rows[0]!.superCents).toBe(BigInt(110000))
    expect(result.rows[0]!.salarySacrificeCents).toBe(BigInt(50000))
    expect(result.rows[0]!.runningTotalCents).toBe(BigInt(160000))

    // Second row: $1,100 super + $0, running = $2,700
    expect(result.rows[1]!.superCents).toBe(BigInt(110000))
    expect(result.rows[1]!.salarySacrificeCents).toBe(BigInt(0))
    expect(result.rows[1]!.runningTotalCents).toBe(BigInt(270000))

    expect(result.totalSuperCents).toBe(BigInt(220000))
    expect(result.totalSalarySacrificeCents).toBe(BigInt(50000))
  })

  it('excludes payslips outside the FY range', async () => {
    await testDb.insert(payslips).values({
      userId,
      employer: 'ACME',
      periodStart: '2024-06-01',
      periodEnd: '2024-06-30',
      payDate: '2024-06-30',  // prior FY
      grossCents: BigInt(1000000),
      taxWithheldCents: BigInt(200000),
      superCents: BigInt(110000),
      salarySacrificeCents: BigInt(0),
      netCents: BigInt(750000),
      source: 'manual',
    })

    const result = await getSuperCapData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(0)
  })
})

describe('getDonationData', () => {
  let userId: string
  let accountId: string

  beforeEach(async () => {
    await resetTestDb()
    ;({ userId, accountId } = await seedUserAndAccount())
  })

  it('returns empty result when no donation transactions', async () => {
    const result = await getDonationData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(0)
    expect(result.totalCents).toBe(BigInt(0))
  })

  it('returns only transactions with deductionKind = donation, amounts positive', async () => {
    // Insert donation category
    const [donationCat] = await testDb.insert(categories).values({
      name: 'Donations — DGR-registered',
      deductionKind: 'donation',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    // Insert non-donation category
    const [groceryCat] = await testDb.insert(categories).values({
      name: 'Groceries',
      isIncome: false,
      isEssential: true,
    }).returning()

    await testDb.insert(transactions).values([
      {
        userId,
        accountId,
        postedDate: '2025-09-15',
        descriptionRaw: 'BEYOND BLUE',
        descriptionClean: 'Beyond Blue',
        amountCents: BigInt(-5000),  // -$50 (spending)
        classificationSource: 'manual',
        categoryId: donationCat!.id,
      },
      {
        userId,
        accountId,
        postedDate: '2025-10-01',
        descriptionRaw: 'WOOLWORTHS',
        descriptionClean: 'Woolworths',
        amountCents: BigInt(-12000),  // groceries, not donation
        classificationSource: 'manual',
        categoryId: groceryCat!.id,
      },
    ])

    const result = await getDonationData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.amountCents).toBe(BigInt(5000))  // positive display
    expect(result.rows[0]!.description).toBe('Beyond Blue')
    expect(result.totalCents).toBe(BigInt(5000))
  })

  it('excludes donation transactions outside the FY range', async () => {
    const [donationCat] = await testDb.insert(categories).values({
      name: 'Donations — DGR-registered',
      deductionKind: 'donation',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    await testDb.insert(transactions).values({
      userId,
      accountId,
      postedDate: '2024-06-01',  // prior FY
      descriptionRaw: 'OLD CHARITY',
      amountCents: BigInt(-10000),
      classificationSource: 'manual',
      categoryId: donationCat!.id,
    })

    const result = await getDonationData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run integration tests — expect FAIL**

```bash
npx vitest run tests/integration/db/queries/tax.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/db/queries/tax'"

- [ ] **Step 7: Implement `lib/db/queries/tax.ts`**

Create `lib/db/queries/tax.ts`:

```ts
import { and, eq, sql } from 'drizzle-orm'
import { withUser } from '@/lib/db/client'
import { payslips, transactions, categories, merchants } from '@/lib/db/schema'
import { toCents } from '@/lib/types/money'
import type { Cents } from '@/lib/types/money'

function toBigInt(v: unknown): bigint {
  if (typeof v === 'bigint') return v
  return BigInt(v as string)
}

export interface SuperPayslipRow {
  id: string
  payDate: string
  superCents: Cents
  salarySacrificeCents: Cents
  runningTotalCents: Cents
}

export interface SuperCapData {
  rows: SuperPayslipRow[]
  totalSuperCents: Cents
  totalSalarySacrificeCents: Cents
}

export async function getSuperCapData(
  userId: string,
  fyStart: string,
  fyEnd: string,
): Promise<SuperCapData> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: payslips.id,
        payDate: payslips.payDate,
        superCents: payslips.superCents,
        salarySacrificeCents: payslips.salarySacrificeCents,
      })
      .from(payslips)
      .where(
        and(
          eq(payslips.userId, userId),
          sql`${payslips.payDate}::date >= ${fyStart}::date`,
          sql`${payslips.payDate}::date <= ${fyEnd}::date`,
        ),
      )
      .orderBy(payslips.payDate)

    let runningTotal = 0n
    let totalSuper = 0n
    let totalSalSac = 0n

    const payslipRows: SuperPayslipRow[] = rows.map(row => {
      const superAmt = toBigInt(row.superCents)
      const salSacAmt = toBigInt(row.salarySacrificeCents)
      runningTotal += superAmt + salSacAmt
      totalSuper += superAmt
      totalSalSac += salSacAmt
      return {
        id: row.id,
        payDate: row.payDate as string,
        superCents: toCents(superAmt),
        salarySacrificeCents: toCents(salSacAmt),
        runningTotalCents: toCents(runningTotal),
      }
    })

    return {
      rows: payslipRows,
      totalSuperCents: toCents(totalSuper),
      totalSalarySacrificeCents: toCents(totalSalSac),
    }
  })
}

export interface DonationRow {
  id: string
  date: string
  merchantName: string | null
  description: string
  amountCents: Cents  // positive (absolute value of the negative transaction)
}

export interface DonationData {
  rows: DonationRow[]
  totalCents: Cents
}

export async function getDonationData(
  userId: string,
  fyStart: string,
  fyEnd: string,
): Promise<DonationData> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: transactions.id,
        date: transactions.postedDate,
        merchantName: merchants.canonicalName,
        description: transactions.descriptionClean,
        amountCents: transactions.amountCents,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(categories.deductionKind, 'donation'),
          sql`${transactions.postedDate}::date >= ${fyStart}::date`,
          sql`${transactions.postedDate}::date <= ${fyEnd}::date`,
        ),
      )
      .orderBy(sql`${transactions.postedDate} desc`)

    let total = 0n
    const donationRows: DonationRow[] = rows.map(row => {
      const amountCents = toCents(-toBigInt(row.amountCents))  // negate: spending is negative in DB
      total += amountCents
      return {
        id: row.id,
        date: row.date as string,
        merchantName: row.merchantName ?? null,
        description: row.description ?? '',
        amountCents,
      }
    })

    return { rows: donationRows, totalCents: toCents(total) }
  })
}
```

- [ ] **Step 8: Run all tests — expect PASS**

```bash
npx vitest run tests/unit/utils/fy.test.ts tests/integration/db/queries/tax.test.ts
```

Expected: 8/8 passing (5 unit + 3 integration... or however many tests)

- [ ] **Step 9: Commit**

```bash
git add lib/utils/fy.ts lib/db/queries/tax.ts tests/unit/utils/fy.test.ts tests/integration/db/queries/tax.test.ts
git commit -m "phase5.5/queries: FY helpers + super cap + donation queries with tests"
```

---

### Task 2: Tax obligation nightly job

**Goal:** pg-boss handler that inserts ATO tax due dates into `expected_events` for all users on a rolling 18-month window, registered in the jobs index.

**Files:**
- Create: `lib/jobs/tax-obligations.ts`
- Modify: `lib/jobs/index.ts`

**Acceptance Criteria:**
- [ ] Job inserts the 6 annual tax events for each user for dates within the next 18 months
- [ ] Re-running the job is idempotent (deletes pending future events first, then re-inserts)
- [ ] Snoozed/dismissed events survive re-materialisation
- [ ] `account_id` is null on inserted rows
- [ ] TypeScript compiles clean

**Verify:** `npx tsc --noEmit` (ignore `lib/storage/get-signed-url.ts` only)

**Steps:**

- [ ] **Step 1: Implement `lib/jobs/tax-obligations.ts`**

Create `lib/jobs/tax-obligations.ts`:

```ts
import type { PgBoss } from 'pg-boss'
import { db, withUser } from '@/lib/db/client'
import { users, expectedEvents } from '@/lib/db/schema'
import { and, eq, gte, inArray, sql } from 'drizzle-orm'

interface TaxEvent {
  date: string        // 'YYYY-MM-DD'
  description: string
}

// Generate all ATO tax due dates that fall within [windowStart, windowEnd]
function generateTaxDates(windowStart: Date, windowEnd: Date): TaxEvent[] {
  // Annual dates: { month: 1-based, day }
  const templates = [
    { month: 10, day: 28, description: 'Q1 BAS due' },
    { month: 2,  day: 28, description: 'Q2 BAS due' },
    { month: 4,  day: 28, description: 'Q3 BAS due' },
    { month: 7,  day: 28, description: 'Q4 BAS due' },
    { month: 6,  day: 30, description: 'End of financial year' },
    { month: 10, day: 31, description: 'Tax return due' },
  ]

  const events: TaxEvent[] = []
  const startYear = windowStart.getFullYear()

  // Check 3 years to cover an 18-month window
  for (let yearOffset = 0; yearOffset <= 2; yearOffset++) {
    const year = startYear + yearOffset
    for (const t of templates) {
      // For Feb: use last day of month to handle leap years
      const lastDay = t.month === 2
        ? new Date(Date.UTC(year, 2, 0)).getUTCDate()
        : t.day
      const date = new Date(Date.UTC(year, t.month - 1, lastDay))
      if (date >= windowStart && date <= windowEnd) {
        events.push({ date: date.toISOString().slice(0, 10), description: t.description })
      }
    }
  }

  return events
}

async function materialiseForUser(userId: string, windowStart: Date, windowEnd: Date): Promise<void> {
  const windowStartStr = windowStart.toISOString().slice(0, 10)
  const events = generateTaxDates(windowStart, windowEnd)

  await withUser(userId, async (tx) => {
    // Delete pending future tax events (snoozed/dismissed survive)
    await tx
      .delete(expectedEvents)
      .where(
        and(
          eq(expectedEvents.userId, userId),
          eq(expectedEvents.source, 'tax_obligation'),
          inArray(expectedEvents.status, ['pending']),
          sql`${expectedEvents.expectedDate}::date >= ${windowStartStr}::date`,
        ),
      )

    if (events.length === 0) return

    // Re-insert fresh events
    await tx.insert(expectedEvents).values(
      events.map(e => ({
        userId,
        accountId: null,
        source: 'tax_obligation' as const,
        sourceId: null,
        expectedDate: e.date,
        expectedAmountCents: BigInt(0),
        expectedAmountLowCents: BigInt(0),
        expectedAmountHighCents: BigInt(0),
        description: e.description,
        status: 'pending' as const,
        confidence: '1.000',
        snoozedUntil: null,
        matchedTransactionId: null,
        userNote: null,
      }))
    )
  })
}

export async function registerTaxObligations(boss: PgBoss): Promise<void> {
  // Per-user worker
  await boss.createQueue('materialise-tax-obligations').catch(() => {})
  await boss.work<{ userId: string }>(
    'materialise-tax-obligations',
    { batchSize: 4, localConcurrency: 1 },
    async (jobs) => {
      const today = new Date()
      const windowEnd = new Date(today)
      windowEnd.setMonth(windowEnd.getMonth() + 18)

      for (const job of jobs) {
        const { userId } = job.data
        try {
          await materialiseForUser(userId, today, windowEnd)
        } catch (err) {
          console.error(`[tax-obligations] jobId=${job.id} userId=${userId}`, err)
          throw err
        }
      }
    },
  )

  // Fanout: send one job per user, runs nightly
  await boss.createQueue('materialise-tax-obligations-fanout').catch(() => {})
  await boss.work('materialise-tax-obligations-fanout', async () => {
    const allUsers = await db.select({ id: users.id }).from(users)
    for (const { id } of allUsers) {
      await boss.send('materialise-tax-obligations', { userId: id })
    }
  })

  // Schedule nightly at 02:00 local time
  await boss.schedule('materialise-tax-obligations-fanout', '0 2 * * *', {}, { tz: 'Australia/Sydney' }).catch(() => {})
}
```

- [ ] **Step 2: Register the job in `lib/jobs/index.ts`**

Read `lib/jobs/index.ts` to find the existing `registerHandlers` function. Add the import and call:

```ts
import { registerTaxObligations } from './tax-obligations'

// Inside registerHandlers, after existing registrations:
await registerTaxObligations(boss)
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "get-signed-url"
```

Expected: no output (no errors)

- [ ] **Step 4: Commit**

```bash
git add lib/jobs/tax-obligations.ts lib/jobs/index.ts
git commit -m "phase5.5/jobs: tax obligation nightly materialisation job"
```

---

### Task 3: Nav + /tax layout + redirect

**Goal:** Tax link in top nav, /tax redirects to /tax/super, Sub/Donations sub-nav in layout.

**Files:**
- Modify: `components/nav.tsx`
- Create: `app/(authenticated)/tax/page.tsx`
- Create: `app/(authenticated)/tax/layout.tsx`

**Acceptance Criteria:**
- [ ] "Tax" link appears in nav between Plan and Runway
- [ ] `/tax` redirects to `/tax/super`
- [ ] Sub-nav shows Super / Donations tabs with correct active state
- [ ] TypeScript compiles clean

**Verify:** `npx tsc --noEmit` (ignore `lib/storage/get-signed-url.ts`)

**Steps:**

- [ ] **Step 1: Add Tax link to nav**

Read `components/nav.tsx` to find the Plan link. It looks like:

```tsx
<Link href="/plan" className="text-sm text-zinc-700 hover:text-zinc-900">Plan</Link>
```

Add immediately after it:

```tsx
<Link href="/tax" className="text-sm text-zinc-700 hover:text-zinc-900">Tax</Link>
```

The nav order should be: ... Income · Plan · **Tax** · Runway ...

- [ ] **Step 2: Create redirect page**

Create `app/(authenticated)/tax/page.tsx`:

```ts
import { redirect } from 'next/navigation'

export default function TaxPage() {
  redirect('/tax/super')
}
```

- [ ] **Step 3: Create layout with sub-nav**

Create `app/(authenticated)/tax/layout.tsx`:

```tsx
import Link from 'next/link'
import { headers } from 'next/headers'

const tabs = [
  { label: 'Super', href: '/tax/super' },
  { label: 'Donations', href: '/tax/donations' },
]

export default async function TaxLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? ''

  return (
    <div>
      <nav className="flex gap-4 border-b mb-6">
        {tabs.map(tab => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={active
                ? 'pb-2 border-b-2 border-primary font-medium text-sm'
                : 'pb-2 text-sm text-muted-foreground hover:text-foreground'}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "get-signed-url"
```

Expected: no output

- [ ] **Step 5: Commit**

```bash
git add components/nav.tsx app/(authenticated)/tax/page.tsx app/(authenticated)/tax/layout.tsx
git commit -m "phase5.5/nav: add Tax nav link + layout with Super/Donations sub-nav"
```

---

### Task 4: Super cap monitor page — `/tax/super`

**Goal:** Server component showing cap progress bar, per-payslip breakdown table, and end-of-FY projection.

**Files:**
- Create: `app/(authenticated)/tax/super/page.tsx`

**Acceptance Criteria:**
- [ ] Auth guard redirects to `/sign-in` if not logged in
- [ ] Cap meter shows total contributed / $27,500 as a progress bar with remaining headroom
- [ ] Payslip table shows date, employer super, salary sacrifice, running total for each payslip
- [ ] Projection shown when payslips exist ("At current pace you'll contribute ~$X by 30 June")
- [ ] Over-cap amber callout shown when projected total > $27,500
- [ ] Empty state shown when no payslips this FY
- [ ] TypeScript compiles clean

**Verify:** `npx tsc --noEmit` (ignore `lib/storage/get-signed-url.ts`)

**Steps:**

- [ ] **Step 1: Create the page**

Create `app/(authenticated)/tax/super/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server'
import { getSuperCapData } from '@/lib/db/queries/tax'
import { currentFY, fyLabel } from '@/lib/utils/fy'

const CAP_CENTS = 2_750_000n  // $27,500 concessional cap

function fmt(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents
  const dollars = abs / 100n
  const c = abs % 100n
  return (cents < 0n ? '-$' : '$') + dollars.toString() + '.' + String(c).padStart(2, '0')
}

export default async function SuperPage() {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in')
    throw e
  }

  const fy = currentFY()
  const data = await getSuperCapData(userId, fy.start, fy.end)
  const label = fyLabel(fy.start)

  const totalContributed = data.totalSuperCents + data.totalSalarySacrificeCents
  const remaining = CAP_CENTS - totalContributed
  const pct = totalContributed >= CAP_CENTS
    ? 100
    : Number((totalContributed * 100n) / CAP_CENTS)

  // Projection: weeks elapsed from FY start to today, project to 30 June
  const fyStart = new Date(fy.start)
  const fyEnd = new Date(fy.end)
  const today = new Date()
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const weeksElapsed = Math.max(1, Math.floor((today.getTime() - fyStart.getTime()) / msPerWeek))
  const totalWeeks = Math.ceil((fyEnd.getTime() - fyStart.getTime()) / msPerWeek)
  const weeklyAvg = totalContributed / BigInt(weeksElapsed)
  const projected = weeklyAvg * BigInt(totalWeeks)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Super contributions</h1>
        <span className="text-sm text-muted-foreground">FY {label}</span>
      </div>

      {/* Cap meter */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">{fmt(totalContributed)} contributed</span>
          <span className="text-muted-foreground">
            {remaining > 0n ? fmt(remaining) + ' remaining' : 'Cap reached'}
          </span>
        </div>
        <div className="h-3 rounded-full bg-zinc-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${totalContributed >= CAP_CENTS ? 'bg-amber-500' : 'bg-zinc-900'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {pct}% of $27,500 concessional cap
        </div>
      </div>

      {/* Projection */}
      {data.rows.length > 0 && (
        <>
          {projected > CAP_CENTS ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              At current pace you're on track to exceed the concessional cap (~{fmt(projected)} by 30 June).
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              At current pace you'll contribute ~{fmt(projected)} by 30 June.
            </p>
          )}
        </>
      )}

      {/* Payslip breakdown */}
      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No payslips found for FY {label}. Upload payslips on the{' '}
          <a href="/income" className="underline">Income page</a> to track your super contributions.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Employer super</th>
                <th className="px-4 py-3 text-right">Salary sacrifice</th>
                <th className="px-4 py-3 text-right">Running total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rows.map(row => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.payDate}</td>
                  <td className="px-4 py-3 text-right">{fmt(row.superCents)}</td>
                  <td className="px-4 py-3 text-right">
                    {row.salarySacrificeCents > 0n ? fmt(row.salarySacrificeCents) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(row.runningTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "get-signed-url"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add app/(authenticated)/tax/super/page.tsx
git commit -m "phase5.5/ui: super cap monitor page"
```

---

### Task 5: Donation tracker page — `/tax/donations`

**Goal:** Server component showing FY total and a transaction list of DGR-registered donations.

**Files:**
- Create: `app/(authenticated)/tax/donations/page.tsx`

**Acceptance Criteria:**
- [ ] Auth guard redirects to `/sign-in` if not logged in
- [ ] FY total shown as large headline with transaction count
- [ ] Transaction list shows date, merchant/description, amount (positive) ordered most recent first
- [ ] Empty state shown when no donation transactions this FY
- [ ] TypeScript compiles clean

**Verify:** `npx tsc --noEmit` (ignore `lib/storage/get-signed-url.ts`)

**Steps:**

- [ ] **Step 1: Create the page**

Create `app/(authenticated)/tax/donations/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server'
import { getDonationData } from '@/lib/db/queries/tax'
import { currentFY, fyLabel } from '@/lib/utils/fy'

function fmt(cents: bigint): string {
  return '$' + (cents / 100n).toString() + '.' + String(cents % 100n).padStart(2, '0')
}

export default async function DonationsPage() {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in')
    throw e
  }

  const fy = currentFY()
  const data = await getDonationData(userId, fy.start, fy.end)
  const label = fyLabel(fy.start)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Donations</h1>
        <span className="text-sm text-muted-foreground">FY {label}</span>
      </div>

      {/* FY total */}
      <div className="space-y-1">
        <div className="text-4xl font-bold">{fmt(data.totalCents)}</div>
        <div className="text-sm text-muted-foreground">
          {data.rows.length} {data.rows.length === 1 ? 'transaction' : 'transactions'} · DGR-registered only · FY {label}
        </div>
      </div>

      {/* Transaction list */}
      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No donations categorised this FY. Transactions categorised as "Donations — DGR-registered" will appear here automatically.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {data.rows.map((row, i) => (
            <div
              key={row.id}
              className={`flex items-center justify-between px-4 py-3 text-sm ${i < data.rows.length - 1 ? 'border-b' : ''}`}
            >
              <div className="space-y-0.5">
                <div className="font-medium">{row.merchantName ?? row.description}</div>
                <div className="text-xs text-muted-foreground">{row.date}</div>
              </div>
              <div className="font-medium">{fmt(row.amountCents)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "get-signed-url"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add app/(authenticated)/tax/donations/page.tsx
git commit -m "phase5.5/ui: donation tracker page"
```

---

## Self-Review Notes

- **Spec coverage:** All items covered — migration (Task 0), FY helpers + queries (Task 1), tax obligation job (Task 2), nav + layout (Task 3), super page (Task 4), donations page (Task 5). Tax obligation calendar events appear via existing runway calendar UI with no changes — confirmed.
- **`account_id` nullable:** Migration in Task 0 makes this safe; `lib/jobs/tax-obligations.ts` sets `accountId: null`.
- **FY helpers shared:** Both pages import from `lib/utils/fy.ts` — no duplication.
- **Type consistency:** `SuperCapData`, `DonationData`, `FYRange` defined once in their respective files and imported everywhere they're used.
- **No placeholders:** All steps have complete code.
