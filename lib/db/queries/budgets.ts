import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { budgets, categories, transactions } from '@/lib/db/schema';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';

export interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  period: string;
  amountCents: Cents;
  effectiveFrom: string;
  effectiveTo: string | null;
  fromGoalId: string | null;
}

export interface BudgetWithSpend extends Budget {
  spentCents: Cents;
}

type UpsertBudgetInput = {
  categoryId: string;
  period: string;
  amountCents: bigint;
  effectiveFrom: string;
  fromGoalId?: string;
};

// Active budget: effectiveTo IS NULL OR effectiveTo >= current_date
const isActive = or(isNull(budgets.effectiveTo), sql`${budgets.effectiveTo} >= current_date`);

function rowToBudget(row: {
  id: string;
  categoryId: string;
  categoryName: string;
  period: string;
  amountCents: bigint;
  effectiveFrom: string;
  effectiveTo: string | null;
  fromGoalId: string | null;
}): Budget {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    period: row.period,
    amountCents: toCents(row.amountCents),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    fromGoalId: row.fromGoalId,
  };
}

export async function getBudgets(userId: string): Promise<Budget[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        categoryName: categories.name,
        period: budgets.period,
        amountCents: budgets.amountCents,
        effectiveFrom: budgets.effectiveFrom,
        effectiveTo: budgets.effectiveTo,
        fromGoalId: budgets.fromGoalId,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .where(and(eq(budgets.userId, userId), isActive));

    return rows.map(rowToBudget);
  });
}

export async function getBudgetWithSpend(
  userId: string,
  period: string,
  periodStart: string,
  periodEnd: string,
): Promise<BudgetWithSpend[]> {
  return withUser(userId, async (tx) => {
    // Budgets active for this period
    const activeBudgets = await tx
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        categoryName: categories.name,
        period: budgets.period,
        amountCents: budgets.amountCents,
        effectiveFrom: budgets.effectiveFrom,
        effectiveTo: budgets.effectiveTo,
        fromGoalId: budgets.fromGoalId,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, userId),
          eq(budgets.period, period),
          isActive,
        ),
      );

    if (activeBudgets.length === 0) return [];

    // Sum of negative non-excluded transactions per category in the period
    const spendRows = await tx
      .select({
        categoryId: transactions.categoryId,
        spentCents: sql<bigint>`coalesce(sum(${transactions.amountCents}), 0)::bigint`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`${transactions.postedDate} >= ${periodStart}`,
          sql`${transactions.postedDate} <= ${periodEnd}`,
          sql`${transactions.amountCents} < 0`,
          eq(transactions.isExcludedFromSpending, false),
        ),
      )
      .groupBy(transactions.categoryId);

    const spendMap = new Map<string, bigint>();
    for (const row of spendRows) {
      if (row.categoryId) {
        const v = typeof row.spentCents === 'bigint' ? row.spentCents : BigInt(row.spentCents as unknown as string);
        spendMap.set(row.categoryId, v);
      }
    }

    return activeBudgets.map(b => ({
      ...rowToBudget(b),
      spentCents: toCents(spendMap.get(b.categoryId) ?? BigInt(0)),
    }));
  });
}

export async function upsertBudget(userId: string, input: UpsertBudgetInput): Promise<void> {
  await withUser(userId, async (tx) => {
    // Check for existing active budget for same category+period
    const existing = await tx
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          eq(budgets.categoryId, input.categoryId),
          eq(budgets.period, input.period),
          isActive,
        ),
      );

    if (existing.length > 0 && existing[0]) {
      // UPDATE existing
      await tx
        .update(budgets)
        .set({
          amountCents: input.amountCents,
          effectiveFrom: input.effectiveFrom,
          fromGoalId: input.fromGoalId ?? null,
        })
        .where(eq(budgets.id, existing[0].id));
    } else {
      // INSERT new
      await tx.insert(budgets).values({
        userId,
        categoryId: input.categoryId,
        period: input.period,
        amountCents: input.amountCents,
        effectiveFrom: input.effectiveFrom,
        fromGoalId: input.fromGoalId ?? null,
      });
    }
  });
}

export async function deactivateBudget(userId: string, id: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx
      .update(budgets)
      .set({ effectiveTo: sql`current_date` })
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId)));
  });
}
