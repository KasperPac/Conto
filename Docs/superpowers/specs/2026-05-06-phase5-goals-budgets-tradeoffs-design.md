# Phase 5 — Goals, Budgets & Trade-off Engine: Design Spec

## Scope

Phase 5 covers three tightly related planning features:

1. **Goals** — savings goals (track balance toward a target) and spending change goals (find headroom for a new recurring cost)
2. **Category budgets** — per-category monthly or weekly spending limits with real-time actuals
3. **Trade-off engine** — pure domain function that computes ranked cut-back scenarios for spending change goals; embedded in the goal detail page

**Out of scope for this phase:** donation tracker, super cap monitor, tax obligations on runway calendar (deferred to Phase 5.5).

---

## Schema

The `budgets` table exists as-is with RLS. The `goals` table exists but needs two new columns. One migration required: `0007_phase5_goals.sql`.

```sql
goals (
  id uuid pk,
  user_id uuid fk users,
  name text,
  target_amount_cents bigint,   -- savings goals: the savings target
  target_date date nullable,    -- savings goals only
  current_amount_cents bigint,  -- savings goals: current saved amount (manual or auto-synced from linked account)
  linked_account_id uuid fk accounts nullable,
  status text,                  -- active | achieved | abandoned | applied
                                -- 'applied' = spending_change goal where at least one scenario has been applied
  goal_type text,               -- savings | spending_change  (NEW — migration adds this)
  weekly_cost_cents bigint,     -- spending_change goals: target new weekly outlay (NEW — migration adds this)
  created_at timestamptz
)

budgets (
  id uuid pk,
  user_id uuid fk users,
  category_id uuid fk categories,
  period text,                  -- weekly | monthly
  amount_cents bigint,
  effective_from date,
  effective_to date nullable,   -- null = active indefinitely
  from_goal_id uuid fk goals nullable  -- set when created via applyScenario; drives the ✦ marker
                                       -- (NEW — migration adds this)
)
```

Migration `0007_phase5_goals.sql` adds:
```sql
alter table goals add column goal_type text not null default 'savings';
alter table goals add column weekly_cost_cents bigint;
alter table budgets add column from_goal_id uuid references goals(id);
```

---

## Routes & Navigation

New top-nav entry **"Plan"** added between Income and Runway.

| Route | Page |
|---|---|
| `/plan` | Redirects to `/plan/goals` |
| `/plan/goals` | Goals list — both types, two sections |
| `/plan/goals/new` | Add goal form (type selector + type-specific fields) |
| `/plan/goals/[id]` | Goal detail — savings or spending change variant |
| `/plan/budgets` | Budget list with current-period spend vs limit |

---

## Goals List — `/plan/goals`

Server component. Two labelled sections:

**Savings goals** — each row shows: name, target date, linked account or "manual", progress bar (current ÷ target), percentage, months remaining, status badge (On track / Behind / Achieved).

**Spending change goals** — each row shows: name, weekly cost, status badge (Plan ready / Draft / Applied).

Status logic:
- Savings "On track": current pace (current_amount ÷ months elapsed) ≥ required pace (remaining ÷ months left)
- Savings "Behind": current pace < required pace
- Spending change "Plan ready": trade-off scenarios can be computed (surplus data available)
- Spending change "Applied": at least one scenario has been applied (a budget was created from this goal)

---

## Goal Detail — `/plan/goals/[id]`

### Savings goal variant

- Progress bar: `current_amount_cents / target_amount_cents`
- If `linked_account_id` is set: `current_amount_cents` is the linked account's current balance (sum of opening balance + all transactions). Auto-derived on page load; not stored separately.
- If no linked account: user can edit `current_amount_cents` inline (manual update).
- Stats: monthly pace (current ÷ months since `created_at`; minimum 1 month to avoid division-by-zero), required monthly pace (remaining ÷ months to deadline), projected completion date at current pace.
- On-track / behind callout derived from pace comparison.
- Actions: Edit goal, Mark achieved, Abandon.

### Spending change goal variant

**Surplus panel** — shows current weekly surplus with a Historical / Projection toggle:
- **Historical** (default): `(avg_monthly_income − avg_monthly_spending) / 4.33` over the last 3 full calendar months. Income = sum of positive non-excluded transactions. Spending = sum of negative non-excluded transactions (absolute value). If fewer than 3 full months of data exist, use all available months (minimum 1 month); if no data at all, show surplus as $0 with a note.
- **Projection**: `(sum of positive expected_events − sum of negative expected_events over next 30 days) / (30/7)`. Uses pending + non-snoozed events from `expected_events`.

**Gap callout** — if `weekly_cost_cents > surplus`: "You need $X/wk more headroom to absorb this."

If `weekly_cost_cents ≤ surplus`: "Your current surplus covers this. You can absorb the cost without any changes." No scenarios needed.

**Scenarios** — 2–3 combinations produced by the trade-off engine (see below). Each shows: label, items being cut, total weekly saving, Apply button.

**Apply action:**
- For category cuts: creates or updates a `budgets` row for that category with the new lower limit (effective_from = start of current period).
- For subscription suggestions: renders "Consider cancelling [Name] — visit Subscriptions →" as a link; no DB write.
- On apply: goal `status` updated to `'applied'`; `budgets.from_goal_id` set to the goal id for any created budget rows; page revalidates.

---

## Trade-off Engine — `lib/domain/tradeoff.ts`

Pure function. No I/O.

```ts
interface TradeoffInput {
  weeklySurplusCents: bigint;
  weeklyTargetCents: bigint;
  subscriptions: Array<{ id: string; name: string; weeklyEquivalentCents: bigint }>;
  categorySpending: Array<{
    categoryId: string;
    categoryName: string;
    isEssential: boolean;
    threeMonthAvgWeeklyCents: bigint;
    threeMonthMedianWeeklyCents: bigint;
    currentBudgetCents: bigint | null;
  }>;
}

interface Scenario {
  label: string;
  items: ScenarioItem[];
  totalWeeklyGainCents: bigint;
}

interface ScenarioItem {
  kind: 'subscription' | 'category_budget';
  id: string;
  name: string;
  weeklyGainCents: bigint;
  newWeeklyBudgetCents?: bigint; // for category_budget items
}

export function computeTradeoffScenarios(input: TradeoffInput): Scenario[]
```

**Algorithm:**

1. Compute `gapCents = weeklyTargetCents − weeklySurplusCents`. If ≤ 0, return `[]`.
2. Build ranked candidate list:
   - **Tier 1** — subscriptions, sorted by weekly equivalent cost descending.
   - **Tier 2** — non-essential categories where `threeMonthAvgWeeklyCents > threeMonthMedianWeeklyCents`. Cuttable amount = `avg − median`. Sorted by cuttable amount descending.
   - **Tier 3** — essential categories (lower priority; included only if tiers 1–2 can't cover the gap).
3. Generate up to 3 scenarios by greedily picking from the candidate list with different starting points:
   - Scenario A: pure Tier 1 (subscriptions only) — if a single subscription covers the gap, use it; otherwise combine the cheapest set that covers it.
   - Scenario B: pure Tier 2 (category cuts only) — reduce highest-excess categories until gap is covered.
   - Scenario C: mixed — one Tier 1 item + smallest Tier 2 item needed to close the remaining gap.
4. Deduplicate; omit scenarios that can't cover the gap. Return at most 3.

The function is deterministic given the same input. Tests cover: surplus already sufficient, single-item solution, combo required, no solution possible.

---

## Budgets List — `/plan/budgets`

Server component. Period selector (Monthly / Weekly) stored as a `?period` query param.

**Summary cards** (top): Total budgeted / Spent so far / Remaining.

**Per-row columns**: Category name + period limit / Progress bar / Spent amount / Status badge.

**Status badge logic** (pace-adjusted):
- `projected_spend = (spent / days_elapsed) × days_in_period`
- **Over**: `spent > budget`
- **Watch**: `projected_spend > budget` (on track to overshoot if pace continues)
- **OK**: otherwise

Clicking a row opens an inline edit form (category, period, amount, effective_from). The form also allows setting `effective_to` to deactivate a budget.

Budgets created by applying a trade-off scenario are shown with a small ✦ marker.

---

## Data Queries

### `lib/db/queries/goals.ts`
- `getGoals(userId)` — all active goals ordered by created_at desc
- `getGoalById(userId, id)` — single goal
- `createGoal(userId, input)` — insert
- `updateGoal(userId, id, patch)` — partial update
- `deleteGoal(userId, id)` — hard delete (user's own planning data, not financial history)

### `lib/db/queries/budgets.ts`
- `getBudgets(userId)` — all active budgets (effective_to is null or in future), joined with category name
- `getBudgetWithSpend(userId, period, periodStart, periodEnd)` — budgets joined with sum of matching transaction amounts for the period
- `upsertBudget(userId, input)` — insert or update
- `deactivateBudget(userId, id)` — set effective_to = today

### `lib/db/queries/tradeoff.ts`
- `getTradeoffInputs(userId)` — fetches surplus data, active subscriptions, and 3-month category spend averages/medians needed by the engine

---

## Server Actions

### `app/actions/goals.ts`
- `createGoal(formData)` — validates, inserts, revalidates `/plan/goals`
- `updateGoal(id, patch)` — validates ownership, updates
- `markGoalAchieved(id)` — sets status = 'achieved'
- `abandonGoal(id)` — sets status = 'abandoned'

### `app/actions/budgets.ts`
- `upsertBudget(input)` — validates, upserts, revalidates `/plan/budgets`
- `deactivateBudget(id)` — sets effective_to = today

### `app/actions/tradeoff.ts`
- `applyScenario(goalId, scenario)` — for each category_budget item: calls `upsertBudget`; revalidates goal page and budgets page

---

## Components

| Component | Type | Purpose |
|---|---|---|
| `components/goal-progress-bar.tsx` | Server | Savings goal progress + stats |
| `components/tradeoff-panel.tsx` | Client | Surplus display + toggle + scenarios |
| `components/budget-row.tsx` | Client | Inline edit on click |
| `components/add-goal-modal.tsx` | Client | Type selector + type-specific form fields |

---

## Testing

- `tests/unit/domain/tradeoff.test.ts` — pure function: surplus sufficient, single item, combo, no solution
- `tests/integration/db/queries/goals.test.ts` — CRUD + linked-account progress derivation
- `tests/integration/db/queries/budgets.test.ts` — period spend aggregation, pace status logic

---

## Tone

All trade-off copy follows the information-not-advice rule (§9 of PLAN.md):

- ✅ "Based on your spending, you could free up $13/wk by cancelling Binge."
- ❌ "You should cancel Binge."

Scenarios are labelled "Option 1 / 2 / 3" and described as possibilities, never instructions.
