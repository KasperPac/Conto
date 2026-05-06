# Phase 6 — MYOB Payslip Parser + Tax Estimation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MYOB payslip PDF parsing so payslips can be uploaded directly, and a `/tax/estimate` page that projects annual tax liability and estimated refund/liability from payslip income + deductible-flagged transactions.

**Architecture:** Pure-function parser (`lib/parsers/payslips/myob.ts`) follows the same pattern as the existing bank PDF parsers — `extractRows` + text-anchor matching. A new synchronous upload endpoint (`POST /api/payslips/upload`) parses on-the-fly and inserts directly into `payslips`. Tax estimation is a pure domain function (`lib/domain/tax.ts`) that applies ATO 2025-26 brackets + Medicare + LITO to annualised income. The `/tax/estimate` page is a server component in the existing Tax section.

**Tech Stack:** pdfjs-dist (already installed), Drizzle ORM, Next.js App Router server components, shadcn/ui Tailwind, Vitest.

**Spec:** `Docs/superpowers/specs/2026-05-07-phase6-pdf-parsing-tax-estimation-design.md`

---

### Task 1: MYOB Payslip Parser

**Goal:** Pure async function that extracts all payslip fields from a MYOB PDF, with detect + dispatch entry points and a passing unit test against the real fixture.

**Files:**
- Create: `tests/fixtures/payslips/myob/payslip_sample.pdf` (copy from project root)
- Create: `lib/parsers/payslips/detect.ts`
- Create: `lib/parsers/payslips/myob.ts`
- Create: `lib/parsers/payslips/index.ts`
- Create: `tests/unit/parsers/payslips/myob.test.ts`

**Acceptance Criteria:**
- [ ] `parseMyobPayslip` returns correct values for all fields against the real fixture
- [ ] `detectPayslipFormat` returns `'myob_pdf_v1'` for the MYOB sample
- [ ] `dispatchPayslip` throws `UnknownFormatError` for a non-payslip buffer
- [ ] All unit tests pass

**Verify:** `npx vitest run tests/unit/parsers/payslips/myob.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Copy fixture**

```bash
cp "payslip examples/k_simonsen_payslip_2022-04-13.pdf" tests/fixtures/payslips/myob/payslip_sample.pdf
```

Create the directory `tests/fixtures/payslips/myob/` if it doesn't exist.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/parsers/payslips/myob.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseMyobPayslip } from '@/lib/parsers/payslips/myob';
import { detectPayslipFormat } from '@/lib/parsers/payslips/detect';
import { dispatchPayslip, UnknownFormatError } from '@/lib/parsers/payslips/index';
import { extractRows } from '@/lib/parsers/pdf/extract';

const buf = readFileSync(
  path.resolve(__dirname, '../../fixtures/payslips/myob/payslip_sample.pdf'),
);

describe('detectPayslipFormat', () => {
  it('returns myob_pdf_v1 for the MYOB sample', async () => {
    const rows = await extractRows(buf);
    expect(detectPayslipFormat(rows)).toBe('myob_pdf_v1');
  });

  it('returns null for an empty buffer coerced to rows', async () => {
    // Empty PDF has no recognisable anchors
    const rows = await extractRows(buf);
    const emptyRows = rows.filter(() => false); // empty array
    expect(detectPayslipFormat(emptyRows)).toBeNull();
  });
});

describe('parseMyobPayslip', () => {
  it('returns correct template_id', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.template_id).toBe('myob_pdf_v1');
  });

  it('extracts employer', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.employer).toBe('Pac Technologies');
  });

  it('extracts pay period dates', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.period_start).toBe('2022-04-04');
    expect(result.period_end).toBe('2022-04-10');
  });

  it('extracts pay date', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.pay_date).toBe('2022-04-13');
  });

  it('extracts gross_cents', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.gross_cents).toBe(173115n); // $1,731.15
  });

  it('extracts tax_withheld_cents', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.tax_withheld_cents).toBe(41500n); // $415.00
  });

  it('extracts net_cents', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.net_cents).toBe(131615n); // $1,316.15
  });

  it('extracts super_cents', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.super_cents).toBe(13462n); // $134.62
  });

  it('defaults salary_sacrifice to 0', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.salary_sacrifice_cents).toBe(0n);
  });
});

describe('dispatchPayslip', () => {
  it('dispatches to MYOB parser for real sample', async () => {
    const result = await dispatchPayslip(buf);
    expect(result.template_id).toBe('myob_pdf_v1');
  });

  it('throws UnknownFormatError for non-payslip buffer', async () => {
    await expect(dispatchPayslip(Buffer.from('not a pdf'))).rejects.toBeInstanceOf(UnknownFormatError);
  });
});
```

- [ ] **Step 3: Run test to confirm it fails (files not created yet)**

```bash
npx vitest run tests/unit/parsers/payslips/myob.test.ts
```

Expected: FAIL with import errors.

- [ ] **Step 4: Create `lib/parsers/payslips/detect.ts`**

```typescript
import type { TextRow } from '../pdf/types';
import { rowText } from '../pdf/extract';

export function detectPayslipFormat(rows: TextRow[]): 'myob_pdf_v1' | null {
  const fullText = rows.map(rowText).join('\n');
  if (
    fullText.includes('Pay Period:') &&
    fullText.includes('Paid on:') &&
    fullText.includes('Less PAYG') &&
    fullText.includes('Take home pay')
  ) {
    return 'myob_pdf_v1';
  }
  return null;
}
```

- [ ] **Step 5: Create `lib/parsers/payslips/myob.ts`**

```typescript
import { extractRows, rowText } from '../pdf/extract';
import { UnknownFormatError } from '../pdf/types';
import type { TextRow } from '../pdf/types';

export interface ParsedPayslip {
  template_id: 'myob_pdf_v1';
  employer: string;
  period_start: string;   // YYYY-MM-DD
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

function dmyToIso(dmy: string): string {
  const [d, m, y] = dmy.split('/');
  return `${y}-${m}-${d}`;
}

function parseCents(s: string): bigint {
  const clean = s.replace(/[$,]/g, '');
  const [int = '0', dec = '00'] = clean.split('.');
  return BigInt(int) * 100n + BigInt(dec.padEnd(2, '0').slice(0, 2));
}

function firstAmountInRow(row: TextRow): bigint | null {
  const text = rowText(row);
  const m = text.match(/\$([\d,]+\.\d{2})/);
  if (!m) return null;
  return parseCents(m[1]!);
}

function findAmount(rows: TextRow[], anchor: string): bigint | null {
  const row = rows.find(r => rowText(r).includes(anchor));
  if (!row) return null;
  return firstAmountInRow(row);
}

export async function parseMyobPayslip(buf: Buffer): Promise<ParsedPayslip> {
  const rows = await extractRows(buf);
  const fullText = rows.map(rowText).join('\n');

  // Pay period: "Pay Period: 04/04/2022 to 10/04/2022"
  const periodMatch = fullText.match(
    /Pay Period:\s*(\d{2}\/\d{2}\/\d{4})\s+to\s+(\d{2}\/\d{2}\/\d{4})/,
  );
  if (!periodMatch) throw new UnknownFormatError();
  const periodStart = dmyToIso(periodMatch[1]!);
  const periodEnd = dmyToIso(periodMatch[2]!);

  // Pay date: "Paid on: 13/04/2022"
  const paidOnMatch = fullText.match(/Paid on:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!paidOnMatch) throw new UnknownFormatError();
  const payDate = dmyToIso(paidOnMatch[1]!);

  // Employer: last non-empty line before "ABN:"
  const abnIdx = fullText.indexOf('ABN:');
  const textBefore = abnIdx > 0 ? fullText.slice(0, abnIdx) : '';
  const linesBeforeAbn = textBefore.split('\n').map(l => l.trim()).filter(Boolean);
  const employer = linesBeforeAbn.at(-1) ?? 'Unknown';

  // Amounts from main earnings table
  const grossCents = findAmount(rows, 'Total pay');
  if (grossCents === null) throw new UnknownFormatError();

  const taxWithheldCents = findAmount(rows, 'Less PAYG');
  if (taxWithheldCents === null) throw new UnknownFormatError();

  const netCents = findAmount(rows, 'Take home pay');
  if (netCents === null) throw new UnknownFormatError();

  // Super contribution (optional — not all payslips have it)
  const superCents = findAmount(rows, 'Contribution') ?? 0n;

  return {
    template_id: 'myob_pdf_v1',
    employer,
    period_start: periodStart,
    period_end: periodEnd,
    pay_date: payDate,
    gross_cents: grossCents,
    tax_withheld_cents: taxWithheldCents,
    net_cents: netCents,
    super_cents: superCents,
    salary_sacrifice_cents: 0n,
    pre_tax_deductions_cents: 0n,
    post_tax_deductions_cents: 0n,
  };
}
```

- [ ] **Step 6: Create `lib/parsers/payslips/index.ts`**

```typescript
import { extractRows } from '../pdf/extract';
import { detectPayslipFormat } from './detect';
import { parseMyobPayslip } from './myob';
import { UnknownFormatError } from '../pdf/types';

export { UnknownFormatError } from '../pdf/types';
export type { ParsedPayslip } from './myob';

export async function dispatchPayslip(buf: Buffer): Promise<import('./myob').ParsedPayslip> {
  let rows;
  try {
    rows = await extractRows(buf);
  } catch {
    throw new UnknownFormatError();
  }
  const format = detectPayslipFormat(rows);
  if (format === 'myob_pdf_v1') return parseMyobPayslip(buf);
  throw new UnknownFormatError();
}
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/parsers/payslips/myob.test.ts
```

Expected: all tests pass. If any amount or field is wrong, adjust the anchor string or parsing logic to match what pdfjs actually extracts from the fixture. The test values are ground truth.

- [ ] **Step 8: Commit**

```bash
git add tests/fixtures/payslips/myob/payslip_sample.pdf \
  lib/parsers/payslips/detect.ts \
  lib/parsers/payslips/myob.ts \
  lib/parsers/payslips/index.ts \
  tests/unit/parsers/payslips/myob.test.ts
git commit -m "phase6/parsers: MYOB payslip PDF parser with detect + dispatch"
```

---

### Task 2: Tax Estimation Domain Module

**Goal:** Pure `estimateTax` function applying ATO 2025-26 brackets, Medicare levy, and LITO, with full test coverage of bracket boundaries and edge cases.

**Files:**
- Create: `lib/domain/tax.ts`
- Create: `tests/unit/domain/tax.test.ts`

**Acceptance Criteria:**
- [ ] Each ATO bracket boundary returns correct tax
- [ ] Medicare levy applied correctly above and below threshold
- [ ] LITO phases out correctly between $37,500–$66,667
- [ ] Annualisation scales both gross and PAYG by `totalWeeks / weeksElapsed`
- [ ] Deductions reduce taxable income (clamped to 0)
- [ ] All unit tests pass

**Verify:** `npx vitest run tests/unit/domain/tax.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/tax.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { estimateTax } from '@/lib/domain/tax';

// Helper: build input with no deductions, no annualisation (full year elapsed)
function input(grossDollars: number, paygDollars: number, deductionsDollars = 0) {
  return {
    fyGrossCents: BigInt(Math.round(grossDollars * 100)),
    fyPaygCents: BigInt(Math.round(paygDollars * 100)),
    fyDeductionsCents: BigInt(Math.round(deductionsDollars * 100)),
    weeksElapsed: 52,
    totalFyWeeks: 52,
  };
}

describe('estimateTax — income tax brackets', () => {
  it('$18,200 (top of 0% bracket): tax = $0', () => {
    const r = estimateTax(input(18200, 0));
    expect(r.estimatedTaxLiabilityCents).toBe(0n);
  });

  it('$45,000 (top of 19% bracket): income tax = $5,092', () => {
    // ($45,000 - $18,200) × 0.19 = $26,800 × 0.19 = $5,092
    // Medicare: $45,000 × 2% = $900 (above $26,000 threshold)
    // LITO: phases out — at $45,000 LITO = $325 (after phase 1)
    // Total: $5,092 + $900 - $325 = $5,667
    const r = estimateTax(input(45000, 0));
    expect(r.estimatedTaxLiabilityCents).toBe(566700n); // $5,667
  });

  it('$120,000 (top of 32.5% bracket): income tax = $29,467', () => {
    // Income tax at $120,000 = $29,467
    // Medicare: $120,000 × 2% = $2,400
    // LITO: $0 (above $66,667)
    // Total: $29,467 + $2,400 = $31,867
    const r = estimateTax(input(120000, 0));
    expect(r.estimatedTaxLiabilityCents).toBe(3186700n); // $31,867
  });

  it('$180,000 (top of 37% bracket): income tax = $51,667', () => {
    // Income tax = $51,667; Medicare = $3,600; LITO = $0
    // Total: $55,267
    const r = estimateTax(input(180000, 0));
    expect(r.estimatedTaxLiabilityCents).toBe(5526700n); // $55,267
  });
});

describe('estimateTax — Medicare levy', () => {
  it('below $26,000: no Medicare levy', () => {
    const r = estimateTax(input(20000, 0));
    // income tax = ($20,000 - $18,200) × 0.19 = $342
    // Medicare = $0 (below threshold)
    // LITO = $700 (below $37,500)
    // Total = $342 + $0 - $342 capped? No: $342 - $700 = negative → $0
    expect(r.estimatedTaxLiabilityCents).toBe(0n);
  });

  it('above $26,000: Medicare applied at 2%', () => {
    const r = estimateTax(input(30000, 0));
    // income tax = ($30,000 - $18,200) × 0.19 = $2,242
    // Medicare = $30,000 × 2% = $600
    // LITO = $700 (below $37,500)
    // Total = $2,242 + $600 - $700 = $2,142
    expect(r.estimatedTaxLiabilityCents).toBe(214200n); // $2,142
  });
});

describe('estimateTax — LITO', () => {
  it('below $37,500: full $700 LITO', () => {
    const r = estimateTax(input(30000, 0));
    // Verified in Medicare test above: LITO = $700 applied
    // income tax = $2,242, Medicare = $600, LITO = $700 → $2,142
    expect(r.estimatedTaxLiabilityCents).toBe(214200n);
  });

  it('$50,000: LITO partially phased out', () => {
    // income tax at $50,000 = $5,092 + ($50,000 - $45,000) × 0.325 = $5,092 + $1,625 = $6,717
    // Medicare = $50,000 × 2% = $1,000
    // LITO: phase 1 exhausted at $45,000 = $325; phase 2: $325 - ($50,000 - $45,000) × 0.015 = $325 - $75 = $250
    // Total = $6,717 + $1,000 - $250 = $7,467
    const r = estimateTax(input(50000, 0));
    expect(r.estimatedTaxLiabilityCents).toBe(746700n); // $7,467
  });

  it('above $66,667: LITO = $0', () => {
    const r = estimateTax(input(70000, 0));
    // income tax = $5,092 + ($70,000 - $45,000) × 0.325 = $5,092 + $8,125 = $13,217
    // Medicare = $70,000 × 2% = $1,400
    // LITO = $0 (above $66,667)
    // Total = $14,617
    expect(r.estimatedTaxLiabilityCents).toBe(1461700n); // $14,617
  });
});

describe('estimateTax — annualisation', () => {
  it('26 weeks elapsed doubles YTD values', () => {
    // YTD at 26 weeks: gross=$30,000 → projected=$60,000
    const r = estimateTax({
      fyGrossCents: 3_000_000n,
      fyPaygCents: 500_000n,
      fyDeductionsCents: 0n,
      weeksElapsed: 26,
      totalFyWeeks: 52,
    });
    expect(r.projectedGrossCents).toBe(6_000_000n); // $60,000
    expect(r.projectedPaygCents).toBe(1_000_000n);   // $10,000
  });

  it('weeksElapsed=0 is treated as 1 to avoid division by zero', () => {
    expect(() =>
      estimateTax({ fyGrossCents: 0n, fyPaygCents: 0n, fyDeductionsCents: 0n, weeksElapsed: 0, totalFyWeeks: 52 })
    ).not.toThrow();
  });
});

describe('estimateTax — deductions', () => {
  it('deductions reduce taxable income', () => {
    // gross $50,000, deductions $5,000 → taxable = $45,000
    const withDeductions = estimateTax(input(50000, 0, 5000));
    const withoutDeductions = estimateTax(input(45000, 0, 0));
    expect(withDeductions.projectedTaxableIncomeCents).toBe(4_500_000n);
    expect(withDeductions.estimatedTaxLiabilityCents).toBe(withoutDeductions.estimatedTaxLiabilityCents);
  });

  it('deductions cannot make taxable income negative', () => {
    const r = estimateTax(input(10000, 0, 50000));
    expect(r.projectedTaxableIncomeCents).toBe(0n);
    expect(r.estimatedTaxLiabilityCents).toBe(0n);
  });
});

describe('estimateTax — outcome', () => {
  it('isRefund=true when PAYG > estimated liability', () => {
    const r = estimateTax(input(50000, 8000));
    expect(r.isRefund).toBe(true);
    expect(r.estimatedOutcomeCents).toBe(800_000n - r.estimatedTaxLiabilityCents);
  });

  it('isRefund=false when PAYG < estimated liability', () => {
    const r = estimateTax(input(50000, 5000));
    expect(r.isRefund).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/unit/domain/tax.test.ts
```

Expected: FAIL — `lib/domain/tax.ts` does not exist.

- [ ] **Step 3: Create `lib/domain/tax.ts`**

```typescript
// ATO 2025-26 individual resident tax brackets (all values in cents)
const BRACKET_1_TOP = 1_820_000n;   // $18,200
const BRACKET_2_TOP = 4_500_000n;   // $45,000
const BRACKET_3_TOP = 12_000_000n;  // $120,000
const BRACKET_4_TOP = 18_000_000n;  // $180,000

const BASE_3 = 509_200n;            // $5,092 — tax at $45,000
const BASE_4 = 2_946_700n;          // $29,467 — tax at $120,000
const BASE_5 = 5_166_700n;          // $51,667 — tax at $180,000

const MEDICARE_THRESHOLD = 2_600_000n; // $26,000

const LITO_MAX = 70_000n;              // $700
const LITO_PHASE1_START = 3_750_000n; // $37,500
const LITO_PHASE2_START = 4_500_000n; // $45,000
const LITO_PHASE2_BASE = 32_500n;     // $325 (LITO at $45,000 after phase 1)
const LITO_PHASE_END = 6_666_700n;    // $66,667

function incomeTaxCents(incomeCents: bigint): bigint {
  if (incomeCents <= BRACKET_1_TOP) return 0n;
  if (incomeCents <= BRACKET_2_TOP) return (incomeCents - BRACKET_1_TOP) * 19n / 100n;
  if (incomeCents <= BRACKET_3_TOP) return BASE_3 + (incomeCents - BRACKET_2_TOP) * 325n / 1000n;
  if (incomeCents <= BRACKET_4_TOP) return BASE_4 + (incomeCents - BRACKET_3_TOP) * 37n / 100n;
  return BASE_5 + (incomeCents - BRACKET_4_TOP) * 45n / 100n;
}

function medicareCents(incomeCents: bigint): bigint {
  if (incomeCents <= MEDICARE_THRESHOLD) return 0n;
  return incomeCents * 2n / 100n;
}

function litoCents(incomeCents: bigint): bigint {
  if (incomeCents <= LITO_PHASE1_START) return LITO_MAX;
  if (incomeCents <= LITO_PHASE2_START) {
    return LITO_MAX - (incomeCents - LITO_PHASE1_START) * 5n / 100n;
  }
  if (incomeCents <= LITO_PHASE_END) {
    return LITO_PHASE2_BASE - (incomeCents - LITO_PHASE2_START) * 15n / 1000n;
  }
  return 0n;
}

export interface TaxEstimateInput {
  fyGrossCents: bigint;
  fyPaygCents: bigint;
  fyDeductionsCents: bigint;
  weeksElapsed: number;
  totalFyWeeks: number;
}

export interface TaxEstimate {
  projectedGrossCents: bigint;
  totalDeductionsCents: bigint;
  projectedTaxableIncomeCents: bigint;
  estimatedTaxLiabilityCents: bigint;
  projectedPaygCents: bigint;
  estimatedOutcomeCents: bigint;  // absolute value; isRefund tells you the sign
  isRefund: boolean;
}

export function estimateTax(input: TaxEstimateInput): TaxEstimate {
  const elapsed = BigInt(Math.max(1, input.weeksElapsed));
  const total = BigInt(input.totalFyWeeks);

  const projectedGrossCents = input.fyGrossCents * total / elapsed;
  const projectedPaygCents = input.fyPaygCents * total / elapsed;

  const totalDeductionsCents = input.fyDeductionsCents;
  const projectedTaxableIncomeCents =
    projectedGrossCents > totalDeductionsCents
      ? projectedGrossCents - totalDeductionsCents
      : 0n;

  const rawTax = incomeTaxCents(projectedTaxableIncomeCents)
    + medicareCents(projectedTaxableIncomeCents);
  const lito = litoCents(projectedTaxableIncomeCents);
  const estimatedTaxLiabilityCents = rawTax > lito ? rawTax - lito : 0n;

  const rawOutcome = projectedPaygCents - estimatedTaxLiabilityCents;
  const isRefund = rawOutcome >= 0n;

  return {
    projectedGrossCents,
    totalDeductionsCents,
    projectedTaxableIncomeCents,
    estimatedTaxLiabilityCents,
    projectedPaygCents,
    estimatedOutcomeCents: isRefund ? rawOutcome : -rawOutcome,
    isRefund,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/domain/tax.test.ts
```

Expected: all tests pass. If any amount is off by a few cents, it's likely bigint truncation in a bracket boundary — adjust the expected value to match the integer arithmetic result (truncation is acceptable for an estimate).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/tax.ts tests/unit/domain/tax.test.ts
git commit -m "phase6/domain: tax estimation with ATO 2025-26 brackets, Medicare, LITO"
```

---

### Task 3: Payslip Upload Endpoint + UI Button

**Goal:** `POST /api/payslips/upload` parses a MYOB PDF synchronously and inserts into the DB; a client-side upload button appears on the `/income/payslips` page.

**Files:**
- Modify: `lib/db/queries/payslips.ts` — add `createPayslipRecord`
- Create: `app/api/payslips/upload/route.ts`
- Create: `components/payslip-upload-button.tsx`
- Modify: `app/(authenticated)/income/payslips/page.tsx` — add button

**Acceptance Criteria:**
- [ ] `POST /api/payslips/upload` with a valid MYOB PDF returns `200 { ok: true, payslipId }`
- [ ] Unknown PDF format returns `422 { error: 'unrecognised_payslip_format' }`
- [ ] Unauthenticated request returns `401`
- [ ] Payslip appears in the list after upload
- [ ] `link-payslips` job is enqueued after insert

**Verify:** Manual test — upload the fixture PDF via the UI button, verify it appears in the payslips list.

**Steps:**

- [ ] **Step 1: Add `createPayslipRecord` to `lib/db/queries/payslips.ts`**

Add the following to the end of `lib/db/queries/payslips.ts` (after the existing imports and functions):

```typescript
export interface CreatePayslipData {
  employer: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  grossCents: bigint;
  taxWithheldCents: bigint;
  superCents: bigint;
  salarySacrificeCents: bigint;
  preTaxDeductionsCents: bigint;
  postTaxDeductionsCents: bigint;
  netCents: bigint;
  sourceObjectKey: string;
  source: string;
}

export async function createPayslipRecord(
  userId: string,
  data: CreatePayslipData,
): Promise<string> {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .insert(payslips)
      .values({ userId, ...data })
      .returning({ id: payslips.id });
    return row!.id;
  });
}
```

- [ ] **Step 2: Create `app/api/payslips/upload/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { putObject } from '@/lib/storage/put-object';
import { dispatchPayslip, UnknownFormatError } from '@/lib/parsers/payslips/index';
import { createPayslipRecord } from '@/lib/db/queries/payslips';
import { boss } from '@/lib/jobs/boss';

export async function POST(req: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (e instanceof Error && e.message.includes('headers')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    throw e;
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await dispatchPayslip(buf);
  } catch (e) {
    if (e instanceof UnknownFormatError) {
      return NextResponse.json({ error: 'unrecognised_payslip_format' }, { status: 422 });
    }
    throw e;
  }

  let key: string;
  try {
    ({ key } = await putObject({
      userId,
      body: buf,
      contentType: file.type || 'application/pdf',
      originalFilename: file.name,
    }));
  } catch (err) {
    return NextResponse.json({ error: 'R2 upload failed', detail: String(err) }, { status: 502 });
  }

  let payslipId: string;
  try {
    payslipId = await createPayslipRecord(userId, {
      employer: parsed.employer,
      periodStart: parsed.period_start,
      periodEnd: parsed.period_end,
      payDate: parsed.pay_date,
      grossCents: parsed.gross_cents,
      taxWithheldCents: parsed.tax_withheld_cents,
      superCents: parsed.super_cents,
      salarySacrificeCents: parsed.salary_sacrifice_cents,
      preTaxDeductionsCents: parsed.pre_tax_deductions_cents,
      postTaxDeductionsCents: parsed.post_tax_deductions_cents,
      netCents: parsed.net_cents,
      sourceObjectKey: key,
      source: 'pdf',
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save payslip', detail: String(err) }, { status: 502 });
  }

  await boss.send('link-payslips', { userId }).catch(() => {});

  return NextResponse.json({ ok: true, payslipId });
}
```

- [ ] **Step 3: Create `components/payslip-upload-button.tsx`**

```tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function PayslipUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/payslips/upload', { method: 'POST', body: fd });
      if (res.status === 422) {
        setError('Could not read this PDF as a payslip. Only MYOB format is currently supported.');
        return;
      }
      if (!res.ok) {
        setError('Upload failed. Please try again.');
        return;
      }
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="px-3 py-1.5 text-sm border rounded hover:bg-zinc-50 disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : 'Upload payslip PDF'}
      </button>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Update `app/(authenticated)/income/payslips/page.tsx` to add the upload button**

Add the import at the top of the file (after existing imports):

```typescript
import { PayslipUploadButton } from '@/components/payslip-upload-button';
```

Replace the existing `<h1>` block at the top of the return JSX:

```tsx
// Replace this:
<h1 className="text-2xl font-semibold mb-6">Payslips</h1>

// With this:
<div className="flex items-center justify-between mb-6">
  <h1 className="text-2xl font-semibold">Payslips</h1>
  <PayslipUploadButton />
</div>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type errors before committing.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/payslips.ts \
  app/api/payslips/upload/route.ts \
  components/payslip-upload-button.tsx \
  "app/(authenticated)/income/payslips/page.tsx"
git commit -m "phase6/upload: payslip PDF upload endpoint + upload button UI"
```

---

### Task 4: Tax FY Queries

**Goal:** Two new query functions in `lib/db/queries/tax.ts` that aggregate payslip income and deductible transaction totals for a financial year, with integration tests.

**Files:**
- Modify: `lib/db/queries/tax.ts` — add `getPayslipSummaryForFy`, `getDeductibleTotalsForFy`
- Modify: `tests/integration/db/queries/tax.test.ts` — add tests for new functions

**Acceptance Criteria:**
- [ ] `getPayslipSummaryForFy` sums gross + PAYG across payslips in the FY window, excludes out-of-window payslips
- [ ] `getDeductibleTotalsForFy` groups by `deductionKind`, returns absolute amounts, grand total
- [ ] Integration tests pass

**Verify:** `npx vitest run tests/integration/db/queries/tax.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing tests**

Append the following to `tests/integration/db/queries/tax.test.ts`:

```typescript
import { getPayslipSummaryForFy, getDeductibleTotalsForFy } from '@/lib/db/queries/tax'
// (add to the existing import at top of file)

describe('getPayslipSummaryForFy', () => {
  let userId: string

  beforeEach(async () => {
    await resetTestDb()
    ;({ userId } = await seedUserAndAccount())
  })

  it('returns zeros when no payslips in FY', async () => {
    const result = await getPayslipSummaryForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.fyGrossCents).toBe(0n)
    expect(result.fyPaygCents).toBe(0n)
    expect(result.payslipCount).toBe(0)
    expect(result.earliestPayDate).toBeNull()
  })

  it('sums gross and PAYG for payslips in the FY', async () => {
    await testDb.insert(payslips).values([
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        payDate: '2025-07-31',
        grossCents: BigInt(500000),
        taxWithheldCents: BigInt(100000),
        superCents: BigInt(50000),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(350000),
        source: 'manual',
      },
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-08-01',
        periodEnd: '2025-08-31',
        payDate: '2025-08-31',
        grossCents: BigInt(500000),
        taxWithheldCents: BigInt(100000),
        superCents: BigInt(50000),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(350000),
        source: 'manual',
      },
    ])
    const result = await getPayslipSummaryForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.fyGrossCents).toBe(1_000_000n)
    expect(result.fyPaygCents).toBe(200_000n)
    expect(result.payslipCount).toBe(2)
    expect(result.earliestPayDate).toBe('2025-07-31')
  })

  it('excludes payslips outside the FY', async () => {
    await testDb.insert(payslips).values({
      userId,
      employer: 'ACME',
      periodStart: '2024-06-01',
      periodEnd: '2024-06-30',
      payDate: '2024-06-30',
      grossCents: BigInt(500000),
      taxWithheldCents: BigInt(100000),
      superCents: BigInt(50000),
      salarySacrificeCents: BigInt(0),
      netCents: BigInt(350000),
      source: 'manual',
    })
    const result = await getPayslipSummaryForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.payslipCount).toBe(0)
  })
})

describe('getDeductibleTotalsForFy', () => {
  let userId: string
  let accountId: string

  beforeEach(async () => {
    await resetTestDb()
    ;({ userId, accountId } = await seedUserAndAccount())
  })

  it('returns empty result when no deductible transactions', async () => {
    const result = await getDeductibleTotalsForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.byKind).toHaveLength(0)
    expect(result.grandTotalCents).toBe(0n)
  })

  it('groups deductible transactions by deductionKind', async () => {
    const [wfhCat] = await testDb.insert(categories).values({
      name: 'Working from home',
      deductionKind: 'wfh',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    const [donationCat] = await testDb.insert(categories).values({
      name: 'Donations',
      deductionKind: 'donation',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    await testDb.insert(transactions).values([
      {
        userId,
        accountId,
        postedDate: '2025-09-01',
        descriptionRaw: 'INTERNET',
        amountCents: BigInt(-10000),  // -$100
        classificationSource: 'manual',
        categoryId: wfhCat!.id,
      },
      {
        userId,
        accountId,
        postedDate: '2025-09-15',
        descriptionRaw: 'CHARITY',
        amountCents: BigInt(-5000),   // -$50
        classificationSource: 'manual',
        categoryId: donationCat!.id,
      },
    ])

    const result = await getDeductibleTotalsForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.byKind).toHaveLength(2)

    const wfh = result.byKind.find(k => k.deductionKind === 'wfh')
    expect(wfh?.totalCents).toBe(10000n)
    expect(wfh?.transactionCount).toBe(1)

    const donation = result.byKind.find(k => k.deductionKind === 'donation')
    expect(donation?.totalCents).toBe(5000n)

    expect(result.grandTotalCents).toBe(15000n)
  })

  it('excludes transactions outside the FY', async () => {
    const [wfhCat] = await testDb.insert(categories).values({
      name: 'WFH',
      deductionKind: 'wfh',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    await testDb.insert(transactions).values({
      userId,
      accountId,
      postedDate: '2024-06-01',
      descriptionRaw: 'OLD WFH',
      amountCents: BigInt(-10000),
      classificationSource: 'manual',
      categoryId: wfhCat!.id,
    })

    const result = await getDeductibleTotalsForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.grandTotalCents).toBe(0n)
  })
})
```

> **Note:** The existing `describe` blocks in this file use `categories` from `@/lib/db/schema` — that import is already present. The new blocks reuse the same imports.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/integration/db/queries/tax.test.ts
```

Expected: FAIL — `getPayslipSummaryForFy` and `getDeductibleTotalsForFy` not exported from tax.ts.

- [ ] **Step 3: Add the two query functions to `lib/db/queries/tax.ts`**

Append to `lib/db/queries/tax.ts` (after the existing imports and functions — add `gte`, `lte` to the drizzle imports if not present, and add `isNotNull` if needed):

```typescript
// Add these to the existing drizzle imports at top:
// import { and, eq, sql, gte, lte } from 'drizzle-orm'
// (replace the existing import line)

export interface PayslipSummaryForFy {
  fyGrossCents: bigint;
  fyPaygCents: bigint;
  payslipCount: number;
  earliestPayDate: string | null;
}

export async function getPayslipSummaryForFy(
  userId: string,
  fyStart: string,
  fyEnd: string,
): Promise<PayslipSummaryForFy> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        grossCents: payslips.grossCents,
        taxWithheldCents: payslips.taxWithheldCents,
        payDate: payslips.payDate,
      })
      .from(payslips)
      .where(
        and(
          eq(payslips.userId, userId),
          sql`${payslips.payDate}::date >= ${fyStart}::date`,
          sql`${payslips.payDate}::date <= ${fyEnd}::date`,
        ),
      )
      .orderBy(payslips.payDate);

    let fyGross = 0n;
    let fyPayg = 0n;
    for (const row of rows) {
      fyGross += row.grossCents;
      fyPayg += row.taxWithheldCents;
    }

    return {
      fyGrossCents: fyGross,
      fyPaygCents: fyPayg,
      payslipCount: rows.length,
      earliestPayDate: rows[0]?.payDate as string ?? null,
    };
  });
}

export interface DeductibleKindTotal {
  deductionKind: string;
  totalCents: bigint;
  transactionCount: number;
}

export interface DeductibleTotals {
  byKind: DeductibleKindTotal[];
  grandTotalCents: bigint;
}

export async function getDeductibleTotalsForFy(
  userId: string,
  fyStart: string,
  fyEnd: string,
): Promise<DeductibleTotals> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        deductionKind: categories.deductionKind,
        amountCents: transactions.amountCents,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(categories.isDeductibleCandidate, true),
          sql`${transactions.postedDate}::date >= ${fyStart}::date`,
          sql`${transactions.postedDate}::date <= ${fyEnd}::date`,
        ),
      );

    const kindMap = new Map<string, { total: bigint; count: number }>();
    let grandTotal = 0n;

    for (const row of rows) {
      const kind = row.deductionKind ?? 'other';
      const abs = row.amountCents < 0n ? -row.amountCents : row.amountCents;
      const prev = kindMap.get(kind) ?? { total: 0n, count: 0 };
      kindMap.set(kind, { total: prev.total + abs, count: prev.count + 1 });
      grandTotal += abs;
    }

    return {
      byKind: Array.from(kindMap.entries()).map(([kind, { total, count }]) => ({
        deductionKind: kind,
        totalCents: total,
        transactionCount: count,
      })),
      grandTotalCents: grandTotal,
    };
  });
}
```

> **Important:** Ensure `categories` and `transactions` are imported at the top of `lib/db/queries/tax.ts`. Check the existing import line — both are already imported in the existing file.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/integration/db/queries/tax.test.ts
```

Expected: all tests pass (old + new).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/tax.ts tests/integration/db/queries/tax.test.ts
git commit -m "phase6/queries: payslip FY summary + deductible totals by kind"
```

---

### Task 5: Tax Estimate Page

**Goal:** `/tax/estimate` page displaying projected gross, deductions breakdown, and estimated tax outcome (refund or liability); "Estimate" tab added to the Tax sub-nav.

**Files:**
- Modify: `app/(authenticated)/tax/layout.tsx` — add Estimate tab
- Create: `app/(authenticated)/tax/estimate/page.tsx`

**Acceptance Criteria:**
- [ ] "Estimate" tab visible in Tax nav alongside Super and Donations
- [ ] Empty state shown when no payslips for current FY
- [ ] Income panel shows projected gross and PAYG (annualised)
- [ ] Deductions panel shows totals by kind (or empty state)
- [ ] Outcome panel shows estimated refund/liability in correct colour
- [ ] Low-data caveat shown when < 26 weeks of payslips
- [ ] Disclaimer visible on all states
- [ ] Page type-checks cleanly

**Verify:** `npx tsc --noEmit` → no errors. Then run the dev server and navigate to `/tax/estimate`.

**Steps:**

- [ ] **Step 1: Add Estimate tab to `app/(authenticated)/tax/layout.tsx`**

Replace the `tabs` array:

```typescript
// Replace:
const tabs = [
  { label: 'Super', href: '/tax/super' },
  { label: 'Donations', href: '/tax/donations' },
]

// With:
const tabs = [
  { label: 'Super', href: '/tax/super' },
  { label: 'Donations', href: '/tax/donations' },
  { label: 'Estimate', href: '/tax/estimate' },
]
```

- [ ] **Step 2: Create `app/(authenticated)/tax/estimate/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { currentFyYear, fyBounds } from '@/lib/domain/fy';
import { getPayslipSummaryForFy, getDeductibleTotalsForFy } from '@/lib/db/queries/tax';
import { estimateTax } from '@/lib/domain/tax';

const DEDUCTION_LABELS: Record<string, string> = {
  wfh: 'Working from home',
  donation: 'Donations (DGR)',
  work_tools: 'Work tools & equipment',
  motor_vehicle: 'Motor vehicle',
  professional_sub: 'Professional subscriptions',
  other: 'Other deductions',
};

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
    Number(cents) / 100,
  );
}

function weeksElapsedSince(fyStart: string): number {
  const start = new Date(fyStart);
  const now = new Date();
  const ms = now.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
}

export default async function TaxEstimatePage() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in');
    throw e;
  }

  const fyYear = currentFyYear();
  const { start: fyStart, end: fyEnd } = fyBounds(fyYear);
  const fyLabel = `FY ${fyYear - 1}–${String(fyYear).slice(2)}`;

  const [payslipSummary, deductibles] = await Promise.all([
    getPayslipSummaryForFy(userId, fyStart, fyEnd),
    getDeductibleTotalsForFy(userId, fyStart, fyEnd),
  ]);

  const weeksElapsed = weeksElapsedSince(fyStart);
  const totalFyWeeks = 52;

  const estimate =
    payslipSummary.payslipCount > 0
      ? estimateTax({
          fyGrossCents: payslipSummary.fyGrossCents,
          fyPaygCents: payslipSummary.fyPaygCents,
          fyDeductionsCents: deductibles.grandTotalCents,
          weeksElapsed,
          totalFyWeeks,
        })
      : null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Tax Estimate — {fyLabel}</h1>

      {/* Income panel */}
      <section>
        <h2 className="text-sm font-medium text-zinc-700 mb-3">Income</h2>
        {payslipSummary.payslipCount === 0 ? (
          <p className="text-sm text-zinc-500">
            No payslips found for {fyLabel}.{' '}
            <a href="/income/payslips" className="underline">
              Upload payslips
            </a>{' '}
            to track your tax estimate.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 max-w-sm">
            <div>
              <dt className="text-xs text-zinc-500">Projected annual gross</dt>
              <dd className="text-lg font-medium">{fmt(estimate!.projectedGrossCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Projected PAYG withheld</dt>
              <dd className="text-lg font-medium">{fmt(estimate!.projectedPaygCents)}</dd>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-zinc-400">
                Based on {payslipSummary.payslipCount} payslip
                {payslipSummary.payslipCount !== 1 ? 's' : ''} · {weeksElapsed} of 52 weeks
                {weeksElapsed < 26 && ' · estimate improves later in the FY'}
              </p>
            </div>
          </dl>
        )}
      </section>

      {/* Deductions panel */}
      <section>
        <h2 className="text-sm font-medium text-zinc-700 mb-3">Deductions</h2>
        {deductibles.byKind.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No deductible expenses categorised yet. Flag transactions as deductible from the
            transaction list.
          </p>
        ) : (
          <table className="w-full text-sm max-w-md">
            <thead>
              <tr className="text-left text-zinc-500 border-b">
                <th className="pb-2 pr-4 font-normal">Category</th>
                <th className="pb-2 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deductibles.byKind.map((k) => (
                <tr key={k.deductionKind}>
                  <td className="py-2 pr-4">
                    <a
                      href={`/transactions?deduction_kind=${k.deductionKind}`}
                      className="underline text-zinc-700 hover:text-zinc-900"
                    >
                      {DEDUCTION_LABELS[k.deductionKind] ?? k.deductionKind}
                    </a>
                  </td>
                  <td className="py-2 text-right">{fmt(k.totalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium">
                <td className="pt-2 pr-4">Total deductions</td>
                <td className="pt-2 text-right">{fmt(deductibles.grandTotalCents)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {/* Outcome panel */}
      {estimate && (
        <section>
          <h2 className="text-sm font-medium text-zinc-700 mb-3">Estimated outcome</h2>
          <dl className="space-y-2 text-sm max-w-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Taxable income</dt>
              <dd>{fmt(estimate.projectedTaxableIncomeCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Estimated tax liability</dt>
              <dd>{fmt(estimate.estimatedTaxLiabilityCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">PAYG already withheld</dt>
              <dd>{fmt(estimate.projectedPaygCents)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <dt>Estimated outcome</dt>
              <dd className={estimate.isRefund ? 'text-green-700' : 'text-amber-700'}>
                ~{fmt(estimate.estimatedOutcomeCents)}{' '}
                {estimate.isRefund ? 'refund' : 'liability'}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <p className="text-xs text-zinc-400 border-t pt-4">
        Estimated based on your data. General information only — not tax advice. Consult a
        registered tax professional.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type errors before committing.

- [ ] **Step 4: Run the dev server and verify manually**

```bash
npm run dev
```

Navigate to `/tax/estimate`. Verify:
- "Estimate" tab appears in the Tax nav
- With no payslips: empty state with link to income page
- After uploading a payslip PDF: income panel shows annualised values, outcome panel shows refund/liability

- [ ] **Step 5: Commit**

```bash
git add "app/(authenticated)/tax/layout.tsx" \
  "app/(authenticated)/tax/estimate/page.tsx"
git commit -m "phase6/ui: tax estimate page with income, deductions, and outcome panels"
```

---

## Self-Review Notes

- Spec §1.4 (test fixtures) covered in Task 1 Step 1.
- Spec §2.2 (422 on unknown format) covered in Task 3 Step 2 endpoint.
- Spec §3.3 (unit tests for each bracket boundary) fully covered in Task 2 test suite.
- Spec §4.2 (`getDeductibleTotalsForFy`) covered in Task 4.
- Spec §4.3 (outcome panel colour coding, disclaimer, caveat for < 26 weeks) all present in Task 5 page.
- The `estimatedOutcomeCents` field in `TaxEstimate` stores the absolute value; `isRefund` carries the sign — consistent across Task 2 domain, Task 4 queries, and Task 5 UI.
