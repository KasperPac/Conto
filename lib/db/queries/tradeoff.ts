import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { budgets, categories, expectedEvents, merchants, recurrenceGroups, transactions } from '@/lib/db/schema';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';
import type { TradeoffInput } from '@/lib/domain/tradeoff';

export type { TradeoffInput };

function cadenceToWeeklyMultiplier(cadence: string, amountCents: bigint): bigint {
  switch (cadence) {
    case 'weekly':      return amountCents;
    case 'fortnightly': return BigInt(Math.round(Number(amountCents) * 0.5));
    case 'monthly':     return amountCents * BigInt(100) / BigInt(433);
    case 'quarterly':   return amountCents * BigInt(100) / BigInt(1300);
    case 'annual':      return amountCents * BigInt(100) / BigInt(5200);
    default:            return amountCents * BigInt(100) / BigInt(433);
  }
}

function median(values: bigint[]): bigint {
  if (values.length === 0) return BigInt(0);
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  return sorted[mid]!;
}

export async function getTradeoffInputs(userId: string): Promise<TradeoffInput> {
  return withUser(userId, async (tx) => {
    // ─── Surplus ──────────────────────────────────────────────────────────────
    // Last 3 full calendar months
    const monthlyRows = await tx
      .select({
        month: sql<string>`to_char(date_trunc('month', ${transactions.postedDate}::date), 'YYYY-MM')`,
        totalCents: sql<bigint>`coalesce(sum(${transactions.amountCents}), 0)::bigint`,
        incomeCents: sql<bigint>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} else 0 end), 0)::bigint`,
        spendingCents: sql<bigint>`coalesce(sum(case when ${transactions.amountCents} < 0 and ${transactions.isExcludedFromSpending} = false then ${transactions.amountCents} else 0 end), 0)::bigint`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`${transactions.postedDate}::date >= date_trunc('month', current_date) - interval '3 months'`,
          sql`${transactions.postedDate}::date < date_trunc('month', current_date)`,
        ),
      )
      .groupBy(sql`date_trunc('month', ${transactions.postedDate}::date)`);

    const monthCount = Math.max(monthlyRows.length, 1);

    let totalIncome = BigInt(0);
    let totalSpending = BigInt(0);
    for (const row of monthlyRows) {
      const income = typeof row.incomeCents === 'bigint' ? row.incomeCents : BigInt(row.incomeCents as unknown as string);
      const spending = typeof row.spendingCents === 'bigint' ? row.spendingCents : BigInt(row.spendingCents as unknown as string);
      totalIncome += income;
      totalSpending += spending < 0 ? -spending : spending; // make positive
    }

    const avgMonthlyIncome = totalIncome / BigInt(monthCount);
    const avgMonthlySpending = totalSpending / BigInt(monthCount);
    const weeklySurplus = (avgMonthlyIncome - avgMonthlySpending) * BigInt(100) / BigInt(433);

    // ─── Subscriptions ────────────────────────────────────────────────────────
    const subRows = await tx
      .select({
        id: recurrenceGroups.id,
        name: merchants.canonicalName,
        cadence: recurrenceGroups.cadence,
        medianAmountCents: recurrenceGroups.medianAmountCents,
      })
      .from(recurrenceGroups)
      .innerJoin(
        merchants,
        and(
          eq(recurrenceGroups.merchantId, merchants.id),
          eq(merchants.isSubscription, true),
        ),
      )
      .where(
        and(
          eq(recurrenceGroups.userId, userId),
          ne(recurrenceGroups.status, 'cancelled'),
        ),
      );

    const subscriptions = subRows.map(row => {
      const amount = typeof row.medianAmountCents === 'bigint'
        ? row.medianAmountCents
        : BigInt(row.medianAmountCents as unknown as string);
      // Subscription amounts are negative (debits); use absolute value
      const absAmount = amount < 0 ? -amount : amount;
      return {
        id: row.id,
        name: row.name,
        weeklyEquivalentCents: toCents(cadenceToWeeklyMultiplier(row.cadence, absAmount)),
      };
    });

    // ─── Category spending (last 3 months by week) ────────────────────────────
    const weeklySpendRows = await tx
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        isEssential: categories.isEssential,
        week: sql<string>`to_char(date_trunc('week', ${transactions.postedDate}::date), 'IYYY-IW')`,
        weeklySpent: sql<bigint>`coalesce(sum(${transactions.amountCents}), 0)::bigint`,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.userId, userId),
          sql`${transactions.amountCents} < 0`,
          eq(transactions.isExcludedFromSpending, false),
          sql`${transactions.categoryId} IS NOT NULL`,
          sql`${transactions.postedDate}::date >= date_trunc('month', current_date) - interval '3 months'`,
          sql`${transactions.postedDate}::date < date_trunc('month', current_date)`,
        ),
      )
      .groupBy(
        transactions.categoryId,
        categories.name,
        categories.isEssential,
        sql`date_trunc('week', ${transactions.postedDate}::date)`,
      );

    // Group rows by category
    type CatAccum = {
      categoryName: string;
      isEssential: boolean;
      weekAmounts: bigint[];
    };
    const catMap = new Map<string, CatAccum>();

    for (const row of weeklySpendRows) {
      if (!row.categoryId) continue;
      const weeklyAmt = typeof row.weeklySpent === 'bigint'
        ? row.weeklySpent
        : BigInt(row.weeklySpent as unknown as string);
      // amounts are negative; use absolute value
      const absAmt = weeklyAmt < 0 ? -weeklyAmt : weeklyAmt;

      if (!catMap.has(row.categoryId)) {
        catMap.set(row.categoryId, {
          categoryName: row.categoryName ?? '',
          isEssential: row.isEssential ?? false,
          weekAmounts: [],
        });
      }
      catMap.get(row.categoryId)!.weekAmounts.push(absAmt);
    }

    // Fetch active budgets for currentBudgetCents
    const activeBudgetRows = await tx
      .select({
        categoryId: budgets.categoryId,
        period: budgets.period,
        amountCents: budgets.amountCents,
      })
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          or(isNull(budgets.effectiveTo), sql`${budgets.effectiveTo} >= current_date`),
        ),
      );

    const budgetMap = new Map<string, Cents>();
    for (const row of activeBudgetRows) {
      const amount = typeof row.amountCents === 'bigint'
        ? row.amountCents
        : BigInt(row.amountCents as unknown as string);
      const weekly = row.period === 'weekly'
        ? amount
        : amount * BigInt(100) / BigInt(433);
      budgetMap.set(row.categoryId, toCents(weekly));
    }

    // Build categorySpending output — average over 13 weeks
    const WEEKS = BigInt(13);
    const categorySpending = Array.from(catMap.entries()).map(([categoryId, acc]) => {
      const total = acc.weekAmounts.reduce((s, v) => s + v, BigInt(0));
      const avgWeekly = total / WEEKS;
      const medianWeekly = median(acc.weekAmounts);
      return {
        categoryId,
        categoryName: acc.categoryName,
        isEssential: acc.isEssential,
        threeMonthAvgWeeklyCents: toCents(avgWeekly),
        threeMonthMedianWeeklyCents: toCents(medianWeekly),
        currentBudgetCents: budgetMap.get(categoryId) ?? null,
      };
    });

    // ─── Projection surplus from expected_events (next 30 days) ──────────────
    const eventRows = await tx
      .select({
        sumPositive: sql<bigint>`coalesce(sum(case when ${expectedEvents.expectedAmountCents} > 0 then ${expectedEvents.expectedAmountCents} else 0 end), 0)::bigint`,
        sumNegative: sql<bigint>`coalesce(sum(case when ${expectedEvents.expectedAmountCents} < 0 then ${expectedEvents.expectedAmountCents} else 0 end), 0)::bigint`,
      })
      .from(expectedEvents)
      .where(
        and(
          eq(expectedEvents.userId, userId),
          eq(expectedEvents.status, 'pending'),
          or(
            isNull(expectedEvents.snoozedUntil),
            sql`${expectedEvents.snoozedUntil} <= current_date`,
          ),
          sql`${expectedEvents.expectedDate}::date >= current_date`,
          sql`${expectedEvents.expectedDate}::date < current_date + interval '30 days'`,
        ),
      );

    let projectionSurplus = weeklySurplus;
    if (eventRows[0]) {
      const row = eventRows[0];
      const sumPos = typeof row.sumPositive === 'bigint' ? row.sumPositive : BigInt(row.sumPositive as unknown as string);
      const sumNeg = typeof row.sumNegative === 'bigint' ? row.sumNegative : BigInt(row.sumNegative as unknown as string);
      // sumNeg is already negative; net = sumPos + sumNeg
      const netCents = sumPos + sumNeg;
      // Convert 30-day net to weekly: * 7 / 30
      projectionSurplus = (netCents * 7n) / 30n;
    }

    return {
      weeklySurplusCents: toCents(weeklySurplus),
      projectionSurplusCents: toCents(projectionSurplus),
      weeklyTargetCents: toCents(BigInt(0)),
      subscriptions,
      categorySpending,
    };
  });
}
