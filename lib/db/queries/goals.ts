import { and, eq, not, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import type { Database } from '@/lib/db/client';
import { goals, accounts, transactions } from '@/lib/db/schema';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';

export interface Goal {
  id: string;
  name: string;
  goalType: string;
  targetAmountCents: Cents;
  targetDate: string | null;
  currentAmountCents: Cents;
  linkedAccountId: string | null;
  status: string;
  weeklyCostCents: Cents | null;
  createdAt: Date;
}

type CreateGoalInput = {
  name: string;
  goalType: string;
  targetAmountCents: bigint;
  targetDate?: string;
  currentAmountCents?: bigint;
  linkedAccountId?: string;
  weeklyCostCents?: bigint;
  status: string;
};

type GoalPatch = Partial<{
  name: string;
  targetAmountCents: bigint;
  targetDate: string;
  currentAmountCents: bigint;
  linkedAccountId: string;
  weeklyCostCents: bigint;
  status: string;
}>;

const computedBalance = sql<bigint>`
  (CASE WHEN ${goals.linkedAccountId} IS NULL
    THEN ${goals.currentAmountCents}
    ELSE (
      SELECT a.opening_balance_cents + COALESCE(SUM(t.amount_cents), 0)
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id
      WHERE a.id = ${goals.linkedAccountId}
      GROUP BY a.opening_balance_cents
    )
  END)::bigint
`;

function toBigInt(v: bigint | string | null | undefined): bigint {
  if (v == null) return BigInt(0);
  return typeof v === 'bigint' ? v : BigInt(v);
}

function rowToGoal(row: {
  id: string;
  name: string;
  goalType: string;
  targetAmountCents: bigint;
  targetDate: string | null;
  currentAmountCents: bigint | string;
  linkedAccountId: string | null;
  status: string;
  weeklyCostCents: bigint | null;
  createdAt: Date;
}): Goal {
  return {
    id: row.id,
    name: row.name,
    goalType: row.goalType,
    targetAmountCents: toCents(typeof row.targetAmountCents === 'bigint' ? row.targetAmountCents : BigInt(row.targetAmountCents)),
    targetDate: row.targetDate,
    currentAmountCents: toCents(toBigInt(row.currentAmountCents as bigint | string)),
    linkedAccountId: row.linkedAccountId,
    status: row.status,
    weeklyCostCents: row.weeklyCostCents != null ? toCents(row.weeklyCostCents) : null,
    createdAt: row.createdAt,
  };
}

async function selectGoals(tx: Database, userId: string, extraWhere?: SQL): Promise<Goal[]> {
  const conditions: SQL[] = [eq(goals.userId, userId)];
  if (extraWhere) conditions.push(extraWhere);

  const rows = await tx
    .select({
      id: goals.id,
      name: goals.name,
      goalType: goals.goalType,
      targetAmountCents: goals.targetAmountCents,
      targetDate: goals.targetDate,
      currentAmountCents: computedBalance,
      linkedAccountId: goals.linkedAccountId,
      status: goals.status,
      weeklyCostCents: goals.weeklyCostCents,
      createdAt: goals.createdAt,
    })
    .from(goals)
    .where(and(...conditions));

  return rows.map(rowToGoal);
}

export async function getGoals(userId: string): Promise<Goal[]> {
  return withUser(userId, async (tx) => {
    return selectGoals(tx, userId, not(inArray(goals.status, ['achieved', 'abandoned'])));
  });
}

export async function getGoalById(userId: string, id: string): Promise<Goal | null> {
  return withUser(userId, async (tx) => {
    const rows = await selectGoals(tx, userId, eq(goals.id, id));
    return rows[0] ?? null;
  });
}

export async function createGoal(userId: string, input: CreateGoalInput): Promise<Goal> {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .insert(goals)
      .values({
        userId,
        name: input.name,
        goalType: input.goalType,
        targetAmountCents: input.targetAmountCents,
        targetDate: input.targetDate ?? null,
        currentAmountCents: input.currentAmountCents ?? BigInt(0),
        linkedAccountId: input.linkedAccountId ?? null,
        weeklyCostCents: input.weeklyCostCents ?? null,
        status: input.status,
      })
      .returning({ id: goals.id });

    if (!row) throw new Error('Failed to insert goal');

    const rows = await selectGoals(tx, userId, eq(goals.id, row.id));
    if (!rows[0]) throw new Error('Failed to fetch created goal');
    return rows[0];
  });
}

export async function updateGoal(userId: string, id: string, patch: GoalPatch): Promise<void> {
  await withUser(userId, async (tx) => {
    const values: Record<string, unknown> = {};
    if (patch.name !== undefined)               values['name'] = patch.name;
    if (patch.targetAmountCents !== undefined)   values['targetAmountCents'] = patch.targetAmountCents;
    if (patch.targetDate !== undefined)          values['targetDate'] = patch.targetDate;
    if (patch.currentAmountCents !== undefined)  values['currentAmountCents'] = patch.currentAmountCents;
    if (patch.linkedAccountId !== undefined)     values['linkedAccountId'] = patch.linkedAccountId;
    if (patch.weeklyCostCents !== undefined)     values['weeklyCostCents'] = patch.weeklyCostCents;
    if (patch.status !== undefined)              values['status'] = patch.status;

    if (Object.keys(values).length === 0) return;

    await tx
      .update(goals)
      .set(values)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  });
}

export async function deleteGoal(userId: string, id: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx
      .delete(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  });
}
