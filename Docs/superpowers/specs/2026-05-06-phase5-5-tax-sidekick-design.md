# Phase 5.5 — Tax Sidekick: Design Spec

## Scope

Three deferred items from Phase 5:

1. **Super cap monitor** — track concessional super contributions against the $27,500 FY cap, with payslip breakdown and end-of-year projection
2. **Donation tracker** — aggregate DGR-registered donation transactions by FY, with a transaction list
3. **Tax obligation calendar events** — nightly job that inserts ATO due dates into `expected_events` so they appear on the existing runway calendar

**Out of scope:** Tax deductions beyond donations (WFH, work tools, motor vehicle), tax return lodgement, carry-forward contributions, FY selector UI. These can follow in a later phase.

---

## Routes & Navigation

New top-nav entry **Tax** added between Plan and Runway.

| Route | Page |
|---|---|
| `/tax` | Redirects to `/tax/super` |
| `/tax/super` | Super cap monitor |
| `/tax/donations` | Donation tracker |

`app/(authenticated)/tax/layout.tsx` — sub-nav with Super / Donations tabs, active state via `headers().get('x-pathname')`, same pattern as `/plan/layout.tsx`.

Tax obligation dates appear on the existing `/runway/calendar` automatically — no new UI route.

---

## Super Cap Monitor — `/tax/super`

Server component. Financial year = 1 July – 30 June (current FY, hardcoded for V1).

### Cap Meter

Progress bar: `totalContributed / 27_500_000_cents`. Displays:
- Contributed so far (e.g. "$17,050")
- Remaining headroom (e.g. "$10,450 remaining")
- Percentage used

The $27,500 concessional cap is a hardcoded constant — `CAP_CENTS = 2_750_000n`. It rarely changes and doesn't warrant a user-configurable setting for V1.

### Per-Payslip Breakdown

Table ordered by payslip date ascending. Columns:

| Date | Employer super | Salary sacrifice | Running total |
|---|---|---|---|
| 28 Jan 2026 | $1,150 | $0 | $1,150 |
| 28 Feb 2026 | $1,150 | $500 | $2,800 |

Both columns shown even if salary sacrifice is always zero — keeps data traceable to source.

### End-of-FY Projection

```
weeksElapsed = max(1, weeksSince(fyStart))
weeklyAvg = totalContributed / weeksElapsed
projectedTotal = weeklyAvg × totalWeeksInFY
```

Display: "At current pace you'll contribute ~$X by 30 June."

If `projectedTotal > CAP_CENTS`: amber callout — "You're on track to exceed the concessional cap." Information only — no advice framing.

If `projectedTotal <= 0`: omit projection (no payslips yet this FY).

### Empty State

"No payslips found for FY 2025–26. Upload payslips on the Income page to track your super contributions."

---

## Donation Tracker — `/tax/donations`

Server component. Same FY scope as super (current FY).

### FY Total

Large headline: total sum of all donation transactions this FY (displayed as positive dollars).
Subtitle: "X transactions · DGR-registered only · FY 2025–26"

Source: transactions joined with categories where `categories.deduction_kind = 'donation'` and `transactions.date` is within the current FY. Transaction amounts are negative in the DB; displayed as positive values.

### Transaction List

Chronological, most recent first. Per row:
- Date
- Merchant name (fall back to transaction description if no merchant)
- Amount (positive display)

No edit controls — categorisation is managed in the Transactions view.

### Empty State

"No donations categorised this FY. Transactions categorised as 'Donations — DGR-registered' will appear here automatically."

---

## Tax Obligation Calendar Events

### Job: `lib/jobs/tax-obligations.ts`

A pg-boss handler registered alongside existing nightly jobs. Runs nightly.

**Re-materialisation contract** (matches existing pattern):
1. Delete all `expected_events` where `source = 'tax_obligation'` AND `status = 'pending'` AND `expected_date >= current_date`
2. Insert fresh rows for a rolling 18-month window (today → today + 18 months)

Snoozed, dismissed, matched, and superseded rows survive.

**Events inserted per FY, per user:**

| Description | Date | `expected_amount_cents` |
|---|---|---|
| Q1 BAS due | 28 October | 0 |
| Q2 BAS due | 28 February | 0 |
| Q3 BAS due | 28 April | 0 |
| Q4 BAS due | 28 July | 0 |
| End of financial year | 30 June | 0 |
| Tax return due | 31 October | 0 |

Amount is 0 — these are planning anchors, not cash flow events.

The job iterates over all users (respects multi-tenant schema) and inserts per-user rows.

**Row structure:**
```ts
{
  userId,
  source: 'tax_obligation',
  status: 'pending',
  description: 'Q1 BAS due',       // human-readable
  expectedDate: '2026-10-28',
  expectedAmountCents: 0n,
  confidence: 1.0,                  // certain dates
  recurrenceGroupId: null,
  snoozedUntil: null,
}
```

The runway calendar renders `expected_events` regardless of source — no changes to the calendar UI are needed.

---

## Data Queries

### `lib/db/queries/tax.ts`

```ts
// Super cap
getSuperCapData(userId: string, fyStart: Date, fyEnd: Date): Promise<{
  rows: Array<{
    payslipId: string
    date: string
    superCents: Cents
    salarySacrificeCents: Cents
    runningTotalCents: Cents
  }>
  totalSuperCents: Cents
  totalSalarySacrificeCents: Cents
}>

// Donations
getDonationData(userId: string, fyStart: Date, fyEnd: Date): Promise<{
  rows: Array<{
    transactionId: string
    date: string
    merchantName: string | null
    description: string
    amountCents: Cents        // stored negative; query returns absolute value
  }>
  totalCents: Cents
}>
```

Both functions use `withUser(userId, fn)` for RLS context.

**FY helpers** (shared, in `lib/utils/fy.ts`):

```ts
// Returns { start: Date, end: Date } for the Australian FY containing `date`
function currentFY(date?: Date): { start: Date; end: Date }

// Formats FY as "2025–26"
function fyLabel(start: Date): string
```

---

## Components & Files

| File | Type | Purpose |
|---|---|---|
| `components/nav.tsx` | Modify | Add Tax link between Plan and Runway |
| `app/(authenticated)/tax/page.tsx` | Create | Redirect to /tax/super |
| `app/(authenticated)/tax/layout.tsx` | Create | Super / Donations sub-nav |
| `app/(authenticated)/tax/super/page.tsx` | Create | Super cap monitor server component |
| `app/(authenticated)/tax/donations/page.tsx` | Create | Donation tracker server component |
| `lib/db/queries/tax.ts` | Create | getSuperCapData, getDonationData |
| `lib/utils/fy.ts` | Create | currentFY, fyLabel helpers |
| `lib/jobs/tax-obligations.ts` | Create | Nightly pg-boss job for tax dates |
| `tests/unit/utils/fy.test.ts` | Create | Unit tests for FY helpers |
| `tests/integration/db/queries/tax.test.ts` | Create | Integration tests for tax queries |

No schema migrations required — all data already exists in `payslips`, `transactions`, `categories`, and `expected_events`.

---

## Testing

- `tests/unit/utils/fy.test.ts` — `currentFY` edge cases: 30 June, 1 July, leap years, explicit date input
- `tests/integration/db/queries/tax.test.ts` — `getSuperCapData`: multiple payslips sum correctly; `getDonationData`: only `deduction_kind = 'donation'` transactions included, amounts positive
- Tax obligations job: integration test that verifies idempotency (run twice → same rows), rolling window logic, snoozed rows survive re-materialisation

---

## Tone

Information, not advice. All projections use "at current pace" framing, not "you should." Cap warnings say "you're on track to exceed" not "you will exceed" — projection, not certainty.
