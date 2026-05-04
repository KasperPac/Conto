# Tax & Obligations Foundations — Design

**Status:** Draft, pending review.
**Date:** 2026-05-04.
**Authors:** Kasper + Claude (brainstorming session).
**Scope:** Foundational changes (ADRs, schema deltas, phase reordering) **plus** the full design for the Cashflow Runway module **plus** a roadmap sketch for the AU Tax Sidekick.

---

## 1. Why this spec exists

Conto's existing `PLAN.md` covers a credible personal-finance app, but it does not commit to a defining differentiator beyond "no bank API linking." This spec commits two:

1. **Cashflow forecasting** — Conto reports the past *and* projects the next 30/60/90 days. Most personal-finance apps only report. Implemented as the **Cashflow Runway** module.
2. **Tax-aware categorisation from V1** — every category carries a deduction flag from day one, receipts attach to transactions, and the schema is shaped so the future **AU Tax Sidekick** is feature work, not a migration.

These are both committed at the schema and phase-order level so neither becomes retrofittable later. The Cashflow Runway is fully designed in this spec and ships at the end of a new Phase 2.5. The AU Tax Sidekick is sketched at the roadmap level; its full design is a later session.

### Goals
- Pull schema scaffolding for both differentiators into Phase 0/1.
- Insert a Phase 2.5 to ship Cashflow Runway after linking-and-integrity (Phase 2) but before classification polish (Phase 3).
- Reuse one mechanism — first-class `expected_events` — across bills, income, and (later) tax obligations.

### Non-goals
- Building the Tax Sidekick features now. They land in Phases 3–6.
- Bank-API linking. Conto remains statement-upload only (per existing principles).
- ML-driven recurrence detection. Rules-based engine first, per ADR-4.
- Capital-gains, vehicle logbook compliance, actual-cost WFH method — all deferred.

---

## 2. New ADRs

### ADR-9 — Tax-aware categorisation is a committed differentiator

Categories carry `is_deductible_candidate` and `deduction_kind` from V1. Seeded AU subcategory taxonomy includes deductible buckets (WFH-utilities, donations-DGR, work-tools, motor-vehicle, professional-subscriptions). Receipts attach to transactions from V1. The full Tax Sidekick (WFH tracker, super cap monitor, FY tax pack) is sequenced through Phases 3–6, but its schema lands in Phase 0/1 so no migration is needed later.

**Why:** retrofitting deduction-awareness across a populated transaction store is painful (requires bulk reclassification). Adding two columns and a seed taxonomy now is cheap.

### ADR-10 — Cashflow forecasting is a committed differentiator

Conto reports past spending *and* shows projected daily balance for the next 30/60/90 days, drawn from current balance + expected income + expected outflows. Recurring-detection metadata moves into Phase 0/1 schema. A new Phase 2.5 ships the feature.

**Why:** "what's coming" is the question that drives most personal-finance behaviour. Reporting alone is table stakes; forecasting is a real point of difference and a hard-to-copy demo.

### ADR-11 — Expected events are first-class

A dedicated `expected_events` table is materialised from `recurrence_groups` + `pay_cadences` + manual user entries. Bills calendar, liquidity preview, and (later) tax-obligation reminders all read from it. The table is **downstream of source data** — re-runnable from sources, never source-of-truth — except for `source='manual'` rows, which are user-entered and persist across re-materialisation.

**Why:** the alternative (computing projections on every read) makes user actions on future events awkward — every "snooze," "dismiss," or "I cancelled this" needs a side-table of overrides. A first-class row gives every projected event a stable identity to attach actions, notes, and provenance to. Conto's transparency principle benefits: any number on a dashboard came from a row, with a row-level drill-down.

---

## 3. Schema deltas (additions to `PLAN.md` §4)

All new tables carry `user_id` (ADR-1). All money columns are `bigint` cents (ADR-6). All dates are `date`; timestamps are `timestamptz` (ADR-7).

### 3.1 Categories — tax-awareness flags

```sql
alter table categories add column is_deductible_candidate boolean default false;
alter table categories add column deduction_kind text;
  -- one of: wfh | donation | work_tools | motor_vehicle | professional_sub | other | null
```

### 3.2 Transactions — receipt slot + recurrence back-link

```sql
alter table transactions add column receipt_object_key text;       -- R2 key
alter table transactions add column receipt_uploaded_at timestamptz;
alter table transactions add column recurrence_group_id uuid;      -- back-link to recurrence_groups
```

### 3.3 New: `recurrence_groups`

Canonical source for "this is a recurring outflow." Phase 3's subscription dashboard becomes a filtered view on top of this; not all recurring is a subscription (rent, gym DDs, utility bills are recurring but not "subscriptions" in the consumer sense).

```sql
create table recurrence_groups (
  id uuid pk,
  user_id uuid fk users,
  merchant_id uuid fk merchants nullable,
  description_pattern text,            -- normalised pattern matched by group
  cadence text,                        -- weekly | fortnightly | monthly | quarterly | annual | irregular
  median_amount_cents bigint,
  amount_stddev_cents bigint,
  median_interval_days int,
  last_seen_date date,
  next_expected_date date,
  status text,                         -- active | suspected | paused | cancelled
  confidence numeric,                  -- 0..1
  source text,                         -- auto | manual
  created_at timestamptz
);
```

### 3.4 New: `pay_cadences`

Canonical source for "income lands every X days." Detected from credits *or* manually entered. Manual entries take precedence when both exist for the same employer/account.

```sql
create table pay_cadences (
  id uuid pk,
  user_id uuid fk users,
  account_id uuid fk accounts,         -- account where the deposit lands
  employer text,
  cadence text,                        -- weekly | fortnightly | monthly
  expected_net_cents bigint,
  next_pay_date date,
  source text,                         -- detected | manual
  active boolean,
  created_at timestamptz
);
```

### 3.5 New: `expected_events` (the materialised projection)

Read model for bills calendar + liquidity preview + (later) tax obligations.

```sql
create table expected_events (
  id uuid pk,
  user_id uuid fk users,
  account_id uuid fk accounts,
  source text,                         -- recurrence_group | pay_cadence | manual | tax_obligation
  source_id uuid,                      -- soft fk into the source table
  expected_date date,
  expected_amount_cents bigint,        -- signed (negative = outflow)
  expected_amount_low_cents bigint,    -- range derived from observed stddev
  expected_amount_high_cents bigint,
  description text,
  status text,                         -- pending | dismissed | snoozed | matched | superseded
  matched_transaction_id uuid fk transactions nullable,
  snoozed_until date nullable,
  confidence numeric,
  generated_at timestamptz,            -- when the projection ran
  user_note text
);
create index on expected_events (user_id, expected_date) where status = 'pending';
```

The `source` enum reserves `'tax_obligation'` for the future Tax Sidekick — no schema change needed when those features ship.

### 3.6 Users — runway buffer

```sql
alter table users add column cashflow_buffer_cents bigint default 50000;  -- $500
```

User-configurable threshold below which the liquidity preview flags a dip.

### 3.6.1 Payslips — cadence

```sql
alter table payslips add column cadence text;  -- weekly | fortnightly | monthly | irregular
```

Inferred during pay-cadence detection or set explicitly via manual payslip entry. Drives `pay_cadences.cadence` when promoting a payslip to a recurring expectation.

### 3.7 Re-materialisation contract

The `project-expected-events` worker:

1. `delete from expected_events where user_id = $1 and source in ('recurrence_group','pay_cadence') and status = 'pending' and expected_date >= current_date`
2. Inserts fresh rows from active `recurrence_groups` and `pay_cadences` for the next 90 days, with `status='pending'`.
3. **Manual rows survive** — they are user-entered source-of-truth (`source='manual'` excluded from the delete).
4. **Snoozed, dismissed, matched, and superseded rows survive** — these reflect user state or transaction history; the `status='pending'` filter on the delete preserves them.
5. Runs in a single db transaction (delete + insert atomic) so concurrent reads see a consistent snapshot.

---

## 4. Phase reordering

Updates to `PLAN.md` §8.

```
Phase 0   foundation (gains: schema deltas in §3 + AU subcategory seed taxonomy)
Phase 1   ingest & view                                          (unchanged)
Phase 2   linking & integrity                                    (unchanged)

Phase 2.5 NEW — recurring & expected events
          - Recurrence detector (lifted out of original Phase 3 §5.5; transactions-only,
            no subscription dashboard polish yet)
          - Manual payslip entry + pay_cadences (lifted out of original Phase 4)
          - project-expected-events worker
          - match-expected-events worker
          - Liquidity preview (H1)
          - Bills calendar (H2)
          - Direct-debit register (H3)
          Done when: for the user's own data, the next 30 days project credibly and
          the bills calendar matches reality.

Phase 3   classification & subscription polish (renamed)
          - System merchant + rule library (seed AU)
          - Learned rules from reclassification
          - Subscription review UI as a filtered view on recurrence_groups
          - Price-change detection (uses recurrence_groups data)
          - Deductible filter UI on transaction list (Tax Sidekick foothold)

Phase 4   payslips & income (PDF parsing depth; manual entry already done in 2.5)
          - WFH hours tracker (Tax Sidekick)
          - Receipts vault UX (Tax Sidekick)

Phase 5   goals, budgets, trade-offs (unchanged core)
          - Donation tracker (Tax Sidekick; needs DGR seed registry)
          - Super cap monitor (Tax Sidekick; needs Phase 4 payslip parsing depth)
          - Tax-obligation events on runway calendar (reuses expected_events)

Phase 6   PDFs and tax
          - PDF parsers for big four
          - LLM fallback for unknown formats
          - Payslip PDF parsing per major AU provider
          - FY tax pack export (Tax Sidekick capstone)
```

---

## 5. Cashflow Runway — full design

### 5.1 Architecture in one paragraph

The runway is a read-only feature on top of source data. Source-of-truth tables: `transactions`, `recurrence_groups`, `pay_cadences`, plus `expected_events` rows where `source='manual'`. Materialised: `expected_events` rows where `source in ('recurrence_group','pay_cadence')`. A nightly projection worker rebuilds materialised rows from sources; a per-transaction matcher reconciles incoming transactions against pending events. Three read views (liquidity preview, bills calendar, direct-debit register) consume from these tables. No business logic lives in routes — every UI is a thin shell over a pure function or a query.

### 5.2 Module layout

```
/lib/domain/
  recurrence.ts          pure: detect recurring patterns from transactions
  pay-cadence.ts         pure: detect employer pay rhythm from credit transactions
  runway.ts              pure: project daily balance forward from events + start balance
  direct-debits.ts       pure: classify a recurrence_group as DD/BPAY/null

/lib/jobs/
  project-expected-events.ts   worker: rebuild expected_events from sources
  match-expected-events.ts     worker: on new tx, mark matching event as matched

/lib/db/queries/
  bills-calendar.ts      query: expected_events grouped by day for a month
  direct-debits-list.ts  query: recurrence_groups filtered to DD-pattern, with status
  liquidity-preview.ts   query: balance + pending events over horizon

/app/(authenticated)/runway/
  page.tsx                 liquidity preview (default landing for /runway)
  calendar/page.tsx        bills calendar (month grid)
  direct-debits/page.tsx   direct-debit register (table)
```

### 5.3 Pure-function cores — interfaces

All four are pure: deterministic in/out, no I/O, no side effects. Trivial to fixture-test.

```typescript
// lib/domain/recurrence.ts
export interface DetectedRecurrence {
  descriptionPattern: string;
  merchantId: MerchantId | null;
  cadence: 'weekly'|'fortnightly'|'monthly'|'quarterly'|'annual'|'irregular';
  medianAmountCents: Cents;
  amountStddevCents: Cents;
  medianIntervalDays: number;
  lastSeenDate: ISODate;
  nextExpectedDate: ISODate;
  confidence: number; // 0..1
  memberTransactionIds: TransactionId[];
}
export function detectRecurrence(
  transactions: TransactionWithMerchant[],
  options: { minOccurrences: number; maxStddevPct: number }
): DetectedRecurrence[];

// lib/domain/pay-cadence.ts
export interface PayCadenceCandidate {
  accountId: AccountId;
  employer: string;
  cadence: 'weekly'|'fortnightly'|'monthly';
  expectedNetCents: Cents;
  nextPayDate: ISODate;
  confidence: number;
  memberTransactionIds: TransactionId[];
}
export function detectPayCadence(
  creditTransactions: TransactionWithMerchant[],
  options: { minOccurrences: number; maxAmountStddevPct: number }
): PayCadenceCandidate[];

// lib/domain/runway.ts
export interface RunwayPoint {
  date: ISODate;
  projectedBalanceCents: Cents;
  lowCents: Cents;     // worst-case from event ranges
  highCents: Cents;    // best-case
  events: ExpectedEvent[]; // events on this day
}
export function projectRunway(
  startBalanceCents: Cents,
  events: ExpectedEvent[],   // already sorted by date asc
  horizonDays: number
): RunwayPoint[];

// lib/domain/direct-debits.ts
export type DirectDebitKind = 'dd_mandate' | 'bpay' | 'merchant_pull';
export function classifyAsDirectDebit(
  group: { descriptionPattern: string }
): DirectDebitKind | null;
```

### 5.4 Workers

#### `project-expected-events`

Triggered nightly via pg-boss + on writes to `recurrence_groups` / `pay_cadences`.

```typescript
export async function projectExpectedEvents(
  userId: UserId,
  horizonDays: number = 90
): Promise<{ inserted: number; deleted: number }>;
```

Algorithm:

1. Begin transaction.
2. Delete `expected_events` for `userId` where `source in ('recurrence_group','pay_cadence')` and `status='pending'` and `expected_date >= today`. (User-state rows — snoozed, dismissed, matched, superseded — survive; manual rows survive.)
3. For each active `recurrence_group`: project forward by cadence to fill horizon, insert rows with `source='recurrence_group'`, `source_id=group.id`, amount = `median_amount_cents` (signed), `low/high` from stddev band, `status='pending'`, `confidence=group.confidence`.
4. For each active `pay_cadence`: same pattern, `source='pay_cadence'`.
5. Commit.

Idempotent: running twice gives the same final state.

#### `match-expected-events`

Triggered after each transaction insert (during parse or manual entry).

```typescript
export async function matchExpectedEventsForTransaction(
  transactionId: TransactionId
): Promise<{ matchedEventId: ExpectedEventId | null }>;
```

Algorithm:

1. Load transaction.
2. Find candidates: `expected_events` where `user_id = tx.user_id` and `account_id = tx.account_id` and `status in ('pending','snoozed')` and `expected_date between tx.posted_date - 3 and tx.posted_date + 3` and `expected_amount_cents` sign matches `tx.amount_cents` and `abs(tx.amount_cents)` between `expected_amount_low_cents` and `expected_amount_high_cents`. Snoozed events are matchable: snooze hides the event in UI; if the underlying charge actually lands, it should still be reconciled.
3. Pick the closest candidate by `(abs(date_delta), abs(amount_delta))` lexicographically; tie-break on `expected_events.id`.
4. If found: `update expected_events set status='matched', matched_transaction_id = tx.id where id = winner.id`.
5. Return the winner id (or null).

### 5.5 Read queries

```typescript
// lib/db/queries/bills-calendar.ts
export interface CalendarDay {
  date: ISODate;
  events: Array<{
    id: ExpectedEventId;
    description: string;
    expectedAmountCents: Cents;
    confidence: number;
    source: 'recurrence_group'|'pay_cadence'|'manual';
    effectiveStatus: 'pending'|'snoozed'|'matched'|'dismissed';
  }>;
}
export function getBillsCalendar(
  userId: UserId, monthStart: ISODate, monthEnd: ISODate
): Promise<CalendarDay[]>;

// lib/db/queries/direct-debits-list.ts
export interface DirectDebit {
  groupId: RecurrenceGroupId;
  merchantName: string;
  kind: DirectDebitKind;
  cadence: string;
  observedAmountLowCents: Cents;
  observedAmountHighCents: Cents;
  lastSeenDate: ISODate;
  nextExpectedDate: ISODate;
  status: 'active'|'suspected'|'paused'|'cancelled';
}
export function getDirectDebitRegister(
  userId: UserId, options?: { activeOnly?: boolean; recentlyChanged?: boolean }
): Promise<DirectDebit[]>;

// lib/db/queries/liquidity-preview.ts
export interface LiquidityPreview {
  asOf: ISODate;
  startBalanceCents: Cents;
  bufferCents: Cents;
  horizonDays: 30 | 60 | 90;
  points: RunwayPoint[];          // from runway.ts
  dipsBelowBuffer: Array<{ date: ISODate; shortfallCents: Cents }>;
}
export function getLiquidityPreview(
  userId: UserId, horizonDays: 30|60|90
): Promise<LiquidityPreview>;
```

### 5.6 UI surfaces

Three pages, all under `/runway/*`. Each is a thin shell over the queries above.

**`/runway`** — liquidity preview. Daily-balance line chart with shaded `low`/`high` band, a horizontal buffer line at `users.cashflow_buffer_cents`, and red markers on dip-below-buffer days. A list under the chart enumerates the next ~10 events with date, description, signed amount, confidence dot. Toggle: 30 / 60 / 90 day horizon.

**`/runway/calendar`** — bills calendar. Month grid; each day cell lists expected events with confidence dot. Click a cell → side panel showing each event with affordances: `dismiss | snooze until <date> | mark cancelled at source`. "Mark cancelled at source" updates the underlying `recurrence_group.status='cancelled'` and re-runs projection.

**`/runway/direct-debits`** — direct-debit register table. Sortable on every column. Two filters: "active only" and "recently changed amount" (latest charge >1.05× rolling median). Row click opens transaction history for that recurrence_group.

### 5.7 End-to-end data flow — five traces

**Statement uploaded → calendar updates**
```
upload → R2 → pg-boss parse job → transactions inserted (Phase 1)
       → recurrence detector runs (per-account batch)
       → recurrence_groups upserted
       → project-expected-events worker queued for affected user
       → expected_events rebuilt for next 90d
       → calendar / liquidity preview reflect on next page load
```

**New transaction → matcher reconciles**
```
transaction inserted (parse OR manual)
       → match-expected-events worker runs for that tx
       → finds pending event: same account, ±3d, amount in [low,high]
       → marks closest match status='matched', sets matched_transaction_id
       → liquidity preview no longer counts it as future outflow
```

**User cancels a recurring charge**
```
user clicks "mark cancelled at source" on a calendar entry
       → recurrence_groups.status = 'cancelled'
       → project-expected-events worker re-runs for that user
       → all future expected_events from that group deleted on rebuild
       → calendar empty for that merchant going forward
```

**User snoozes one event**
```
user clicks "snooze until <date>"
       → expected_events.status='snoozed', snoozed_until = <date>
       → projection worker leaves snoozed rows alone (only deletes status='pending')
       → effective status computed on read (lazy):
           if status='snoozed' and snoozed_until <= today → treated as pending
       → no worker churn for snooze expiry
```

**User adds a manual event**
```
direct insert into expected_events with source='manual', status='pending'
       → projection rebuild ignores manual rows (only deletes auto-source rows)
       → row persists across re-materialisations until user dismisses
```

### 5.8 Error handling

| Failure mode | Detection | Behaviour |
|---|---|---|
| **Recurrence drift** (cancelled IRL, still projected) | matcher fails to match within 1.5× `median_interval_days` of `next_expected_date` | `recurrence_groups.status` auto-flips `active → suspected`. Projection worker stops generating from this source. UI shows "Did you cancel this?" with confirm/dismiss. |
| **Pay didn't arrive** | same logic on `pay_cadences` | `pay_cadences.active=false`, surface "pay didn't land — confirm or update." |
| **Detected vs manual cadence conflict** | both rows for same employer/account | manual.active=true wins. Detected row marked `superseded`; not deleted (audit). |
| **Mid-projection read** | concurrent worker run + page query | projection worker uses single db transaction (delete + insert atomic). Queries see one consistent snapshot. |
| **No transactions yet** | account has zero parsed transactions | liquidity preview renders current balance only with banner: "Add ≥1 month of statements to see projections." |
| **Re-uploaded statement corrects past data** | duplicate-handling already exists in §6 | recurrence detector re-runs on parse complete. Idempotent. |
| **Ambiguous matcher** | matcher finds >1 candidate within bands | pick closest by `(abs(date_delta), abs(amount_delta))` lexicographically; tie-break by lower `expected_events.id`. UI exposes the match in tx detail with "this isn't right" affordance flipping `status='pending'` and opening manual link picker. |
| **Snooze date in the past on read** | lazy effective-status computation in queries | event treated as pending; no worker needed for expiry. |
| **Account closed mid-window** | `accounts.is_active=false` | projection worker filters to active accounts; existing future events for closed account marked `superseded`. |

### 5.9 Testing strategy

Per `CLAUDE.md`: Vitest unit + Playwright E2E + redacted statement fixtures under `/tests/fixtures/`.

**Unit (Vitest) — per pure function, fixture-driven**

- `recurrence.detectRecurrence` — golden fixtures: monthly Netflix, fortnightly rent, irregular gym DD, "looks recurring but isn't" (3 random charges). Assert which become groups.
- `pay-cadence.detectPayCadence` — fortnightly / monthly / weekly employer fixtures. Edge cases: missed pay period, double-pay (back-pay).
- `runway.projectRunway` — deterministic in/out. Boundary cases: events on day 0, events past horizon (ignored), negative starting balance, empty event list.
- `direct-debits.classifyAsDirectDebit` — string fixtures: `"DD ENERGYAUSTRALIA"` → `dd_mandate`, `"BPAY 12345"` → `bpay`, `"TFR FROM SAVINGS"` → `null`.

**Integration (Vitest + test Postgres) — workers**

- Idempotency: run `project-expected-events` twice, assert same final row set.
- Manual preservation: insert `source='manual'` row, run projection, manual row still present.
- Matcher correctness: insert transaction matching one of two pending events, assert correct one marked matched.
- Drift suspicion: simulate "expected pay didn't land" by advancing clock past `next_pay_date + 1.5 × cadence_days`; assert `pay_cadences.active=false` and a suspicion record created.

**E2E (Playwright)**

- Upload anonymised CBA + Up fixture set → land on `/runway` → projection visible, buffer line drawn, ≥1 dip flagged.
- Click bills calendar entry → snooze → projection refreshes → buffer dip resolves.
- Click recurrence in direct-debit register → "mark cancelled at source" → confirm → calendar empty for that merchant.
- Add manual event → run projection rebuild → manual event persists.

**Fixtures** — one anonymised statement set per major bank used in unit + E2E. Stored under `/tests/fixtures/cashflow-runway/`.

---

## 6. AU Tax Sidekick — roadmap sketch

This section is intentionally a sketch, not a full design. Full Tax Sidekick design is a later spec session. Goal here: lock in what schema lands now, what sequence the features ship in, and how they reuse Phase 2.5 foundations.

### 6.1 What lands in Phase 0/1 (already in §3)

- `categories.is_deductible_candidate` + `categories.deduction_kind`
- `transactions.receipt_object_key` + `transactions.receipt_uploaded_at`
- AU subcategory seed taxonomy: WFH-utilities, donations-DGR, work-tools, motor-vehicle, professional-subscriptions

### 6.2 Feature sequencing

| Feature | Phase | Notes |
|---|---|---|
| Deductible filter on transaction list | 3 | UI surface on existing flag. Trivial. |
| Receipts vault UX (attach + FY folder view) | 4 | Schema already there. Upload UI + R2 signed URLs. |
| WFH hours tracker (67c/hr fixed-rate; PCG 2023/1) | 4 | Standalone module; no payslip dependency. |
| Donation tracker (auto-flag DGR matches) | 5 | Needs seed DGR registry. Conservative: flag only, never claim. |
| Super cap monitor (concessional headroom) | 5 | Needs Phase 4 payslip parsing depth. |
| Tax obligations on runway calendar (BAS, Jun 30, return due) | 5 | **Reuses `expected_events` directly** — `source='tax_obligation'`. No schema change. |
| FY tax pack export (ZIP) | 6 | Capstone. Aggregation over data that exists by then. |

### 6.3 Foundations reuse

The architectural payoff of ADR-11: **tax obligations are just another event source.** BAS due dates, super deadlines, June 30, rego renewals — all live in `expected_events` with `source='tax_obligation'`. Same calendar UI, same snooze/dismiss affordances, same liquidity-preview integration ("you'll be short on June 28th unless you delay the super contribution"). Zero new infrastructure when it ships.

### 6.4 AU-specific decisions to lock in now

- **Financial year = 1 Jul – 30 Jun.** All FY-bounded queries use this. Add a `Fy` helper in `/lib/types`.
- **WFH method = PCG 2023/1 fixed-rate (67c/hr) for V1.** Actual-cost method deferred. Single helper: `claimableWfhCents(hoursLogged: number, fy: Fy): Cents`.
- **Super cap stored in config**, not hard-coded. Indexes annually. `lib/config/au-tax.ts` exports `concessionalCapCents(fy: Fy)`. Current value: $30,000 for FY24-25.
- **DGR status is advisory.** Flag transactions whose merchant matches the seed DGR list + surface "looks like a deductible donation — confirm with receipt." Never auto-claim.

### 6.5 Updates required to PLAN.md §8

(Already integrated into §4 above.)

### 6.6 Deferred to a later spec

- WFH actual-cost method
- Vehicle logbook compliance (ATO format)
- Multi-employer payroll edge cases
- Capital-gains lite for share trades
- Payslip PDF parser per provider (Xero / MYOB / Employment Hero / Keypay / ADP)

---

## 7. Open questions

None blocking implementation. The following are deferred but worth noting:

- **DGR seed registry source.** Australian Government publishes a list; we'll snapshot it. Refresh cadence TBD when Phase 5 lands.
- **Confidence thresholds** for `recurrence` auto-promotion to `active` vs `suspected`. Calibrate against the user's own data during Phase 2.5; expose as constants in `lib/config/recurrence.ts`.
- **Buffer threshold default ($500).** Reasonable AU starting point; user-adjustable in settings. Revisit after dogfooding.
- **Path casing.** Repo has `Docs/` (capitalised); `PLAN.md` and `CLAUDE.md` reference `/docs/...` (lowercase). Filesystem is case-insensitive on Windows so it works, but worth normalising at some point. Out of scope here.

---

## 8. Changelog

- **v0.1 (2026-05-04)** — Initial draft. Three new ADRs (9, 10, 11). Schema deltas covering tax-aware categorisation foundations and the cashflow-forecasting read model. Phase 2.5 inserted. Cashflow Runway fully designed; AU Tax Sidekick sketched.
