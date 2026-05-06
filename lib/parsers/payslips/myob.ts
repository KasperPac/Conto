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
  const parts = dmy.split('/');
  if (parts.length !== 3) throw new UnknownFormatError();
  const [d, m, y] = parts;
  return `${y}-${m}-${d}`;
}

function parseCents(s: string): bigint {
  const clean = s.replace(/[$,]/g, '');
  const [int = '0', dec = '00'] = clean.split('.');
  return BigInt(int) * 100n + BigInt(dec.padEnd(2, '0').slice(0, 2));
}

function findAmount(rows: TextRow[], anchor: string): bigint | null {
  const row = rows.find(r => rowText(r).includes(anchor));
  if (!row) return null;
  const text = rowText(row);
  // First match used; MYOB places the period amount before any YTD column in this fixture
  const m = text.match(/\$([\d,]+\.\d{2})/);
  if (!m) return null;
  return parseCents(m[1]!);
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

  // Employer: line immediately before "ABN:" row
  // pdfjs extracts: "Pac Technologies" then "ABN: 99113680443" on separate rows
  const abnRowIdx = rows.findIndex(r => rowText(r).includes('ABN:'));
  const employer =
    abnRowIdx > 0 ? rowText(rows[abnRowIdx - 1]!) : 'Unknown';

  // Amounts
  const grossCents = findAmount(rows, 'Total pay');
  if (grossCents === null) throw new UnknownFormatError();

  const taxWithheldCents = findAmount(rows, 'Less PAYG');
  if (taxWithheldCents === null) throw new UnknownFormatError();

  const netCents = findAmount(rows, 'Take home pay');
  if (netCents === null) throw new UnknownFormatError();

  // Super contribution (optional — look for "Contribution" row)
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
    // Not present in this payslip format — default to zero
    salary_sacrifice_cents: 0n,
    pre_tax_deductions_cents: 0n,
    post_tax_deductions_cents: 0n,
  };
}
