'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { upsertBudget, deactivateBudget } from '@/lib/db/queries/budgets';

async function getUser(): Promise<string> {
  try { return await getCurrentUserId(); }
  catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function upsertBudgetAction(input: {
  categoryId: string;
  period: string;
  amountCents: bigint;
  effectiveFrom: string;
  fromGoalId?: string;
}): Promise<void> {
  const userId = await getUser();
  await upsertBudget(userId, {
    categoryId: input.categoryId,
    period: input.period,
    amountCents: input.amountCents,
    effectiveFrom: input.effectiveFrom,
    fromGoalId: input.fromGoalId,
  });
  revalidatePath('/plan/budgets');
}

export async function deactivateBudgetAction(budgetId: string): Promise<void> {
  const userId = await getUser();
  await deactivateBudget(userId, budgetId);
  revalidatePath('/plan/budgets');
}
