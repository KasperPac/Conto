# Conto — Planning Document

**Status:** Living document. This is the source of truth for architectural decisions, data model, and build order. Update it when decisions change; supersede rather than rewrite history.

**About the name:** *Conto* — Italian/Portuguese for "account" or "tally." Two syllables, vowel ending, Romance-language flavour to match the existing app family.

---

## 1. Vision and principles

A personal finance tool that ingests bank statements and payslips (no bank API linking), gives the user honest visibility into their money, and helps them plan changes — savings goals, subscription audits, expense trade-offs, and tax outcomes.

**Design principles, in priority order:**

1. **Trust through transparency.** Every number on screen must be traceable back to a transaction. No magic aggregations.
2. **Correctness over coverage.** Better to mark a transaction "uncategorised" than guess wrong.
3. **The user is the source of truth.** Classifications, links, and rules learn from user corrections — never the reverse.
4. **No double-counting.** Transfers, credit card payments, and refunds must net to zero in spending views.
5. **Personal first, multi-tenant ready.** Single-user UX, multi-tenant schema. No retrofitting later.

---

## 2. Architectural decisions (ADRs)

These are decisions that shouldn't change without explicit revision. New features must conform.

**ADR-1: Single Postgres database, multi-tenant schema from day one.**
Every domain table has a `user_id` column. RLS policies enforced in the database. Personal phase has one user, but schema and queries assume tenancy.

**ADR-2: TypeScript everywhere.**
Same language client and server. Shared types for API contracts. Reduces drift between layers.

**ADR-3: Server-side parsing.**
Statement files upload to object storage, parsed by background jobs. Never parse in the browser.

**ADR-4: Rules before ML.**
Classification, subscription detection, and transfer matching all start as deterministic rules. Embeddings/ML are V2. Rules are debuggable; the user can see *why* something was categorised.

**ADR-5: Soft deletes only.**
Transactions are never hard-deleted. Reclassifications create new rules; they don't mutate history. We must be able to reproduce any past view.

**ADR-6: All money in cents (integer).**
No floats for currency. Ever. Store as `bigint` in cents. A `Cents` branded TypeScript type to prevent accidental float math.

**ADR-7: All times UTC; statement dates as `date` not `timestamp`.**
Bank entries are dated, not timestamped. Don't pretend to time-of-day precision.

**ADR-8: Every parser is a pure function.**
`(file: Buffer | string) => ParsedRow[]`. No I/O, no side effects. Trivial to test against fixtures.

**ADR-9: Tax-aware categorisation is a committed differentiator.**
Categories carry `is_deductible_candidate` and `deduction_kind` from V1. Seeded AU subcategory taxonomy includes deductible buckets (WFH-utilities, donations-DGR, work-tools, motor-vehicle, professional-subscriptions). Receipts attach to transactions via `receipt_object_key`. Full record: `/docs/adr/009-tax-aware-categorisation.md`.

**ADR-10: Cashflow forecasting is a committed differentiator.**
Conto reports past spending and projects the next 30/60/90 days from current balance + expected income + expected outflows. Implemented as the Cashflow Runway module in a new Phase 2.5. Full record: `/docs/adr/010-cashflow-forecasting.md`.

**ADR-11: Expected events are first-class.**
A dedicated `expected_events` table is materialised from `recurrence_groups` + `pay_cadences` + manual entries. Bills calendar, liquidity preview, and (future) tax-obligation reminders all read from it. Full record: `/docs/adr/011-expected-events-first-class.md`.

**ADR-12: Better Auth as the auth library.**
Supersedes the "Lucia or Auth.js" wording in ADR-2 with a commitment to **Better Auth** (v1, Drizzle adapter, email+password at V1 with OAuth providers added later). Lucia v3 in maintenance mode since late 2024; Auth.js abstraction heavier than needed. Full record: `/docs/adr/012-better-auth.md`.

---

## 3. Tech stack

Locked-in choices:

| Layer | Choice | Notes |
|---|---|---|
| Runtime / framework | Next.js (App Router) | Web + API in one repo |
| Language | TypeScript, strict mode | |
| Database | Postgres 16 | Local via Docker, hosted via Neon |
| ORM | Drizzle | Type-safe, migration-first |
| Auth | Lucia or Auth.js | Email + password, session cookies |
| UI | Tailwind + shadcn/ui | |
| Charts | Recharts | |
| Background jobs | pg-boss | Postgres-backed; no extra infra |
| File storage | Cloudflare R2 | S3-compatible, cheap egress |
| PDF parsing | pdfjs-dist + per-bank templates | |
| Testing | Vitest (unit), Playwright (E2E) | |
| Web deploy | Vercel | |
| Worker deploy | Fly.io or Railway | |
| Mobile | PWA → Capacitor if needed | Don't build native until PWA bites |

Rationale: mature, well-documented, Claude Code is fluent in all of it. Whole stack runs locally with one `docker compose up`.

---

## 4. Data model

The schema below is the V1 source of truth. Multi-tenancy via `user_id`. Money is integer cents. Dates are explicit.

### Identity & accounts

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

accounts (
  id uuid pk,
  user_id uuid fk users,
  name text,
  institution text,         -- 'CBA', 'ANZ', 'Up', etc.
  type text,                -- checking | savings | credit_card | offset | loan | investment
  currency text default 'AUD',
  opening_balance_cents bigint,
  opening_balance_date date,
  is_active boolean,
  created_at timestamptz
)
```

### Statement ingestion

```sql
statements (
  id uuid pk,
  user_id uuid fk users,
  account_id uuid fk accounts,
  source_filename text,
  source_object_key text,   -- R2 key
  format text,              -- csv | pdf | ofx | qif
  parser_template text,     -- e.g. 'cba_csv_v1', 'anz_pdf_v2'
  period_start date,
  period_end date,
  status text,              -- pending | parsing | parsed | failed | duplicate
  parse_error text,
  uploaded_at timestamptz,
  parsed_at timestamptz
)
```

### Transactions

```sql
transactions (
  id uuid pk,
  user_id uuid fk users,
  account_id uuid fk accounts,
  statement_id uuid fk statements,
  posted_date date,
  description_raw text,        -- exactly as bank gave it
  description_clean text,      -- normalised for matching
  amount_cents bigint,         -- signed; negative = money out
  balance_after_cents bigint nullable,
  category_id uuid fk categories nullable,
  subcategory_id uuid fk categories nullable,
  merchant_id uuid fk merchants nullable,
  classification_source text,  -- system_rule | user_rule | manual | unclassified
  classification_rule_id uuid fk rules nullable,
  is_excluded_from_spending boolean default false,  -- true for transfers, cc payments
  notes text,
  created_at timestamptz,
  receipt_object_key text,     -- R2 key, nullable
  receipt_uploaded_at timestamptz,
  recurrence_group_id uuid fk recurrence_groups nullable
)
-- Best-effort dedupe on re-upload
create unique index on transactions
  (account_id, posted_date, amount_cents, description_raw);
```

### Linking — the magic table

```sql
transaction_links (
  id uuid pk,
  user_id uuid fk users,
  link_type text,              -- transfer | cc_payment | income | refund | split
  from_transaction_id uuid fk transactions,
  to_transaction_id uuid fk transactions nullable,  -- null for splits/income
  payslip_id uuid fk payslips nullable,
  confidence numeric,          -- 0..1 for auto-detected
  source text,                 -- auto | user
  created_at timestamptz
)
```

Modelling links as a first-class table means transfers, credit-card payments, refunds, payslip-to-income, and splits all share one mechanism.

### Categorisation

```sql
categories (
  id uuid pk,
  user_id uuid fk users nullable,  -- null = system category
  parent_id uuid fk categories nullable,
  name text,
  icon text,
  is_income boolean,
  is_essential boolean,        -- for cut-back recommendations
  is_discretionary boolean,
  is_deductible_candidate boolean default false,
  deduction_kind text          -- wfh | donation | work_tools | motor_vehicle | professional_sub | other | null
)

merchants (
  id uuid pk,
  user_id uuid fk users nullable,  -- null = system merchant
  canonical_name text,
  default_category_id uuid fk categories,
  patterns jsonb               -- regex/contains patterns vs description_raw
)

rules (
  id uuid pk,
  user_id uuid fk users,
  pattern text,                -- regex or substring
  match_field text,            -- description_raw | description_clean | merchant
  category_id uuid fk categories,
  subcategory_id uuid fk categories nullable,
  priority int,                -- higher wins
  source text,                 -- system | learned | manual
  created_from_transaction_id uuid fk transactions nullable,
  active boolean,
  created_at timestamptz
)
```

### Income & payslips

```sql
payslips (
  id uuid pk,
  user_id uuid fk users,
  employer text,
  period_start date,
  period_end date,
  pay_date date,
  gross_cents bigint,
  tax_withheld_cents bigint,
  super_cents bigint,
  salary_sacrifice_cents bigint,
  pre_tax_deductions_cents bigint,
  post_tax_deductions_cents bigint,
  net_cents bigint,
  source_object_key text nullable,
  source text,                 -- manual | pdf
  created_at timestamptz,
  cadence text                -- weekly | fortnightly | monthly | irregular (inferred or set)
)
```

### Subscriptions, goals, budgets

```sql
subscriptions (
  id uuid pk,
  user_id uuid fk users,
  merchant_id uuid fk merchants,
  display_name text,
  cadence text,                -- weekly | monthly | quarterly | annual
  expected_amount_cents bigint,
  last_charge_date date,
  next_expected_date date,
  status text,                 -- active | cancelled | paused | suspected
  notes text,
  detected_at timestamptz
)

goals (
  id uuid pk,
  user_id uuid fk users,
  name text,
  target_amount_cents bigint,
  target_date date,
  current_amount_cents bigint,
  linked_account_id uuid fk accounts nullable,
  status text,                 -- active | achieved | abandoned
  created_at timestamptz
)

budgets (
  id uuid pk,
  user_id uuid fk users,
  category_id uuid fk categories,
  period text,                 -- weekly | monthly
  amount_cents bigint,
  effective_from date,
  effective_to date nullable
)
```

### Recurrence and expected events

```sql
recurrence_groups (
  id uuid pk,
  user_id uuid fk users,
  merchant_id uuid fk merchants nullable,
  description_pattern text,
  cadence text,                -- weekly|fortnightly|monthly|quarterly|annual|irregular
  median_amount_cents bigint,
  amount_stddev_cents bigint,
  median_interval_days int,
  last_seen_date date,
  next_expected_date date,
  status text,                 -- active|suspected|paused|cancelled
  confidence numeric,          -- 0..1
  source text,                 -- auto|manual
  created_at timestamptz
)

pay_cadences (
  id uuid pk,
  user_id uuid fk users,
  account_id uuid fk accounts,
  employer text,
  cadence text,                -- weekly|fortnightly|monthly
  expected_net_cents bigint,
  next_pay_date date,
  source text,                 -- detected|manual
  active boolean,
  created_at timestamptz
)

expected_events (
  id uuid pk,
  user_id uuid fk users,
  account_id uuid fk accounts,
  source text,                 -- recurrence_group|pay_cadence|manual|tax_obligation
  source_id uuid,              -- soft fk into the source table
  expected_date date,
  expected_amount_cents bigint,
  expected_amount_low_cents bigint,
  expected_amount_high_cents bigint,
  description text,
  status text,                 -- pending|dismissed|snoozed|matched|superseded
  matched_transaction_id uuid fk transactions nullable,
  snoozed_until date nullable,
  confidence numeric,
  generated_at timestamptz,
  user_note text
)
-- partial index for the hot path (calendar / liquidity preview)
create index on expected_events (user_id, expected_date) where status = 'pending';
```

`expected_events` is a materialised projection: re-materialisation deletes only `source in ('recurrence_group','pay_cadence') and status='pending' and expected_date >= current_date`. Snoozed/dismissed/matched/superseded rows and `source='manual'` rows survive. See ADR-11 and `Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md` §3.7 for the contract.

---

## 5. Domain logic — the hard parts

### 5.1 Transfer detection

For each negative transaction in account A, search positive transactions in other accounts of the same user where:

- `abs(amount_cents)` matches
- `posted_date` within ±3 days
- not already linked

Confidence boosts: description contains "transfer" / "tfr", account-number fragment of the other account, both sides reference each other.

**Output:** candidates above threshold are auto-linked. Ambiguous cases surface in a review UI ("are these the same transfer?"). On user confirmation, store description patterns from both sides as a learned linking rule. Both legs flagged `is_excluded_from_spending = true`.

### 5.2 Credit card reconciliation

Same matching pattern as transfers, link_type `cc_payment`. The payment-from-checking is excluded from spending; the actual purchases on the card statement are the spending.

**UX guard:** when a credit card statement is uploaded, flag if the matching checking-account payment isn't yet uploaded — the card balance won't reconcile until both sides exist.

### 5.3 Income ↔ payslip linking

A salary deposit on the bank statement is the *net*. The payslip carries gross / tax / super / sacrifice / deductions. Match by:

- `amount_cents` equals `payslip.net_cents`
- `posted_date` within ±3 days of `pay_date`
- description matches employer pattern

V1 ships with manual payslip entry; the matching logic is the same regardless of payslip source.

### 5.4 Classification

Per-transaction pipeline:

1. Apply user rules (priority desc).
2. If unmatched, apply system merchant patterns.
3. If unmatched, mark `unclassified`.

When the user reclassifies, prompt: *"Apply to just this one, or all 47 matching transactions?"* If "all", create a learned rule from the description pattern. Rules are editable from a dedicated admin view.

V2: embedding similarity on `description_clean` to suggest categories for new uncategorised transactions, with a confidence score.

### 5.5 Subscription detection

Run nightly. For each merchant with ≥3 charges in the past 12 months:

- Compute median interval between charges.
- If interval is consistent (stddev < 25% of median) and lands in a known cadence bucket, flag as subscription.
- Detect price increases (latest > 1.05× previous).
- Detect lapses (no charge for >2× expected interval = "did you cancel?").

Surface for user confirmation. Don't materialise to `subscriptions` table until confirmed — pre-confirmation they're suggestions.

### 5.6 Trade-off engine

**Input:** `target_weekly_cost`, optional preferences (don't touch streaming, willing to cut groceries, etc.).

**Process:**

1. Compute current weekly net surplus.
2. If target ≤ surplus: trivial — recommend just absorbing it.
3. Otherwise, build a ranked list of cuttable items:
   - **Tier 1:** subscriptions (full cost recoverable, lowest friction).
   - **Tier 2:** discretionary categories above their median (e.g. "$X on takeaway last month vs $Y median").
   - **Tier 3:** larger fixed costs (suggest with strong caveats).
4. Generate 2–3 combinations that hit the target. Show as scenarios with an "apply" button that creates corresponding budget entries / cancellation reminders.

Presented as **suggestions, not advice**. Wording matters — see §9.

---

## 6. Statement ingestion strategy

Each parser has a stable template ID (`cba_csv_v1`, `anz_pdf_v2`) so re-parses are reproducible.

**CSV** (V1):
- CBA, ANZ, NAB, Westpac, ING, Macquarie, Up, Bendigo, UBank.
- Auto-detect bank from column headers + first rows; user can override.
- Parser returns rows; ingestion deduplicates against existing transactions.

**PDF** (V1.5):
- Extract text via `pdfjs-dist`.
- Per-bank templates with regex anchors for date, description, amount columns.
- Multi-page, balance-forward handling.
- Unknown formats: LLM extraction with strict JSON schema and a human verification step.

**OFX/QIF:** nice-to-have, not V1.

**Duplicate handling:** uniqueness on `(account_id, posted_date, amount_cents, description_raw)`. Re-uploading overlapping statements is a normal flow: *"Imported 23 new, skipped 412 duplicates."*

---

## 7. Multi-tenancy posture

**Build now (cheap):**
- `user_id` on every domain table.
- All queries scoped via a request-bound user context.
- RLS policies in Postgres mirroring the application scoping (defence in depth).
- Object-storage keys prefixed with user ID.

**Defer until second user exists:**
- Signup / email verification UX polish.
- Billing.
- Per-tenant resource limits.
- Admin dashboard.
- Audit log UI.

This costs ~5% extra effort upfront and saves a months-long migration later.

---

## 8. Build phases

### Phase 0 — foundation
- Repo, Next.js, Postgres + Drizzle, Docker compose for local dev.
- Auth (single user OK).
- Migrations for all §4 tables.
- File upload to R2.
- pg-boss worker process.

**Done when:** sign in, upload a file, see it in R2, a no-op job runs against it.

### Phase 1 — ingest & view
- CSV parsers for the big four + Up.
- Transaction list per account, with filters.
- Account balance reconstruction from opening balance + transactions.
- Manual category management.
- Manual reclassification.

**Done when:** real statements upload and transactions look correct.

### Phase 2 — linking & integrity
- Transfer auto-detection + review UI.
- CC payment reconciliation.
- Manual link/unlink.
- Excluded-from-spending logic in all aggregation queries.

**Done when:** spending dashboards don't double-count anything for your own data.

### Phase 2.5 — recurring & expected events
- Recurrence detector (lifted out of original §5.5; transactions-only, no subscription dashboard polish yet).
- Manual payslip entry + `pay_cadences` (lifted out of original Phase 4).
- `project-expected-events` worker (rebuilds projection from active sources).
- `match-expected-events` worker (reconciles incoming transactions against pending events).
- Liquidity preview view at `/runway` (30/60/90 day projection).
- Bills calendar view at `/runway/calendar`.
- Direct-debit register at `/runway/direct-debits`.

**Done when:** for the user's own data, the next 30 days project credibly and the bills calendar matches reality.

### Phase 3 — classification & subscription polish
- System merchant + rule library (seed ~200 AU merchants).
- Learned rules from reclassification.
- Subscription detection + review UI.
- Subscription dashboard with price-change detection.
- Subscription review UI is a filtered view on `recurrence_groups` (engine reused from 2.5).
- Deductible filter UI on transaction list (Tax Sidekick foothold).

**Done when:** new uploads classify ~80% automatically; subscription footprint visible.

### Phase 4 — payslips & income
- (Manual payslip entry already done in Phase 2.5 — Phase 4 focuses on payslip-PDF parsing depth.)
- Payslip ↔ income linking.
- Income dashboard (gross / tax / super / net over time).
- WFH hours tracker (Tax Sidekick — PCG 2023/1 fixed-rate method, 67c/hr).
- Receipts vault UX (attach + FY-bounded folder view).

**Done when:** full income picture independent of bank deposits.

### Phase 5 — goals, budgets, trade-offs
- Goals (target + date + linked account).
- Category budgets.
- Trade-off engine.
- Cut-back recommendations.
- Donation tracker (Tax Sidekick; auto-flag transactions matching seed DGR registry; advisory only).
- Super cap monitor (Tax Sidekick; concessional-cap headroom from payslip super + employer SG).
- Tax obligations on the runway calendar (BAS, June 30, return due — `expected_events` with `source='tax_obligation'`; no schema change).

**Done when:** "afford a $40/wk gym without changing net surplus" returns a sensible answer.

### Phase 6 — PDFs and tax
- PDF parsers for big four.
- LLM fallback for unknown formats.
- Payslip PDF parsing for major AU payroll providers (Xero, MYOB, Employment Hero, Keypay, ADP).
- Tax estimation: PAYG vs estimated annual liability; deduction capture from categorised expenses.
- FY tax pack export (Tax Sidekick capstone): one ZIP per FY containing categorised income/expense CSVs, donation summary, super contributions summary, and all attached receipts.

### Phase 7 — multi-tenant polish (only if commercialising)
- Signup, email verification, password reset.
- Billing.
- Onboarding.
- Marketing site.

---

## 9. Compliance and tone

The product gives **information**, not advice. Wording matters:

- ✅ "Based on your spending, you could free up $X by cancelling these subscriptions."
- ❌ "You should cancel Netflix."
- ✅ "Estimated tax position based on your data."
- ❌ "You'll get a $3,200 refund."

Footer disclaimer on relevant pages: *general information, not personal financial or tax advice; consult a registered professional*.

Before any commercial release: get a fintech-aware Australian lawyer to review wording, T&Cs, and privacy posture. ASIC general-advice rules and Tax Practitioners Board rules are the relevant frameworks.

---

## 10. Working with Claude Code

Practices that pay off when the codebase grows:

- **Keep this file at `/docs/PLAN.md` and a tighter `CLAUDE.md` at repo root.** `CLAUDE.md` summarises principles, stack, conventions, and "don't do this" lists. Claude Code reads it automatically each session.
- **One ADR per non-obvious decision** in `/docs/adr/`, numbered. When you change your mind, supersede with a new ADR rather than editing the old one.
- **Module boundaries that fit a prompt.** A parser, the transfer detector, the trade-off engine — each is a self-contained module with its own tests.
- **Test seams everywhere.** Pure functions where possible. Claude Code generates tests for them trivially.
- **Anonymised real-statement fixtures.** Keep redacted samples for each bank in `tests/fixtures/`. Regression-test parsers against them.
- **Branded `Cents` type.** Prevents accidental float math; the type system catches mistakes Claude Code might miss.
- **Migrations forward-only.** Never edit a committed migration. Rollbacks happen via new migrations.
- **Don't let the agent guess at bank formats.** When adding a new parser, give it 2–3 sample files first.
- **Commit message convention.** `phase/area: change` (e.g. `phase2/transfers: add ±3 day window`) makes the history readable.

### Suggested repo layout

```
/app                  Next.js routes
/components           React components
/lib
  /db                 Drizzle schema, migrations, queries
  /parsers
    /csv              one file per bank
    /pdf              one file per bank
    /payslips
  /domain
    transfers.ts      detection logic
    creditcards.ts    reconciliation
    classification.ts rule engine
    subscriptions.ts  detection
    tradeoff.ts       engine
    tax.ts            estimation
  /jobs               pg-boss handlers
  /storage            R2 client
  /types              Cents, branded types, shared contracts
/tests
  /fixtures           anonymised statements
  /unit
  /e2e
/docs
  PLAN.md             this file
  /adr                numbered ADRs
CLAUDE.md             project conventions for the agent
```

---

## 11. Open questions

Resolve before Phase 1:

- Will partner / family data ever join this account? Affects how far to push tenancy in V1.
- Desktop-class web UI primary, or mobile-first PWA? Drives layout decisions early.
- Tolerate ~$5–20/mo for managed Postgres + R2 + worker host, or self-host on a VPS?
- Tax depth: just PAYG estimation, or also sole-trader / contractor / investment / rental income?
- *Resolved 2026-05-04 (spec ref):* Conto commits to tax-aware categorisation and cashflow forecasting as headline differentiators (ADR-9, ADR-10). Schema scaffolding lands in Phase 0; full features sequenced through Phases 2.5–6. See `Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md`.
- *Deferred:* DGR registry refresh cadence; recurrence-detection confidence thresholds (calibrate during Phase 2.5 with own data). See spec §7.

---

## Changelog

- **v0.1** — Initial draft.
- **v0.2 (2026-05-04)** — Adopt ADR-9 (tax-aware categorisation), ADR-10 (cashflow forecasting), ADR-11 (expected events first-class). Schema additions in §4: `recurrence_groups`, `pay_cadences`, `expected_events`; alters to `categories`, `transactions`, `users`, `payslips`. Phase 2.5 inserted in §8 between Phase 2 and Phase 3. Tax features sequenced into Phases 3–6.
- **v0.3 (2026-05-04)** — Phase 0 implementation begins. Adopt ADR-12 (Better Auth supersedes the Lucia/Auth.js option in ADR-2). `users` schema reconciled (drops `password_hash`, adds `email_verified`/`name`/`image`/`updated_at`). All §4 tables — including Plan A deltas — now live in `lib/db/schema.ts` and ship via `lib/db/migrations/0000_init.sql`. AU subcategory seed automatic on `npm run db:seed`. README "Getting started" reflects the runnable Docker + Next.js + worker stack.
