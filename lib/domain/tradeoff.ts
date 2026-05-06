import { toCents, type Cents } from '@/lib/types/money';

export interface TradeoffInput {
  weeklySurplusCents: Cents;
  weeklyTargetCents: Cents;
  subscriptions: Array<{ id: string; name: string; weeklyEquivalentCents: Cents }>;
  categorySpending: Array<{
    categoryId: string;
    categoryName: string;
    isEssential: boolean;
    threeMonthAvgWeeklyCents: Cents;
    threeMonthMedianWeeklyCents: Cents;
    currentBudgetCents: Cents | null;
  }>;
}

export interface ScenarioItem {
  kind: 'subscription' | 'category_budget';
  id: string;
  name: string;
  weeklyGainCents: Cents;
  newWeeklyBudgetCents?: Cents; // only for category_budget items
}

export interface Scenario {
  label: string;
  items: ScenarioItem[];
  totalWeeklyGainCents: Cents;
}

/** Greedy pick from candidates until accumulated gain >= gap. Returns picked items or null if gap can't be covered. */
function greedyCover(candidates: ScenarioItem[], gap: bigint): ScenarioItem[] | null {
  let accumulated = 0n;
  const picked: ScenarioItem[] = [];
  for (const c of candidates) {
    picked.push(c);
    accumulated += c.weeklyGainCents as unknown as bigint;
    if (accumulated >= gap) return picked;
  }
  return null;
}

function totalGain(items: ScenarioItem[]): Cents {
  const sum = items.reduce((acc, i) => acc + (i.weeklyGainCents as unknown as bigint), 0n);
  return toCents(sum);
}

/** Returns a key for deduplication: sorted item IDs joined. */
function scenarioKey(items: ScenarioItem[]): string {
  return [...items.map(i => i.id)].sort().join(',');
}

export function computeTradeoffScenarios(input: TradeoffInput): Scenario[] {
  const gap =
    (input.weeklyTargetCents as unknown as bigint) -
    (input.weeklySurplusCents as unknown as bigint);

  if (gap <= 0n) return [];

  // --- Build tier candidates ---

  // Tier 1: subscriptions sorted descending by weekly cost
  const tier1: ScenarioItem[] = [...input.subscriptions]
    .sort((a, b) => {
      const diff =
        (b.weeklyEquivalentCents as unknown as bigint) -
        (a.weeklyEquivalentCents as unknown as bigint);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    })
    .map(s => ({
      kind: 'subscription' as const,
      id: s.id,
      name: s.name,
      weeklyGainCents: s.weeklyEquivalentCents,
    }));

  // Tier 2 & 3: categories where avg > median, sorted descending by cuttable amount
  const buildCatItem = (c: TradeoffInput['categorySpending'][number]): ScenarioItem | null => {
    const avg = c.threeMonthAvgWeeklyCents as unknown as bigint;
    const med = c.threeMonthMedianWeeklyCents as unknown as bigint;
    if (avg <= med) return null;
    return {
      kind: 'category_budget' as const,
      id: c.categoryId,
      name: c.categoryName,
      weeklyGainCents: toCents(avg - med),
      newWeeklyBudgetCents: c.threeMonthMedianWeeklyCents,
    };
  };

  const sortByGainDesc = (a: ScenarioItem, b: ScenarioItem) => {
    const diff =
      (b.weeklyGainCents as unknown as bigint) -
      (a.weeklyGainCents as unknown as bigint);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  };

  const tier2: ScenarioItem[] = input.categorySpending
    .filter(c => !c.isEssential)
    .map(buildCatItem)
    .filter((x): x is ScenarioItem => x !== null)
    .sort(sortByGainDesc);

  const tier3: ScenarioItem[] = input.categorySpending
    .filter(c => c.isEssential)
    .map(buildCatItem)
    .filter((x): x is ScenarioItem => x !== null)
    .sort(sortByGainDesc);

  const allCats = [...tier2, ...tier3];

  // --- Generate scenarios ---
  const scenarios: Scenario[] = [];
  const seenKeys = new Set<string>();

  const tryAdd = (label: string, items: ScenarioItem[] | null) => {
    if (scenarios.length >= 3) return;
    if (!items) return;
    const key = scenarioKey(items);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    scenarios.push({ label, items, totalWeeklyGainCents: totalGain(items) });
  };

  // Scenario A: cancel subscriptions
  const scenarioA = greedyCover(tier1, gap);
  tryAdd('Option 1 — Cancel subscriptions', scenarioA);

  // Scenario B: reduce category spending
  const scenarioB = greedyCover(allCats, gap);
  tryAdd('Option 2 — Reduce category spending', scenarioB);

  // Scenario C: mixed — highest-cost sub + greedy cats for remainder
  if (tier1.length > 0) {
    const buildMixed = (subIndex: number): ScenarioItem[] | null => {
      const sub = tier1[subIndex];
      if (!sub) return null;
      const subGain = sub.weeklyGainCents as unknown as bigint;
      const remaining = gap - subGain;
      if (remaining <= 0n) {
        // Sub alone covers gap — not a useful mixed scenario
        return null;
      }
      const catPart = greedyCover(allCats, remaining);
      if (!catPart) return null;
      return [sub, ...catPart];
    };

    let mixed = buildMixed(0);
    if (!mixed && tier1.length > 1) {
      // First sub alone would cover gap; try second sub for a distinct scenario
      mixed = buildMixed(1);
    }
    tryAdd('Option 3 — Mixed', mixed);
  }

  return scenarios;
}
