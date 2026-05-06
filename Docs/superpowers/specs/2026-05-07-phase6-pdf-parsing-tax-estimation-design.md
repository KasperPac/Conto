# Phase 6 — MYOB Payslip Parser + Tax Estimation: Design Spec

## Scope

Two deliverables for personal MVP:

1. **MYOB payslip PDF parser** — pure function that extracts payslip fields from a MYOB-generated PDF, wired into a new synchronous upload endpoint
2. **Tax estimation** — `/tax/estimate` page projecting annual tax liability from payslips + deductible-flagged transactions, showing estimated refund or liability

### Deliberately out of scope for this phase

- Bank PDF parsers for CBA, ANZ, NAB, Westpac (no sample files; existing Up + Virgin Money parsers sufficient for MVP)
- LLM fallback for unknown statement formats
- FY tax pack ZIP export
- Multi-year FY selector

---

## 1. MYOB Payslip Parser

### 1.1 Parser — `lib/parsers/payslips/myob.ts`

Pure function. Template ID: `myob_pdf_v1`.

Uses the existing `extractRows` utility from `lib/parsers/pdf/extract.ts` to get positioned text items, then locates fields by text anchors:

| Field | Anchor text | Notes |
|---|---|---|
| `employer` | Second text block before `ABN:` | e.g. "Pac Technologies" |
| `period_start` / `period_end` | `Pay Period:` | Format `DD/MM/YYYY to DD/MM/YYYY` |
| `pay_date` | `Paid on:` | Format `DD/MM/YYYY` |
| `gross_cents` | `Total pay` row | Right-column dollar value |
| `tax_withheld_cents` | `Less PAYG` row | Right-column dollar value |
| `net_cents` | `Take home pay` row | Right-column dollar value |
| `super_cents` | `Contribution` row (after super fund heading) | Right-column dollar value |
| `salary_sacrifice_cents` | Not present in sample | Default `0n` |
| `pre_tax_deductions_cents` | Not present in sample | Default `0n` |
| `post_tax_deductions_cents` | Not present in sample | Default `0n` |

Output type matches the `payslips` table columns (all amounts as `bigint` cents).

Signature:
```typescript
export async function parseMyobPayslip(buf: Buffer): Promise<ParsedPayslip>

export interface ParsedPayslip {
  template_id: 'myob_pdf_v1';
  employer: string;
  period_start: string;  // ISO date YYYY-MM-DD
  period_end: string;
  pay_date: string;
  gross_cents: bigint;
  tax_withheld_cents: bigint;
  net_cents: bigint;
  super_cents: bigint;
  salary_sacrifice_cents: bigint;
  pre_tax_deductions_cents: bigint;
  post_tax_deductions_cents: bigint;
}
```

Throws `UnknownFormatError` (re-exported from `lib/parsers/pdf/types.ts`) if required anchors are not found.

### 1.2 Detection — `lib/parsers/payslips/detect.ts`

```typescript
export function detectPayslipFormat(rows: TextRow[]): 'myob_pdf_v1' | null
```

Identifies MYOB by the presence of all four anchors: `Pay Period:`, `Paid on:`, `Less PAYG`, `Take home pay`. Returns `null` if not matched.

### 1.3 Entry point — `lib/parsers/payslips/index.ts`

```typescript
export async function dispatchPayslip(buf: Buffer): Promise<ParsedPayslip>
```

Calls `detectPayslipFormat`, dispatches to `parseMyobPayslip`, throws `UnknownFormatError` if no format matched.

### 1.4 Test fixtures

Redacted copy of the sample payslip saved to `tests/fixtures/payslips/myob/payslip_sample.pdf`. Unit tests in `tests/unit/parsers/payslips/myob.test.ts` assert all parsed fields against expected values.

---

## 2. Payslip Upload Endpoint

### 2.1 API route — `POST /api/payslips/upload`

Synchronous — no background job. Payslip PDFs are small (~50KB) and single-page; parsing latency is negligible.

Flow:
1. Auth check (same pattern as `/api/upload`)
2. Accept `multipart/form-data` with a `file` field
3. Store PDF to R2 under key `payslips/{userId}/{uuid}.pdf`
4. Call `dispatchPayslip(buf)`
   - On `UnknownFormatError`: return `422 { error: 'unrecognised_payslip_format' }` — no record written
5. `INSERT INTO payslips` with all parsed fields, `source: 'pdf'`, `source_object_key` set
6. Enqueue `link-payslips` job for the user (same trigger as manual entry)
7. Return `200 { ok: true, payslipId }`

No schema changes — `payslips.source_object_key` and `payslips.source` already exist.

### 2.2 UI change — `/income/payslips`

Add an "Upload payslip PDF" button alongside the existing "Add manually" path. On click, opens a file picker (PDF only), POSTs to `/api/payslips/upload`, then revalidates the page. Both paths populate the same payslip list.

---

## 3. Tax Estimation Domain — `lib/domain/tax.ts`

Pure module. All arithmetic in `bigint` cents. No I/O.

### 3.1 Constants (FY 2025–26)

```typescript
const BRACKETS = [
  { threshold: 1_820_000n, rate: 0n,   base: 0n },
  { threshold: 4_500_000n, rate: 19n,  base: 0n },
  { threshold: 12_000_000n, rate: 32n, base: 509_200n },
  { threshold: 18_000_000n, rate: 37n, base: 2_946_700n },
  { threshold: null,        rate: 45n, base: 5_166_700n },
];
const MEDICARE_RATE = 2n;                   // percent
const MEDICARE_THRESHOLD_CENTS = 2_600_000n; // ~$26,000
const LITO_MAX_CENTS = 70_000n;             // $700
const LITO_PHASE_START_CENTS = 3_750_000n;  // $37,500
const LITO_PHASE_END_CENTS = 6_666_700n;    // $66,667
```

### 3.2 Function signature

```typescript
export interface TaxEstimateInput {
  fyGrossCents: bigint;         // YTD gross from payslips
  fyPaygCents: bigint;          // YTD PAYG withheld from payslips
  fyDeductionsCents: bigint;    // total deductible-flagged transaction amounts (absolute)
  weeksElapsed: number;
  totalFyWeeks: number;         // 52
}

export interface TaxEstimate {
  projectedGrossCents: bigint;
  totalDeductionsCents: bigint;
  projectedTaxableIncomeCents: bigint;
  estimatedTaxLiabilityCents: bigint;  // brackets + medicare − LITO
  projectedPaygCents: bigint;
  estimatedOutcomeCents: bigint;       // positive = refund, negative = bill
  isRefund: boolean;
}

export function estimateTax(input: TaxEstimateInput): TaxEstimate
```

Annualisation: `projected = (ytd / BigInt(weeksElapsed)) * BigInt(totalFyWeeks)`. Guards: if `weeksElapsed < 1`, treat as 1.

Tax rate application: `tax = base + ((taxableIncome - threshold) * rate / 100n)`. Integer division truncation is acceptable for an estimate.

### 3.3 Unit tests

`tests/unit/domain/tax.test.ts` — covers:
- Each bracket boundary (income at exactly $18,200, $45,000, $120,000, $180,000)
- LITO at max, partially phased out, fully phased out
- Medicare levy below and above threshold
- Mid-year annualisation (26 weeks elapsed)
- Deductions reducing taxable income across a bracket boundary

---

## 4. Tax Estimate UI — `/tax/estimate`

### 4.1 Navigation

New "Estimate" tab added to the Tax sub-nav in `app/(authenticated)/tax/layout.tsx` (alongside Super / Donations).

Route: `app/(authenticated)/tax/estimate/page.tsx` — server component.

### 4.2 Data fetching

Reads from existing tables only — no new queries beyond what's needed:
- `getPayslipsByUser` (already exists) — sum gross, tax_withheld for current FY payslips
- New query `getDeductibleTotalsForFy(userId, fyStart, fyEnd)` — groups `transactions` by `deduction_kind` where `is_deductible_candidate = true`, returns per-kind totals and grand total

Passes results to `estimateTax()` from `lib/domain/tax.ts`.

### 4.3 Layout — three panels

**Income panel**

| Label | Value |
|---|---|
| Projected annual gross | $X (annualised from N payslips, W weeks) |
| Projected PAYG withheld | $X |

Empty state: "No payslips found for FY 2025–26. Upload payslips on the Income page."

**Deductions panel**

Table: deduction kind | total amount. Grand total row at bottom.

If none: "No deductible expenses categorised yet. Flag transactions as deductible from the transaction list."

Each kind row links to `/transactions?deduction_kind=X`.

**Outcome panel**

```
Taxable income:            $X  (projected gross − deductions)
Estimated tax liability:   $X  (ATO brackets + Medicare − LITO)
PAYG already withheld:     $X
────────────────────────────────
Estimated outcome:    ~$X refund   ← green
                 or   ~$X liability ← amber
```

Projection caveat shown when `weeksElapsed < 26`: "Based on fewer than 26 weeks of payslips — estimate will be more accurate later in the FY."

Footer disclaimer on all three panels: *"Estimated based on your data. General information only — not tax advice. Consult a registered tax professional."*

---

## 5. File map

| Action | Path |
|---|---|
| Create | `lib/parsers/payslips/myob.ts` |
| Create | `lib/parsers/payslips/detect.ts` |
| Create | `lib/parsers/payslips/index.ts` |
| Create | `app/api/payslips/upload/route.ts` |
| Modify | `app/(authenticated)/income/payslips/page.tsx` — add upload button |
| Create | `lib/domain/tax.ts` |
| Create | `lib/db/queries/tax.ts` — `getDeductibleTotalsForFy` |
| Modify | `app/(authenticated)/tax/layout.tsx` — add Estimate tab |
| Create | `app/(authenticated)/tax/estimate/page.tsx` |
| Create | `tests/fixtures/payslips/myob/payslip_sample.pdf` |
| Create | `tests/unit/parsers/payslips/myob.test.ts` |
| Create | `tests/unit/domain/tax.test.ts` |

---

## 6. Compliance note

The `/tax/estimate` page carries the same information-not-advice framing established in PLAN.md §9. The disclaimer is visible without scrolling on all viewport sizes.
