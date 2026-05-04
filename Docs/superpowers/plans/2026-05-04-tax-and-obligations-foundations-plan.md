# Tax & Obligations Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit the architectural direction (3 new ADRs) and update `PLAN.md` (schema deltas, Phase 2.5 insertion, tax-feature sequencing) so future code work is anchored to a clear, written plan.

**Architecture:** Documentation-only. No code. Each task creates or updates a markdown file. The deliverable is a self-consistent set of decision records and an updated planning document that reflect the brainstorming outcomes from `Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md`.

**Tech Stack:** Markdown.

**Source spec:** `Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md`.

**Pre-execution note:** The repository is not yet a git repo (per `CLAUDE.md` session context at the time the spec was written). The "Commit" step in each task is correct in spirit but will only run cleanly after `git init` + initial commit. If the repo is still not git-tracked when this plan executes, replace the commit step with "stage for the first commit" and pile commits up at end. Do not skip the verification steps.

---

### Task 1: Write ADR-9 — Tax-aware categorisation as committed differentiator

**Goal:** A self-contained decision record explaining why categories carry deduction flags from V1.

**Files:**
- Create: `Docs/adr/009-tax-aware-categorisation.md`

**Acceptance Criteria:**
- [ ] File exists at the path above.
- [ ] Has sections: `Status`, `Context`, `Decision`, `Consequences`.
- [ ] Status is `Accepted`.
- [ ] References ADR-1 (multi-tenancy from day one) and ADR-4 (rules before ML).
- [ ] Lists the schema columns added in V1: `categories.is_deductible_candidate`, `categories.deduction_kind`, `transactions.receipt_object_key`, `transactions.receipt_uploaded_at`.
- [ ] Names the AU seed taxonomy buckets explicitly: WFH-utilities, donations-DGR, work-tools, motor-vehicle, professional-subscriptions.

**Verify:** PowerShell — `Test-Path Docs/adr/009-tax-aware-categorisation.md` returns `True`. Then `Select-String -Path Docs/adr/009-tax-aware-categorisation.md -Pattern '^## Status','^## Context','^## Decision','^## Consequences'` should match all four headings.

**Steps:**

- [ ] **Step 1: Create the ADR file with the content below**

```markdown
# ADR-9: Tax-aware categorisation is a committed differentiator

## Status

Accepted — 2026-05-04.

## Context

Conto's stated principles (`PLAN.md` §1) commit to "trust through transparency" and "correctness over coverage." For an Australian personal-finance tool, those principles only deliver if tax-relevant data is captured *as transactions flow in*, not retrofitted at end-of-financial-year. Two practical realities motivate this:

1. Retrofitting deduction-awareness across a populated transaction store requires bulk reclassification, which conflicts with ADR-5 (soft deletes only — reclassifications create new rules, not history mutations).
2. Receipts captured weeks after a purchase are far less likely to be retained at all. Attaching at categorisation time costs almost nothing; chasing them later costs everything.

Personal-finance apps that rely on bank-API linking generally do not solve this — they categorise after the fact and do not capture the supporting evidence (a receipt) at all. This is a real point of difference for Conto.

## Decision

Tax-awareness is a committed differentiator. From V1:

1. Every category carries `is_deductible_candidate boolean` and `deduction_kind text` columns.
2. The seeded subcategory taxonomy includes AU deductible buckets: **WFH-utilities, donations-DGR, work-tools, motor-vehicle, professional-subscriptions**.
3. Every transaction can attach a receipt: `transactions.receipt_object_key text` (R2 key) and `transactions.receipt_uploaded_at timestamptz`.

The full Tax Sidekick feature set (WFH hours tracker, super cap monitor, donation tracker, FY tax pack export) is sequenced through Phases 3–6 (`PLAN.md` §8). The schema scaffolding lands in Phase 0/1 so no migration is required when those features ship.

## Consequences

- Phase 0 migrations carry these columns and seed the AU taxonomy. See `PLAN.md` §4.
- Phase 1 transaction views show the deduction flag; users can filter "deductible candidates this FY" from Phase 3.
- Phase 4 ships receipts vault UX (upload + FY-bounded folder view) on top of the V1 columns.
- We accept that some deductible categorisations will be wrong — flagging is advisory, never authoritative. This aligns with the existing principle "Correctness over coverage" (`PLAN.md` §1).
- Per ADR-1, RLS policies on `transactions` already isolate `receipt_object_key` per user; R2 object keys are prefixed with user id.
- Per ADR-4, deduction logic is rule-based (matching against `merchants.patterns` and user rules), not ML-driven.

## References

- ADR-1: Single Postgres database, multi-tenant schema from day one.
- ADR-4: Rules before ML.
- ADR-5: Soft deletes only.
- Spec: `Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md` §2 (ADR-9).
```

- [ ] **Step 2: Verify the file exists and has the four required headings**

Run (PowerShell):
```powershell
Test-Path Docs/adr/009-tax-aware-categorisation.md
Select-String -Path Docs/adr/009-tax-aware-categorisation.md -Pattern '^## Status','^## Context','^## Decision','^## Consequences' | Measure-Object | Select-Object -ExpandProperty Count
```
Expected: `True` then `4`.

- [ ] **Step 3: Commit**

```bash
git add Docs/adr/009-tax-aware-categorisation.md
git commit -m "phase0/adr: add ADR-9 (tax-aware categorisation as committed differentiator)"
```

(If repo isn't git-tracked yet: skip. Will be included in initial commit.)

---

### Task 2: Write ADR-10 — Cashflow forecasting as committed differentiator

**Goal:** A self-contained decision record explaining why Conto projects forward, not just reports past.

**Files:**
- Create: `Docs/adr/010-cashflow-forecasting.md`

**Acceptance Criteria:**
- [ ] File exists.
- [ ] Has Status / Context / Decision / Consequences sections; Status is `Accepted`.
- [ ] References ADR-4 (rules before ML) and ADR-5 (soft deletes — historical projections preserved).
- [ ] States the 30/60/90-day horizon explicitly.
- [ ] Names the new Phase 2.5 module by position (after Phase 2 linking & integrity, before Phase 3 classification polish).

**Verify:** `Test-Path Docs/adr/010-cashflow-forecasting.md` returns `True`. `Select-String` for the four headings returns 4.

**Steps:**

- [ ] **Step 1: Create the ADR file**

```markdown
# ADR-10: Cashflow forecasting is a committed differentiator

## Status

Accepted — 2026-05-04.

## Context

Most personal-finance products report past spending. The question users actually ask — "will I be okay next month?" — is rarely answered. Conto's "no bank API linking" stance is privacy-positive but defensive; cashflow forecasting is a positive, hard-to-copy story for a product trying to differentiate.

Forecasting requires three inputs:
1. **Current balance** — already known (account opening balance + ledger).
2. **Expected outflows** — recurring detection (`PLAN.md` §5.5 covers the algorithm).
3. **Expected inflows** — pay cadence (detected from credits, optionally overridden by manual payslip entry).

The data is essentially already in scope. The question this ADR commits is whether the *feature* — projecting and showing the next 30/60/90 days — is a first-tier deliverable or a nice-to-have. We commit it as first-tier.

## Decision

Cashflow forecasting is a committed differentiator. Conto reports the past **and** projects the next 30/60/90 days from current balance + expected income + expected outflows. This requires:

1. A new Phase 2.5 module (`PLAN.md` §8) inserted between Phase 2 (linking & integrity) and Phase 3 (classification & subscription polish).
2. Lifting the recurrence-detection engine out of original Phase 3 (§5.5) into Phase 2.5, transactions-only — Phase 3 keeps the subscription-dashboard polish.
3. Lifting manual payslip entry + pay cadences out of original Phase 4 into Phase 2.5. Phase 4 retains payslip-PDF parsing depth.
4. A new `expected_events` table — see ADR-11.

The Phase 2.5 deliverable is called **Cashflow Runway** — three views: liquidity preview, bills calendar, direct-debit register.

## Consequences

- Recurring detection ships earlier than originally planned. The same engine powers subscription detection in Phase 3 (§5.5).
- Manual payslip entry ships in Phase 2.5; PDF parsing remains a Phase 4 concern.
- All forecasting logic is rule-based (per ADR-4); no ML in the projection path.
- Historical projections are preserved via the `expected_events.generated_at` timestamp + `status` lifecycle (consistent with ADR-5 — we don't mutate past projections).
- The trade-off engine (`PLAN.md` §5.6, Phase 5) reuses the recurrence-detection data, so Phase 5 work shrinks.

## References

- ADR-4: Rules before ML.
- ADR-5: Soft deletes only.
- ADR-11: Expected events are first-class.
- Spec: `Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md` §2 (ADR-10) and §5 (full Cashflow Runway design).
```

- [ ] **Step 2: Verify**

```powershell
Test-Path Docs/adr/010-cashflow-forecasting.md
Select-String -Path Docs/adr/010-cashflow-forecasting.md -Pattern '^## Status','^## Context','^## Decision','^## Consequences' | Measure-Object | Select-Object -ExpandProperty Count
```
Expected: `True` then `4`.

- [ ] **Step 3: Commit**

```bash
git add Docs/adr/010-cashflow-forecasting.md
git commit -m "phase0/adr: add ADR-10 (cashflow forecasting as committed differentiator)"
```

---

### Task 3: Write ADR-11 — Expected events are first-class

**Goal:** A self-contained decision record explaining the choice of a materialised `expected_events` table over computed-on-demand projection.

**Files:**
- Create: `Docs/adr/011-expected-events-first-class.md`

**Acceptance Criteria:**
- [ ] File exists with the four required sections.
- [ ] Status is `Accepted`.
- [ ] States the alternative considered (computed-on-demand) and why it was rejected.
- [ ] Names the source values (`recurrence_group`, `pay_cadence`, `manual`, future `tax_obligation`).
- [ ] States the re-materialisation contract: only `status='pending'` rows from auto-sources are clobbered.
- [ ] References ADR-1 (RLS) and the spec.

**Verify:** `Test-Path` and four-headings check as in Tasks 1–2.

**Steps:**

- [ ] **Step 1: Create the ADR file**

```markdown
# ADR-11: Expected events are first-class

## Status

Accepted — 2026-05-04.

## Context

Cashflow Runway (ADR-10) needs to project a daily picture of upcoming inflows and outflows. There are two viable shapes for this data:

1. **Computed on demand** — every read recomputes the projection from `recurrence_groups`, `pay_cadences`, and any user overrides.
2. **Materialised** — a dedicated `expected_events` table is rebuilt periodically from sources; reads are simple selects.

Approach (1) is appealing on data-integrity grounds (one source of truth) but creates real UX friction:
- User actions on a future event (snooze, dismiss, "I cancelled this," add a note) need a side-table of overrides keyed by some synthetic identity.
- Each consumer (calendar, liquidity preview, future tax-obligation reminders) re-implements the projection.
- "What did the calendar show last Tuesday?" is hard to answer without query-time time-travel.
- Conto's transparency principle (`PLAN.md` §1.1) loses traction: numbers without rows have no stable identity to drill into.

Approach (2) inverts these trade-offs. The cost is a projection worker and an explicit re-materialisation contract.

## Decision

`expected_events` is a first-class table. Bills calendar, liquidity preview, and (later) tax-obligation reminders all read from it.

Rules:

1. **Source enum:** `recurrence_group | pay_cadence | manual | tax_obligation`. The last is reserved for the future Tax Sidekick (`Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md` §6).
2. **Re-materialisation contract:** the `project-expected-events` worker, when run for a user, executes:
   ```sql
   delete from expected_events
     where user_id = $1
       and source in ('recurrence_group','pay_cadence')
       and status = 'pending'
       and expected_date >= current_date;
   ```
   then inserts fresh rows from active `recurrence_groups` and `pay_cadences` for the next 90 days.
3. **Survival:** `status in ('snoozed','dismissed','matched','superseded')` rows survive — they reflect user state or transaction history. `source='manual'` rows survive — they are user-entered source-of-truth. `source='tax_obligation'` rows survive — they are managed by Tax Sidekick logic.
4. **Atomicity:** delete + insert run in a single db transaction so concurrent reads see one consistent snapshot.

## Consequences

- A projection worker (`lib/jobs/project-expected-events.ts`) runs nightly via pg-boss and on writes to `recurrence_groups` / `pay_cadences`.
- A matcher worker (`lib/jobs/match-expected-events.ts`) runs after each transaction insert and reconciles incoming transactions against pending events. Snoozed events are also matchable (snooze hides UI; the underlying charge can still arrive).
- Snooze expiry is computed lazily on read (no worker needed): an event with `status='snoozed' and snoozed_until <= today` is treated as pending.
- All new tables (`recurrence_groups`, `pay_cadences`, `expected_events`) carry `user_id` per ADR-1 with mirrored RLS policies.
- The trade-off engine (Phase 5, `PLAN.md` §5.6) reads from `expected_events` rather than re-deriving projections.
- We accept some duplication of state across `recurrence_groups` (canonical) and `expected_events` (projected). Drift is bounded by the re-materialisation contract; suspected drift triggers `recurrence_groups.status='suspected'` automatically.

## References

- ADR-1: Single Postgres database, multi-tenant schema from day one.
- ADR-10: Cashflow forecasting as committed differentiator.
- Spec: `Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md` §2 (ADR-11), §3.5 (schema), §3.7 (re-materialisation contract), §5.4 (worker algorithms).
```

- [ ] **Step 2: Verify**

```powershell
Test-Path Docs/adr/011-expected-events-first-class.md
Select-String -Path Docs/adr/011-expected-events-first-class.md -Pattern '^## Status','^## Context','^## Decision','^## Consequences' | Measure-Object | Select-Object -ExpandProperty Count
```
Expected: `True` then `4`.

- [ ] **Step 3: Commit**

```bash
git add Docs/adr/011-expected-events-first-class.md
git commit -m "phase0/adr: add ADR-11 (expected events as first-class table)"
```

---

### Task 4: Update `Docs/PLAN.md` (ADRs §2, schema §4, phases §8, open questions §11, changelog)

**Goal:** Bring the planning document up to date with the three new ADRs and their schema/phase implications.

**Files:**
- Modify: `Docs/PLAN.md` (sections 2, 4, 8, 11, and changelog)

**Acceptance Criteria:**
- [ ] §2 lists ADR-9, ADR-10, ADR-11 as one-liner entries consistent with the existing 1–8 format.
- [ ] §4 contains the new schema for `recurrence_groups`, `pay_cadences`, `expected_events`, plus the alters on `categories` (deduction flag/kind), `transactions` (receipt slot + recurrence back-link), `users` (cashflow buffer), and `payslips` (cadence column).
- [ ] §8 lists Phase 2.5 between Phase 2 and Phase 3, with its bullets; Phase 3's heading is updated to "classification & subscription polish"; Phase 4 notes manual payslip entry has moved to 2.5; tax-feature placements appear in Phases 3, 4, 5, 6.
- [ ] §11 Open Questions has either a resolved or deferred entry referencing the new spec for any items the spec touches.
- [ ] Changelog has a `v0.2 (2026-05-04)` entry naming the three ADRs and the Phase 2.5 insertion.
- [ ] No existing content is deleted; everything is additive or clearly superseded with rationale.

**Verify:** PowerShell — `Select-String -Path Docs/PLAN.md -Pattern 'ADR-9','ADR-10','ADR-11','Phase 2.5','recurrence_groups','expected_events','pay_cadences','cashflow_buffer_cents','v0.2 \(2026-05-04\)' | Group-Object Pattern | Measure-Object | Select-Object -ExpandProperty Count` should return `9`.

**Steps:**

- [ ] **Step 1: Add ADR-9, ADR-10, ADR-11 entries to §2**

Open `Docs/PLAN.md`. After the existing `ADR-8: Every parser is a pure function.` paragraph (and before the `---` that closes §2), insert:

```markdown
**ADR-9: Tax-aware categorisation is a committed differentiator.**
Categories carry `is_deductible_candidate` and `deduction_kind` from V1. Seeded AU subcategory taxonomy includes deductible buckets (WFH-utilities, donations-DGR, work-tools, motor-vehicle, professional-subscriptions). Receipts attach to transactions via `receipt_object_key`. Full record: `/docs/adr/009-tax-aware-categorisation.md`.

**ADR-10: Cashflow forecasting is a committed differentiator.**
Conto reports past spending and projects the next 30/60/90 days from current balance + expected income + expected outflows. Implemented as the Cashflow Runway module in a new Phase 2.5. Full record: `/docs/adr/010-cashflow-forecasting.md`.

**ADR-11: Expected events are first-class.**
A dedicated `expected_events` table is materialised from `recurrence_groups` + `pay_cadences` + manual entries. Bills calendar, liquidity preview, and (future) tax-obligation reminders all read from it. Full record: `/docs/adr/011-expected-events-first-class.md`.
```

- [ ] **Step 2: Add the new schema to §4**

In `Docs/PLAN.md` §4, add the following at the end of the schema sections (before §5).

The `categories` table block in §4 currently ends with `is_discretionary boolean`. Replace the closing `)` of `categories` with:

```sql
  is_discretionary boolean,
  is_deductible_candidate boolean default false,
  deduction_kind text          -- wfh | donation | work_tools | motor_vehicle | professional_sub | other | null
)
```

The `transactions` table block ends with `created_at timestamptz`. Replace the closing `)` of `transactions` with:

```sql
  created_at timestamptz,
  receipt_object_key text,     -- R2 key, nullable
  receipt_uploaded_at timestamptz,
  recurrence_group_id uuid fk recurrence_groups nullable
)
```

The `users` table block ends with `created_at timestamptz`. Replace the closing `)` of `users` with:

```sql
  created_at timestamptz,
  cashflow_buffer_cents bigint default 50000  -- $500 default; user-adjustable in settings
)
```

The `payslips` table block ends with `created_at timestamptz`. Replace the closing `)` with:

```sql
  created_at timestamptz,
  cadence text                -- weekly | fortnightly | monthly | irregular (inferred or set)
)
```

Then add a new subsection at the end of §4 (after the existing "Subscriptions, goals, budgets" block):

```markdown
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
```

- [ ] **Step 3: Update §8 with Phase 2.5 and tax-feature placement**

In §8, locate the `### Phase 3 — classification & subscriptions` heading. **Before** it, insert:

```markdown
### Phase 2.5 — recurring & expected events
- Recurrence detector (lifted out of original §5.5; transactions-only, no subscription dashboard polish yet).
- Manual payslip entry + `pay_cadences` (lifted out of original Phase 4).
- `project-expected-events` worker (rebuilds projection from active sources).
- `match-expected-events` worker (reconciles incoming transactions against pending events).
- Liquidity preview view at `/runway` (30/60/90 day projection).
- Bills calendar view at `/runway/calendar`.
- Direct-debit register at `/runway/direct-debits`.

**Done when:** for the user's own data, the next 30 days project credibly and the bills calendar matches reality.
```

Rename `### Phase 3 — classification & subscriptions` to `### Phase 3 — classification & subscription polish`. Append to its bullets:
```markdown
- Subscription review UI is a filtered view on `recurrence_groups` (engine reused from 2.5).
- Deductible filter UI on transaction list (Tax Sidekick foothold).
```

In `### Phase 4 — payslips & income`, replace the bullet `- Manual payslip entry.` with `- (Manual payslip entry already done in Phase 2.5 — Phase 4 focuses on payslip-PDF parsing depth.)`. Append:
```markdown
- WFH hours tracker (Tax Sidekick — PCG 2023/1 fixed-rate method, 67c/hr).
- Receipts vault UX (attach + FY-bounded folder view).
```

In `### Phase 5 — goals, budgets, trade-offs`, append:
```markdown
- Donation tracker (Tax Sidekick; auto-flag transactions matching seed DGR registry; advisory only).
- Super cap monitor (Tax Sidekick; concessional-cap headroom from payslip super + employer SG).
- Tax obligations on the runway calendar (BAS, June 30, return due — `expected_events` with `source='tax_obligation'`; no schema change).
```

In `### Phase 6 — PDFs and tax`, append:
```markdown
- FY tax pack export (Tax Sidekick capstone): one ZIP per FY containing categorised income/expense CSVs, donation summary, super contributions summary, and all attached receipts.
```

- [ ] **Step 4: Update §11 (Open questions) and the Changelog**

In §11, append:
```markdown
- *Resolved 2026-05-04 (spec ref):* Conto commits to tax-aware categorisation and cashflow forecasting as headline differentiators (ADR-9, ADR-10). Schema scaffolding lands in Phase 0; full features sequenced through Phases 2.5–6. See `Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md`.
- *Deferred:* DGR registry refresh cadence; recurrence-detection confidence thresholds (calibrate during Phase 2.5 with own data). See spec §7.
```

In the Changelog at the end of `PLAN.md`, append:
```markdown
- **v0.2 (2026-05-04)** — Adopt ADR-9 (tax-aware categorisation), ADR-10 (cashflow forecasting), ADR-11 (expected events first-class). Schema additions in §4: `recurrence_groups`, `pay_cadences`, `expected_events`; alters to `categories`, `transactions`, `users`, `payslips`. Phase 2.5 inserted in §8 between Phase 2 and Phase 3. Tax features sequenced into Phases 3–6.
```

- [ ] **Step 5: Verify all required strings are present**

Run (PowerShell):
```powershell
'ADR-9','ADR-10','ADR-11','Phase 2.5','recurrence_groups','expected_events','pay_cadences','cashflow_buffer_cents','v0.2 \(2026-05-04\)' | ForEach-Object { @{ pattern=$_; matches=(Select-String -Path Docs/PLAN.md -Pattern $_ | Measure-Object).Count } } | Format-Table
```
Expected: every pattern returns ≥ 1 match. Eyeball the table; no zeroes.

- [ ] **Step 6: Commit**

```bash
git add Docs/PLAN.md
git commit -m "phase0/plan: integrate ADRs 9-11 — schema deltas, Phase 2.5, tax-feature sequencing"
```

---

## Self-Review Notes (informational, not part of execution)

- **Spec coverage:** every ADR (9, 10, 11) has its own task. PLAN.md updates cover §2, §4, §8, §11, and changelog — every section the spec said would change. Schema deltas in Task 4 Step 2 cover all five table changes (`categories`, `transactions`, `users`, `payslips` alters + three new tables). Phase reordering in Task 4 Step 3 covers Phase 2.5 + Phase 3 rename + Phase 4/5/6 tax-feature placements.
- **Placeholder scan:** no TBD/TODO patterns. The git-not-initialised caveat is named in the pre-execution note, not buried.
- **Type consistency:** N/A — documentation-only plan.
- **Scope:** four tasks for foundations only. Cashflow Runway implementation is a separate plan.
