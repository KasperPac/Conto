'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { createGoal, updateGoal, deleteGoal } from '@/lib/db/queries/goals';
import { toCents } from '@/lib/types/money';

function dollarsToCents(s: string): bigint {
  const trimmed = s.trim();
  const [intPart = '0', fracPart = ''] = trimmed.split('.');
  const cents = fracPart.padEnd(2, '0').slice(0, 2);
  return BigInt(intPart) * 100n + BigInt(cents || '0');
}

async function getUser(): Promise<string> {
  try { return await getCurrentUserId(); }
  catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function createGoalAction(formData: FormData): Promise<void> {
  const userId = await getUser();

  const name = formData.get('name') as string | null;
  const goalType = formData.get('goalType') as string | null;
  const targetAmountCentsStr = formData.get('targetAmountCents') as string | null;
  const targetDate = formData.get('targetDate') as string | null;
  const weeklyCostCentsStr = formData.get('weeklyCostCents') as string | null;
  const linkedAccountId = formData.get('linkedAccountId') as string | null;

  if (!name) throw new Error('name is required');
  if (!goalType) throw new Error('goalType is required');

  const targetAmountCents =
    targetAmountCentsStr && targetAmountCentsStr.trim()
      ? BigInt(targetAmountCentsStr)
      : BigInt(0);
  const weeklyCostCents =
    weeklyCostCentsStr && weeklyCostCentsStr.trim()
      ? BigInt(weeklyCostCentsStr)
      : null;

  await createGoal(userId, {
    name,
    goalType,
    targetAmountCents,
    targetDate: targetDate || undefined,
    linkedAccountId: linkedAccountId || undefined,
    weeklyCostCents: weeklyCostCents || undefined,
    status: 'active',
  });

  revalidatePath('/plan/goals');
}

export async function updateCurrentAmountAction(goalId: string, cents: bigint): Promise<void> {
  const userId = await getUser();
  await updateGoal(userId, goalId, { currentAmountCents: cents });
  revalidatePath(`/plan/goals/${goalId}`);
}

export async function updateCurrentAmountFormAction(goalId: string, formData: FormData): Promise<void> {
  const userId = await getUser();
  const dollarsStr = formData.get('currentAmountDollars') as string | null;
  if (!dollarsStr || dollarsStr.trim() === '') return;
  const cents = toCents(dollarsToCents(dollarsStr));
  await updateGoal(userId, goalId, { currentAmountCents: cents });
  revalidatePath(`/plan/goals/${goalId}`);
}

export async function markGoalAchievedAction(goalId: string): Promise<void> {
  const userId = await getUser();
  await updateGoal(userId, goalId, { status: 'achieved' });
  revalidatePath('/plan/goals');
}

export async function abandonGoalAction(goalId: string): Promise<void> {
  const userId = await getUser();
  await updateGoal(userId, goalId, { status: 'abandoned' });
  revalidatePath('/plan/goals');
}

export async function deleteGoalAction(goalId: string): Promise<void> {
  const userId = await getUser();
  await deleteGoal(userId, goalId);
  revalidatePath('/plan/goals');
}
