import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseMyobPayslip } from '@/lib/parsers/payslips/myob';
import { detectPayslipFormat } from '@/lib/parsers/payslips/detect';
import { dispatchPayslip, UnknownFormatError } from '@/lib/parsers/payslips/index';
import { extractRows } from '@/lib/parsers/pdf/extract';

const buf = readFileSync(
  path.resolve(__dirname, '../../../fixtures/payslips/myob/payslip_sample.pdf'),
);

describe('detectPayslipFormat', () => {
  it('returns myob_pdf_v1 for the MYOB sample', async () => {
    const rows = await extractRows(buf);
    expect(detectPayslipFormat(rows)).toBe('myob_pdf_v1');
  });

  it('returns null for an empty row array', () => {
    expect(detectPayslipFormat([])).toBeNull();
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

  it('defaults pre_tax_deductions_cents to 0', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.pre_tax_deductions_cents).toBe(0n);
  });

  it('defaults post_tax_deductions_cents to 0', async () => {
    const result = await parseMyobPayslip(buf);
    expect(result.post_tax_deductions_cents).toBe(0n);
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
