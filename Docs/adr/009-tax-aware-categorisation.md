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
- Phase 4 ships receipts vault UX (upload + FY-bounded folder view) on top of the V1 columns, plus the WFH hours tracker (PCG 2023/1 fixed-rate method, 67c/hr). Donation tracker and super cap monitor land in Phase 5; FY tax pack export is the Phase 6 capstone. See `PLAN.md` §8 for the full sequence.
- We accept that some deductible categorisations will be wrong — flagging is advisory, never authoritative. This aligns with the existing principle "Correctness over coverage" (`PLAN.md` §1).
- Per ADR-1, RLS policies on `transactions` already isolate `receipt_object_key` per user; R2 object keys are prefixed with user id.
- Per ADR-4, deduction logic is rule-based (matching against `merchants.patterns` and user rules), not ML-driven.

## References

- ADR-1: Single Postgres database, multi-tenant schema from day one.
- ADR-4: Rules before ML.
- ADR-5: Soft deletes only.
- Spec: `Docs/superpowers/specs/2026-05-04-tax-and-obligations-foundations-design.md` §2 (ADR-9).
