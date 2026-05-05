import { describe, it, expect } from 'vitest';
import { projectRunway } from '@/lib/domain/runway';
import type { ExpectedEvent } from '@/lib/types/cashflow';

const TODAY = '2026-05-04';

function makeEvent(date: string, amountCents: number, low?: number, high?: number): ExpectedEvent {
  return {
    id: 'e' as any,
    userId: 'u',
    accountId: 'a',
    source: 'recurrence_group',
    sourceId: 'rg',
    expectedDate: date,
    expectedAmountCents: BigInt(amountCents) as any,
    expectedAmountLowCents:  BigInt(low  ?? amountCents) as any,
    expectedAmountHighCents: BigInt(high ?? amountCents) as any,
    description: 'X',
    status: 'pending',
    matchedTransactionId: null,
    snoozedUntil: null,
    confidence: 0.9,
    generatedAt: new Date(),
    userNote: null,
  };
}

describe('projectRunway', () => {
  it('returns horizonDays+1 points when there are no events', () => {
    const points = projectRunway(BigInt(100000) as any, [], 7, TODAY);
    expect(points).toHaveLength(8); // day 0 through day 7
    points.forEach(p => expect(Number(p.projectedBalanceCents)).toBe(100000));
  });

  it('subtracts an outflow on its expected_date and propagates forward', () => {
    const events = [makeEvent('2026-05-06', -2000)]; // day 2 from TODAY
    const points = projectRunway(BigInt(100000) as any, events, 5, TODAY);
    expect(Number(points[0].projectedBalanceCents)).toBe(100000); // day 0
    expect(Number(points[1].projectedBalanceCents)).toBe(100000); // day 1
    expect(Number(points[2].projectedBalanceCents)).toBe(98000);  // day 2 (2026-05-06)
    expect(Number(points[5].projectedBalanceCents)).toBe(98000);  // propagated
  });

  it('ignores events past the horizon', () => {
    const events = [makeEvent('2026-06-30', -50000)]; // way past 5d
    const points = projectRunway(BigInt(100000) as any, events, 5, TODAY);
    points.forEach(p => expect(Number(p.projectedBalanceCents)).toBe(100000));
  });

  it('low/high reflect amount range bands', () => {
    const events = [makeEvent('2026-05-05', -2000, -2500, -1500)]; // day 1
    const points = projectRunway(BigInt(100000) as any, events, 3, TODAY);
    expect(Number(points[1].lowCents)).toBe(97500);  // 100000 + (-2500)
    expect(Number(points[1].highCents)).toBe(98500); // 100000 + (-1500)
  });
});
