import { describe, it, expect } from 'vitest';
import acme from '@/tests/fixtures/cashflow-runway/pay-cadence/fortnightly-acme.json';
import irregular from '@/tests/fixtures/cashflow-runway/pay-cadence/irregular.json';
import { detectPayCadence } from '@/lib/domain/pay-cadence';

describe('detectPayCadence', () => {
  it('detects fortnightly ACME payroll', () => {
    const candidates = detectPayCadence(acme, { minOccurrences: 3, maxAmountStddevPct: 0.1 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].cadence).toBe('fortnightly');
    expect(candidates[0].employer).toMatch(/ACME/);
    expect(Number(candidates[0].expectedNetCents)).toBe(250000);
  });

  it('returns no candidates for irregular credits', () => {
    const candidates = detectPayCadence(irregular, { minOccurrences: 3, maxAmountStddevPct: 0.1 });
    expect(candidates).toHaveLength(0);
  });
});
