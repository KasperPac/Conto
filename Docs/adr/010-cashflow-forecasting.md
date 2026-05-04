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
