import { describe, it, expect } from 'vitest';
import { matchPayslipToIncome } from '@/lib/domain/payslip-linking';
import { toCents } from '@/lib/types/money';

const payslip = { payDate: '2026-05-01', netCents: toCents(BigInt(423456)), employer: 'Acme Corp' };

const baseTx = (overrides: Partial<{ id: string; postedDate: string; amountCents: ReturnType<typeof toCents>; descriptionRaw: string }> = {}) => ({
  id: 'tx-1',
  postedDate: '2026-05-01',
  amountCents: toCents(BigInt(423456)),
  descriptionRaw: 'DEPOSIT',
  ...overrides,
});

describe('matchPayslipToIncome', () => {
  it('returns base confidence 0.70 on exact amount + same day', () => {
    const result = matchPayslipToIncome(payslip, [baseTx()], []);
    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBe(0.70);
  });

  it('adds 0.20 when description contains employer word', () => {
    const result = matchPayslipToIncome(payslip, [baseTx({ descriptionRaw: 'ACME PAYROLL' })], []);
    expect(result[0]!.confidence).toBeCloseTo(0.90);
  });

  it('adds 0.10 when pay cadence matches employer', () => {
    const result = matchPayslipToIncome(payslip, [baseTx()], [{ employer: 'Acme Corp', cadence: 'monthly' }]);
    expect(result[0]!.confidence).toBeCloseTo(0.80);
  });

  it('caps at 1.0 when all signals present', () => {
    const result = matchPayslipToIncome(
      payslip,
      [baseTx({ descriptionRaw: 'ACME PAYROLL' })],
      [{ employer: 'Acme Corp', cadence: 'monthly' }],
    );
    expect(result[0]!.confidence).toBeCloseTo(1.0);
  });

  it('excludes transactions with wrong amount', () => {
    const result = matchPayslipToIncome(payslip, [baseTx({ amountCents: toCents(BigInt(400000)) })], []);
    expect(result).toHaveLength(0);
  });

  it('excludes transactions more than 3 days apart', () => {
    const result = matchPayslipToIncome(payslip, [baseTx({ postedDate: '2026-05-05' })], []);
    expect(result).toHaveLength(0);
  });

  it('excludes negative (debit) transactions', () => {
    const result = matchPayslipToIncome(payslip, [baseTx({ amountCents: toCents(BigInt(-423456)) })], []);
    expect(result).toHaveLength(0);
  });

  it('matches at exactly ±3 days', () => {
    const r1 = matchPayslipToIncome(payslip, [baseTx({ postedDate: '2026-04-28' })], []);
    const r2 = matchPayslipToIncome(payslip, [baseTx({ postedDate: '2026-05-04' })], []);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });

  it('sorts results descending by confidence', () => {
    const result = matchPayslipToIncome(payslip, [
      baseTx({ id: 'low', descriptionRaw: 'DEPOSIT' }),
      baseTx({ id: 'high', descriptionRaw: 'ACME PAYROLL' }),
    ], []);
    expect(result[0]!.transactionId).toBe('high');
    expect(result[1]!.transactionId).toBe('low');
  });
});
