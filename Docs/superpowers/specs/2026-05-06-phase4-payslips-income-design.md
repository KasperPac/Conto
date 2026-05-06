# Phase 4 — Payslips & Income Design

**Date:** 2026-05-06
**Status:** Approved
**Phase:** 4 — Payslips & Income

---

## 1. Overview

Phase 4 delivers the income side of Conto: connecting payslips to bank deposits, surfacing an income dashboard, tracking WFH hours for the ATO's PCG 2023/1 deduction, and providing a receipts vault. Manual payslip entry was completed in Phase 2.5; this phase focuses on linking, visualisation, and tax tooling.

**Done when:** the user has a full income picture independent of bank deposits — gross, tax withheld, super, and net are all visible, payslip deposits are identified in the transaction list, WFH deduction is tracked, and tax receipts are organised by financial year.

---

## 2. Navigation

All four features live under a single `/income` hub with a shared sub-nav. This groups income and Tax Sidekick features together and leaves room for Phase 5/6 additions (donation tracker, super cap monitor, tax estimation) without restructuring the nav.

```
/income               Income dashboard (overview)
/income/payslips      Payslip list + linking review
/income/wfh           WFH hours tracker
/income/receipts      Receipts vault
```

A shared layout component (`app/(authenticated)/income/layout.tsx`) renders the sub-nav tabs across all four pages.

---

## 3. Schema Changes

One new migration: `lib/db/migrations/0005_phase4.sql`

### 3.1 New table: `wfh_entries`

```sql
create table wfh_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
```

### 3.2 Columns added to `transactions`

```sql
alter table transactions
  add column receipt_filename text,
  add column receipt_content_type text;
```

`receipt_object_key` and `receipt_uploaded_at` already exist. `receipt_filename` stores the original filename for display. `receipt_content_type` is one of `application/pdf`, `image/jpeg`, `image/png`.

---

## 4. Payslip ↔ Income Linking

### 4.1 Matching logic

Pure function in `lib/domain/payslip-linking.ts`:

```ts
matchPayslipToIncome(
  payslip: Payslip,
  candidates: Transaction[]
): LinkCandidate[]
```

**Match criteria:**
- `transaction.amount_cents === payslip.net_cents`
- `abs(transaction.posted_date − payslip.pay_date) ≤ 3 days`
- `transaction.amount_cents > 0` (credit only)
- transaction not already present in `transaction_links`

**Confidence scoring:**

| Signal | Score |
|--------|-------|
| Amount + date window match (base) | 0.70 |
| Transaction description contains employer name (normalised from `payslips.employer`) | +0.20 |
| Matching `pay_cadences` record (employer + cadence) | +0.10 |

Auto-confirm at confidence ≥ 0.90. Surface for user review at < 0.90.

### 4.2 Job trigger

`lib/jobs/link-payslips.ts` (pg-boss job):
- Triggered after a payslip is created (manual entry server action)
- Triggered after a statement parse completes (catches deposits that arrived before the payslip was entered)

The job calls `matchPayslipToIncome` with the payslip and all unlinked credit transactions for the user within a ±7 day window.

### 4.3 Confirmation

On user confirm (or auto-confirm):
- Insert `transaction_links` row: `link_type = 'income'`, `from_transaction_id = deposit.id`, `payslip_id = payslip.id`, `confidence`, `source = 'auto' | 'user'`
- No change to `is_excluded_from_spending` — income credits are not spending

### 4.4 Review UI (`/income/payslips`)

- Paginated payslip list sorted by `pay_date DESC`
- Status badges: **Linked** (green), **Review** (yellow, auto-detected candidate awaiting confirmation), **Unlinked** (grey)
- Clicking a Review/Unlinked payslip opens a detail panel showing:
  - Payslip summary (employer, pay date, gross/tax/super/net)
  - Candidate transaction(s) with confidence score
  - Actions: **Confirm link** / **Link to different transaction** (search picker) / **Skip**
- Linked payslips show the matched deposit: account, date, amount

---

## 5. Income Dashboard (`/income`)

### 5.1 Time selector

FY (Jul–Jun) is the default view. A toggle switches to calendar year (Jan–Dec). A year picker selects historical periods. Both views use the same query shape with different date bounds.

### 5.2 Summary cards

Four cards in a row showing period totals derived from `payslips`:

| Card | Value |
|------|-------|
| Gross income | sum of `gross_cents` |
| Tax withheld | sum of `tax_withheld_cents` |
| Super | sum of `super_cents` |
| Net pay | sum of `net_cents` |

Each card shows count of payslips in the period. Cards are aggregated across all employers.

### 5.3 Monthly chart

Recharts `BarChart` with grouped bars. X-axis: months in the selected period. Four series: gross, tax withheld, super, net. Clicking a month bar filters the payslip list below to that month.

### 5.4 Per-employer breakdown

Collapsible table below the chart, shown only when ≥ 2 distinct employers appear in the period. Columns: employer, gross, tax withheld, super, net, payslip count.

### 5.5 Payslip list

Paginated table at the bottom. Columns: pay date, employer, gross, tax withheld, super, net, linked deposit (account + date), status badge. Row click navigates to `/income/payslips?highlight={id}`.

### 5.6 Queries (`lib/db/queries/income-summary.ts`)

```ts
getIncomeSummary(userId, start, end): { grossCents, taxCents, superCents, netCents, count }
getIncomeByMonth(userId, start, end): Array<{ month, grossCents, taxCents, superCents, netCents }>
getIncomeByEmployer(userId, start, end): Array<{ employer, grossCents, taxCents, superCents, netCents, count }>
```

---

## 6. WFH Hours Tracker (`/income/wfh`)

### 6.1 Layout

Two-column layout: monthly calendar grid (left, ~65%) and summary panel (right, ~35%).

### 6.2 Calendar grid

- Standard month grid, Monday–Sunday columns
- Weekends (Sat/Sun) greyed out and non-interactive
- WFH day: green cell showing logged hours (e.g. "8h", "5.5h")
- Non-WFH workday: dim, clickable
- Click a workday → inline popover: hours input (numeric, default 8, step 0.5), Save and Clear buttons
- Save calls `upsertWfhEntry`; Clear calls `deleteWfhEntry`
- Prev/next month navigation arrows; FY selector in the header (defaults to current FY, Jul–Jun)

### 6.3 Summary panel

- **FY total hours** logged to date
- **Estimated deduction**: `total_hours × $0.67`, formatted as currency
- **Monthly breakdown table**: month, hours logged, deduction amount
- ATO disclaimer (footer): *"Estimated deduction under PCG 2023/1 fixed-rate method. Maintain these records; consult a registered tax professional for your return."*

FY selector range: from earliest `wfh_entries` row for the user to current FY.

### 6.4 Queries and actions (`lib/db/queries/wfh-entries.ts`, `app/actions/wfh.ts`)

```ts
// Queries
getWfhEntriesByMonth(userId, year, month): WfhEntry[]
getWfhSummaryByFY(userId, fyStart, fyEnd): { totalHours, byMonth: Array<{ month, hours }> }

// Server actions
upsertWfhEntry(date: string, hours: number): void   // upsert on (user_id, date)
deleteWfhEntry(date: string): void
```

---

## 7. Receipts Vault (`/income/receipts`)

### 7.1 Vault page

- FY tabs across the top (current FY default); tabs appear for any FY that has at least one receipt
- Receipt grid within the selected FY: each card shows thumbnail (PDF icon or `<img>` for images), original filename, linked transaction (date + merchant + amount), upload date
- Cards sorted by `posted_date DESC`
- Empty state: *"No receipts for this period. Attach receipts from the transaction list."*
- **Upload button** (top-right): opens upload modal — file picker, optional transaction link (search by date + description text, shows matching rows), Upload action

### 7.2 Attach from transaction list

A paperclip icon added to each transaction row in `/accounts/[id]/transactions`:

- **Filled paperclip** (receipt attached): clicking opens a viewer modal — PDF embed (`<iframe>`) or `<img>` for images; presigned R2 URL, 60s TTL
- **Empty paperclip** (no receipt): clicking opens upload modal — file picker (PDF/JPEG/PNG, max 10 MB), Upload button

### 7.3 Upload endpoint

`app/api/receipts/upload/route.ts` — `POST multipart/form-data`:

| Field | Type | Notes |
|-------|------|-------|
| `file` | File | PDF, JPEG, or PNG; max 10 MB |
| `transactionId` | string (uuid) | Required |

Validation:
- Content type must be `application/pdf`, `image/jpeg`, or `image/png`
- File size ≤ 10 MB
- `transactionId` must belong to the authenticated user

R2 key format: `{userId}/receipts/{transactionId}/{uuid}.{ext}` — UUID prefix prevents collisions on re-upload.

On success: writes `receipt_object_key`, `receipt_filename`, `receipt_content_type`, `receipt_uploaded_at` to the `transactions` row.

### 7.4 Query (`lib/db/queries/receipts.ts`)

```ts
getReceiptsByFY(userId, fyStart, fyEnd): Array<Transaction & { receiptFilename, receiptContentType, receiptObjectKey }>
// Filters: receipt_object_key IS NOT NULL AND posted_date BETWEEN fyStart AND fyEnd
// Ordered: posted_date DESC
```

### 7.5 Known limitation

One receipt per transaction in Phase 4. A `receipts` table supporting multiple attachments per transaction can be added in Phase 6 alongside PDF parsing work.

---

## 8. File Map

```
lib/db/migrations/0005_phase4.sql
lib/db/schema.ts                         -- add wfhEntries table + receipt columns
lib/db/queries/
  payslips.ts                            -- getPayslipsByUser, getPayslipById, getUnlinkedPayslips
  income-summary.ts                      -- getIncomeSummary, getIncomeByMonth, getIncomeByEmployer
  wfh-entries.ts                         -- getWfhEntriesByMonth, getWfhSummaryByFY
  receipts.ts                            -- getReceiptsByFY
lib/domain/
  payslip-linking.ts                     -- pure matchPayslipToIncome function
lib/jobs/
  link-payslips.ts                       -- pg-boss job
app/actions/
  payslips.ts                            -- confirmLink, skipLink, manualLink
  wfh.ts                                 -- upsertWfhEntry, deleteWfhEntry
  receipts.ts                            -- deleteReceipt
app/api/receipts/upload/route.ts
app/(authenticated)/income/
  layout.tsx                             -- shared sub-nav (Overview | Payslips | WFH | Receipts)
  page.tsx                               -- income dashboard
  payslips/page.tsx
  wfh/page.tsx
  receipts/page.tsx
components/
  income-summary-cards.tsx
  income-chart.tsx
  payslip-link-panel.tsx
  wfh-calendar.tsx
  wfh-summary-panel.tsx
  receipt-upload-modal.tsx
  receipt-viewer-modal.tsx
```

---

## 9. Testing

- `lib/domain/payslip-linking.ts` — unit tests covering: exact match, ±3 day window, confidence tiers, multiple candidates, no-match
- `lib/db/queries/wfh-entries.ts` — integration tests: upsert idempotency, FY boundary, monthly summary totals
- `lib/db/queries/receipts.ts` — integration test: FY filter, null receipt_object_key excluded
- E2E (Playwright): payslip link confirm flow; WFH day entry; receipt upload + vault view
