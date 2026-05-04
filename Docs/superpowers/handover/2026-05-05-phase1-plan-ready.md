# Handover — Phase 1 Plan Ready

**Date:** 2026-05-05  
**Session:** Brainstorming + plan writing for Phase 1

---

## What happened this session

Phase 0 was confirmed complete (auth, R2 upload, pg-boss worker, full schema, test suite all passing).

Phase 1 was brainstormed and fully planned. Key discovery: all example statements are PDFs, not CSVs, so the plan's "CSV-first" sequencing was superseded. Phase 1 ships PDF parsers for NAB and Up Bank.

**Artifacts produced:**
- Design spec: `docs/superpowers/specs/2026-05-04-phase1-ingest-view-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-04-phase1-ingest-view.md`
- Task persistence: `docs/superpowers/plans/2026-05-04-phase1-ingest-view.md.tasks.json`

---

## Key decisions

| Decision | Choice | Reason |
|---|---|---|
| CSV or PDF first? | PDF first | Only PDFs available in example statements/ |
| Account creation | Detect-then-create | Parser auto-creates account from PDF metadata |
| UI layout | Desktop-class (max-w-4xl) | Matches existing layout |
| Real-time job status? | No — manual refresh | Phase 1 simplicity |
| Banks in scope | NAB + Up Bank | Confirmed text-based PDFs; Ricoh files deferred |

---

## Example statements identified

| Files | Bank | Format | Status |
|---|---|---|---|
| `Statement.pdf`, `Statement (1-3).pdf` | NAB | Smart Communications SC32 (text) | In scope |
| `statement-2025-11_copy.pdf` … `statement-2026-03.pdf` | Up Bank | Prawn PDF (text) | In scope |
| `Statement (4).pdf`, `Statement (5).pdf` | Unknown (Ricoh AFP2PDF) | Image-based | Deferred |

Fixtures to copy: `example statements/Statement.pdf` → `tests/fixtures/pdf/nab/nab_pdf_v1_sample.pdf`  
`example statements/statement-2026-03.pdf` → `tests/fixtures/pdf/up/up_pdf_v1_sample.pdf`

---

## Implementation plan summary

12 tasks in dependency order:

1. Schema migration (`statements.account_id` → nullable) + pdfjs-dist + extraction utility
2. Bank detection + Up fixture
3. NAB parser (`nab_pdf_v1`)
4. Up Bank parser (`up_pdf_v1`)
5. Parser dispatch + R2 `getObject`
6. DB query helpers (statements, accounts, transactions)
7. `parse-statement` job + upload API wiring + integration test ← **core deliverable**
8. Statements page + shadcn Badge/Select/Dialog
9. Accounts page + inline rename
10. Transaction list page with filters
11. Categories page + reclassification modal + integration test
12. Nav update + E2E test

Tasks 3–4 can run in parallel after Task 1. Tasks 8–11 can run in parallel after Task 7.

---

## To resume implementation

```
/superpowers-extended-cc:executing-plans docs/superpowers/plans/2026-05-04-phase1-ingest-view.md
```

Or use subagent-driven development in a fresh session.

---

## Schema change needed (Task 1)

`lib/db/schema.ts` — `statements.accountId` must change from `.notNull()` to nullable before any other work proceeds. Requires `npm run db:generate && npm run db:migrate`.

---

## pdfjs-dist import note

Use `pdfjs-dist/legacy/build/pdf.mjs` for Node.js server-side use. If ESM issues arise with the legacy path, try `pdfjs-dist` directly with `GlobalWorkerOptions.workerSrc = ''`.
