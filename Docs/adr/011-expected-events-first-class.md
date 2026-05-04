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
