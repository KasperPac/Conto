# Phase 1 — Ingest & View Design

**Date:** 2026-05-04  
**Status:** Approved  
**Phase:** 1 — Ingest & View

---

## Context

Phase 0 delivered: auth (Better Auth), file upload to Cloudflare R2, pg-boss worker, full schema (17 tables), and a passing test suite. The upload job is currently a no-op.

Phase 1 delivers real statement ingestion and a transaction view. All example statements on hand are PDFs (NAB and Up Bank confirmed text-based; two Ricoh image-based files deferred). The plan's "CSV-first, PDF in Phase 1.5" sequencing is superseded — Phase 1 ships PDF parsers for NAB and Up Bank.

**Done when:** real NAB and Up Bank statements upload, parse, and display correctly as a filterable transaction list.

---

## 1. Parser Layer

### 1.1 Dependency

`pdfjs-dist` added to `dependencies`. Used server-side only — never imported in browser code.

### 1.2 Directory layout

```
lib/parsers/pdf/
  types.ts          shared interfaces
  extract.ts        pdfjs text extraction utility
  detect.ts         bank detection from extracted text
  nab.ts            template nab_pdf_v1
  up.ts             template up_pdf_v1
  index.ts          dispatch(buf) routing function
```

### 1.3 Contracts

```ts
// lib/parsers/pdf/types.ts

interface ParsedRow {
  posted_date: string             // 'YYYY-MM-DD'
  description_raw: string
  amount_cents: Cents             // signed; negative = money out
  balance_after_cents?: Cents
}

interface ParsedStatement {
  template_id: string             // e.g. 'nab_pdf_v1'
  institution: string             // 'NAB' | 'Up'
  account_number_fragment: string // last 4 digits or BSB+account suffix
  account_type: 'checking' | 'savings' | 'credit_card'
  period_start: string            // 'YYYY-MM-DD'
  period_end: string              // 'YYYY-MM-DD'
  rows: ParsedRow[]
}

type Parser = (buf: Buffer) => Promise<ParsedStatement>
```

### 1.4 Bank detection

`lib/parsers/pdf/detect.ts` — pure function `detectBank(text: string): 'nab_pdf_v1' | 'up_pdf_v1' | null`

Detection signals:
- **NAB:** PDF metadata `Author = "NAB"` or body contains `"National Australia Bank"`
- **Up Bank:** body contains `"Up is a brand of Bendigo"` or PDF producer is Prawn

### 1.5 Parsers

Each parser is a pure function `(buf: Buffer) => Promise<ParsedStatement>`. No I/O, no side effects.

- `nab.ts` — template `nab_pdf_v1`. Smart Communications SC32 format. Extracts text via pdfjs, parses date/description/debit/credit/balance columns by position/regex.
- `up.ts` — template `up_pdf_v1`. Prawn-generated format. Hex-encoded text streams; extracts and parses month/year header, transaction rows.

`lib/parsers/pdf/index.ts` exports `dispatch(buf: Buffer): Promise<ParsedStatement>` which calls `detectBank`, routes to the correct parser, and throws `UnknownFormatError` if unrecognised.

### 1.6 Fixtures

Real statement files (redacted if needed) copied to:
```
tests/fixtures/pdf/nab/nab_pdf_v1_sample.pdf
tests/fixtures/pdf/up/up_pdf_v1_sample.pdf
```

Git-committed. Filename encodes template version for reproducibility.

---

## 2. Upload → Ingest Pipeline

### 2.1 Upload API changes

Before enqueuing the job, the `/api/upload` route now:
1. Inserts a `statements` record: `{ user_id, source_filename, source_object_key, format: 'pdf', status: 'pending', uploaded_at: now() }`
2. Enqueues the `parse-statement` job with payload `{ statementId }` (not the raw R2 key — the job looks everything up from the DB)

### 2.2 Job: `parse-statement`

Replaces the `noop` job. Registered in `lib/jobs/parse-statement.ts`.

**Steps:**

1. Load `statements` record by `statementId` from payload; read `source_object_key` and `user_id`
2. Download file buffer from R2 using `source_object_key`
3. Call `dispatch(buf)`. On `UnknownFormatError`: set `statement.status = 'failed'`, `parse_error = 'unknown_format'`, stop.
4. **Find-or-create account:** query `accounts` for `(user_id, institution, account_number_fragment)` match. If no match, insert new account:
   - `name`: `"{institution} {account_type} ••{last4}"` (e.g. `"NAB Everyday ••4321"`)
   - `institution`, `type`, `currency = 'AUD'`
5. Update `statements` record: set `account_id`, `parser_template`, `period_start`, `period_end`, `status = 'parsing'`
6. Bulk-insert `transactions` using `ON CONFLICT DO NOTHING` on `(account_id, posted_date, amount_cents, description_raw)`
7. Set `statement.status = 'parsed'`, `parsed_at = now()`

**Statement status flow:** `pending → parsing → parsed | failed`

### 2.3 Upload page redirect

After successful upload, redirect to `/statements` instead of showing the R2 key. The statements list shows live status.

### 2.4 Account naming

Auto-generated name `"{institution} {account_type} ••{last4}"` is set on creation. User can rename via inline edit on `/accounts`. No manual account creation UI — accounts are created by the parser only.

---

## 3. UI Pages

All routes sit within the existing authenticated layout (`max-w-4xl mx-auto`, top nav). No new shadcn/ui components needed — transaction table uses a plain `<table>` with Tailwind.

### 3.1 `/statements`

Statement history list. Server component.

Columns: filename | account | period | status badge | transaction count | uploaded date

Status badges: Pending (grey) | Parsing (yellow) | Parsed (green) | Failed (red)

Parsed rows link to the account's transaction list. Failed rows show the parse error. No real-time polling — manual refresh in Phase 1.

### 3.2 `/accounts`

Account list. Server component.

Shows each account with its reconstructed balance: `opening_balance_cents + SUM(amount_cents) WHERE is_excluded_from_spending = false`. Inline rename (server action). Link to `/accounts/[id]/transactions`.

No account creation UI.

### 3.3 `/accounts/[id]/transactions`

Transaction list. Server-rendered, paginated (50 rows/page, cursor-based on `posted_date + id`).

**Columns:** date | description | category | amount | running balance

**Filters (URL params, server-rendered):**
- Date range (`from`, `to`)
- Category (`category_id`)
- Description search (substring on `description_raw`)
- Direction (`debit` | `credit` | all)

Category cell is a button — clicking opens the reclassification modal.

### 3.4 `/categories`

Category management. Server component + client form.

Lists system categories (read-only, visually distinct) and user categories (editable). "New category" form: name, optional parent, income/essential/discretionary flags.

Delete only allowed when no transactions reference the category — enforced in the server action with a count check before deletion.

### 3.5 Reclassification modal

Client component, triggered from category cell on any transaction row.

1. Shows current category and a searchable category dropdown
2. On save: server action sets `classification_source = 'manual'`, `category_id`
3. Prompts: *"Apply to all transactions with this description?"*
4. If yes: inserts a `rules` record (`source = 'manual'`, `match_field = 'description_raw'`, `pattern = description_raw` as a substring match), then bulk-updates all transactions for the user where `description_raw` contains that pattern

### 3.6 Nav update

Add to existing `<Nav>`: Statements | Accounts | Categories links alongside the existing Upload link.

---

## 4. Testing Strategy

### 4.1 Parser unit tests (`tests/unit/parsers/`)

One test file per bank (`nab.test.ts`, `up.test.ts`). Each imports the parser directly and runs it against the fixture file.

Assertions per parser:
- Correct `template_id` and `institution`
- Row count matches expected
- First and last row: correct date format, non-empty description, non-NaN amount
- Period dates are valid ISO strings
- No row has `amount_cents === 0` where amount was clearly present

Fast — pure functions, no DB, no network.

### 4.2 Integration tests (`tests/integration/`)

Extend the existing Vitest integration suite:

- `parse-statement-job.test.ts`: enqueues job against test DB, runs worker, asserts `statement.status = 'parsed'`, correct `transaction` count, account auto-created with correct institution and type, deduplication (re-run same file = 0 new transactions)
- `reclassification.test.ts`: inserts a transaction, applies manual reclassification via server action, asserts rule created and all matching transactions updated

### 4.3 E2E test (`tests/e2e/`)

Extend existing Playwright happy path:

1. Upload a NAB PDF fixture
2. Assert redirect to `/statements`
3. Wait for (or refresh to) `Parsed` status badge
4. Click through to transactions
5. Assert at least one row with a valid date and non-zero amount
6. Click a category cell, assign a category, confirm "apply to all"
7. Assert category appears on the row

### 4.4 Fixture policy

No mocking of parsers in integration tests — real parser runs against real fixture files. If a bank changes their PDF format, the fixture test fails and signals the need for a new template version.

---

## 5. Out of scope for Phase 1

- Ricoh AFP image-based PDFs (Statement (4).pdf, Statement (5).pdf) — deferred until bank is identified and format confirmed parseable
- CSV parsers — deferred; no CSV samples available
- Transfer detection and cc-payment reconciliation — Phase 2
- Subscription detection — Phase 3
- Balance forecasting — Phase 2.5

---

## 6. Open questions resolved

| Question | Decision |
|---|---|
| CSV or PDF first? | PDF first — only PDFs available |
| Account-first or detect-then-create? | Detect-then-create (parser creates account) |
| Desktop or mobile UI? | Desktop-class (inherits existing `max-w-4xl` layout) |
| Real-time job status? | No — manual refresh in Phase 1 |
| Banks in scope? | NAB and Up Bank; Ricoh files deferred |
