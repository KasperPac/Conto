'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { updateGoal } from '@/lib/db/queries/goals';
import { upsertBudget } from '@/lib/db/queries/budgets';
import type { Scenario } from '@/lib/domain/tradeoff';

async function getUser(): Promise<string> {
  try { return await getCurrentUserId(); }
  catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function applyScenarioAction(goalId: string, scenario: Scenario): Promise<void> {
  const userId = await getUser();

  // Calculate effective from: first day of current month
  const now = new Date();
  const effectiveFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  // Process each item in the scenario
  for (const item of scenario.items) {
    if (item.kind === 'category_budget' && item.newWeeklyBudgetCents !== undefined) {
      await upsertBudget(userId, {
        categoryId: item.id,
        period: 'weekly',
        amountCents: item.newWeeklyBudgetCents,
        effectiveFrom,
        fromGoalId: goalId,
      });
    }
  }

  // Update goal status to 'applied'
  await updateGoal(userId, goalId, { status: 'applied' });

  // Revalidate paths
  revalidatePath(`/plan/goals/${goalId}`);
  revalidatePath('/plan/budgets');
}
