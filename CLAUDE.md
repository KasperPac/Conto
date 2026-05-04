# Conto

Personal finance app. Ingests bank statements and payslips (no bank API linking), gives the user honest visibility into their money, and helps them plan changes.

**For the full plan, read `/docs/PLAN.md`.** This file is the short version that Claude Code should keep in context every session.

---

## Principles

1. **Trust through transparency.** Every number must be traceable to a transaction.
2. **Correctness over coverage.** Mark "uncategorised" rather than guess wrong.
3. **The user is the source of truth.** Rules learn from user corrections, never the reverse.
4. **No double-counting.** Transfers and credit-card payments are excluded from spending.
5. **Personal first, multi-tenant ready.** One user now, schema assumes tenancy.

## Stack

Next.js (App Router) · TypeScript strict · Postgres 16 · Drizzle ORM · Lucia/Auth.js · Tailwind + shadcn/ui · Recharts · pg-boss · Cloudflare R2 · Vitest + Playwright.

## Hard rules

- **Money is `bigint` cents.** Never floats. Use the `Cents` branded type.
- **Dates are `date`, times are UTC `timestamptz`.** Bank entries are dated, not timestamped.
- **Every domain table has `user_id`.** RLS policies in Postgres enforce it.
- **Parsers are pure functions.** `(input) => ParsedRow[]`. No I/O, no side effects.
- **Soft delete only.** Reclassifications create new rules; never mutate history.
- **Migrations are forward-only.** Never edit a committed migration.
- **Rules before ML.** Deterministic classification first. Embeddings are V2.

## Repo layout

```
/app                  Next.js routes
/components           React components
/lib
  /db                 Drizzle schema, migrations, queries
  /parsers/{csv,pdf,payslips}
  /domain             transfers, creditcards, classification, subscriptions, tradeoff, tax
  /jobs               pg-boss handlers
  /storage            R2 client
  /types              Cents, branded types, shared contracts
/tests/{fixtures,unit,e2e}
/docs/PLAN.md         full planning doc
/docs/adr             numbered ADRs
```

## Don't do this

- Don't link directly to bank APIs. Statement upload only.
- Don't parse statements in the browser.
- Don't hard-delete transactions.
- Don't guess at bank statement formats — ask for sample files first.
- Don't word recommendations as advice ("you should…"). Use information framing ("you could free up $X by…").
- Don't add ML/embeddings before rule-based logic is solid.
- Don't skip writing parser fixtures. Every new parser ships with redacted samples in `/tests/fixtures/`.

## Conventions

- Commit messages: `phase/area: change` (e.g. `phase2/transfers: add ±3 day window`).
- ADRs in `/docs/adr/NNN-title.md`, numbered, superseded not edited.
- Pure functions wherever possible. They're trivial to test.
- All money values written as `_cents` columns and `Cents` types in code.

## Current phase

Phase 0 — foundation. See `/docs/PLAN.md` §8 for the full phase breakdown.
