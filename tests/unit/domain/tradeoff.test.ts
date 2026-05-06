import { describe, it, expect } from 'vitest';
import { computeTradeoffScenarios } from '@/lib/domain/tradeoff';
import { toCents } from '@/lib/types/money';

const sub = (id: string, name: string, weeklyCents: number) => ({
  id,
  name,
  weeklyEquivalentCents: toCents(BigInt(weeklyCents)),
});

const cat = (id: string, name: string, avg: number, med: number, essential = false) => ({
  categoryId: id,
  categoryName: name,
  isEssential: essential,
  threeMonthAvgWeeklyCents: toCents(BigInt(avg)),
  threeMonthMedianWeeklyCents: toCents(BigInt(med)),
  currentBudgetCents: null,
});

describe('computeTradeoffScenarios', () => {
  it('returns [] when surplus already covers target', () => {
    const result = computeTradeoffScenarios({
      weeklySurplusCents: toCents(BigInt(500)),
      weeklyTargetCents: toCents(BigInt(500)),
      subscriptions: [sub('s1', 'Netflix', 300)],
      categorySpending: [cat('c1', 'Dining', 400, 200)],
    });
    expect(result).toEqual([]);
  });

  it('returns [] when surplus exceeds target', () => {
    const result = computeTradeoffScenarios({
      weeklySurplusCents: toCents(BigInt(600)),
      weeklyTargetCents: toCents(BigInt(500)),
      subscriptions: [],
      categorySpending: [],
    });
    expect(result).toEqual([]);
  });

  it('Scenario A: single subscription covers the gap', () => {
    const result = computeTradeoffScenarios({
      weeklySurplusCents: toCents(BigInt(0)),
      weeklyTargetCents: toCents(BigInt(300)),
      subscriptions: [sub('s1', 'Netflix', 500)],
      categorySpending: [],
    });

    const scenarioA = result.find(s => s.label === 'Option 1 — Cancel subscriptions');
    expect(scenarioA).toBeDefined();
    expect(scenarioA!.items).toHaveLength(1);
    expect(scenarioA!.items[0]).toMatchObject({
      kind: 'subscription',
      id: 's1',
      name: 'Netflix',
      weeklyGainCents: toCents(BigInt(500)),
    });
    expect(scenarioA!.totalWeeklyGainCents).toBe(toCents(BigInt(500)));
  });

  it('Scenario B: category cut covers the gap; newWeeklyBudgetCents equals the median', () => {
    const result = computeTradeoffScenarios({
      weeklySurplusCents: toCents(BigInt(0)),
      weeklyTargetCents: toCents(BigInt(150)),
      subscriptions: [],
      categorySpending: [cat('c1', 'Dining', 400, 200)],
    });

    const scenarioB = result.find(s => s.label === 'Option 2 — Reduce category spending');
    expect(scenarioB).toBeDefined();
    expect(scenarioB!.items).toHaveLength(1);
    expect(scenarioB!.items[0]).toMatchObject({
      kind: 'category_budget',
      id: 'c1',
      name: 'Dining',
      weeklyGainCents: toCents(BigInt(200)), // avg - med = 400 - 200
      newWeeklyBudgetCents: toCents(BigInt(200)), // median
    });
  });

  it('Scenario C: mixed subscription + category cut produces a scenario with both kinds', () => {
    const result = computeTradeoffScenarios({
      weeklySurplusCents: toCents(BigInt(0)),
      weeklyTargetCents: toCents(BigInt(400)),
      subscriptions: [sub('s1', 'Netflix', 200)],
      categorySpending: [cat('c1', 'Dining', 400, 200)], // cuttable = 200
    });

    const scenarioC = result.find(s => s.label === 'Option 3 — Mixed');
    expect(scenarioC).toBeDefined();
    const kinds = scenarioC!.items.map(i => i.kind);
    expect(kinds).toContain('subscription');
    expect(kinds).toContain('category_budget');
  });

  it('omits scenarios that cannot cover the gap', () => {
    // Gap of 1000, only subscription worth 100 — Scenario A cannot cover it
    const result = computeTradeoffScenarios({
      weeklySurplusCents: toCents(BigInt(0)),
      weeklyTargetCents: toCents(BigInt(1000)),
      subscriptions: [sub('s1', 'Netflix', 100)],
      categorySpending: [], // no categories to cut
    });

    // Scenario A can't cover (100 < 1000), B can't cover (no categories), C can't cover
    expect(result).toEqual([]);
  });

  it('returns at most 3 scenarios even with many candidates', () => {
    const subs = Array.from({ length: 10 }, (_, i) =>
      sub(`s${i}`, `Sub ${i}`, 500),
    );
    const cats = Array.from({ length: 10 }, (_, i) =>
      cat(`c${i}`, `Cat ${i}`, 400, 200),
    );

    const result = computeTradeoffScenarios({
      weeklySurplusCents: toCents(BigInt(0)),
      weeklyTargetCents: toCents(BigInt(400)),
      subscriptions: subs,
      categorySpending: cats,
    });

    expect(result.length).toBeLessThanOrEqual(3);
  });
});
