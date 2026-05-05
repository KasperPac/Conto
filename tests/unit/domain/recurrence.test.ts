import { describe, it, expect } from 'vitest';
import netflix from '@/tests/fixtures/cashflow-runway/recurrence/monthly-netflix.json';
import rent from '@/tests/fixtures/cashflow-runway/recurrence/fortnightly-rent.json';
import noise from '@/tests/fixtures/cashflow-runway/recurrence/random-noise.json';
import { detectRecurrence } from '@/lib/domain/recurrence';

describe('detectRecurrence', () => {
  it('detects monthly Netflix from 3 identical charges 30d apart', () => {
    const groups = detectRecurrence(netflix, { minOccurrences: 3, maxStddevPct: 0.25 });
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.cadence).toBe('monthly');
    expect(g.medianIntervalDays).toBeGreaterThanOrEqual(28);
    expect(g.medianIntervalDays).toBeLessThanOrEqual(31);
    expect(Number(g.medianAmountCents)).toBe(-1599);
    expect(g.memberTransactionIds).toHaveLength(3);
    expect(g.confidence).toBeGreaterThan(0.9);
  });

  it('detects fortnightly rent', () => {
    const groups = detectRecurrence(rent, { minOccurrences: 3, maxStddevPct: 0.25 });
    expect(groups).toHaveLength(1);
    expect(groups[0].cadence).toBe('fortnightly');
  });

  it('returns no groups for unrelated charges', () => {
    const groups = detectRecurrence(noise, { minOccurrences: 3, maxStddevPct: 0.25 });
    expect(groups).toHaveLength(0);
  });
});
