import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db';
import { goals, accounts, transactions } from '@/lib/db/schema';
import {
  getGoals,
  getGoalById,
  createGoal,
  updateGoal,
  deleteGoal,
} from '@/lib/db/queries/goals';
import { eq } from 'drizzle-orm';

describe('goals queries', () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await resetTestDb();
    ({ userId, accountId } = await seedUserAndAccount({ openingBalanceCents: BigInt(100000) }));
  });

  it('getGoals returns only active goals (not achieved/abandoned)', async () => {
    await testDb.insert(goals).values([
      {
        userId,
        name: 'Holiday Fund',
        goalType: 'savings',
        targetAmountCents: BigInt(500000),
        currentAmountCents: BigInt(100000),
        status: 'active',
      },
      {
        userId,
        name: 'Car',
        goalType: 'savings',
        targetAmountCents: BigInt(1000000),
        currentAmountCents: BigInt(500000),
        status: 'achieved',
      },
      {
        userId,
        name: 'Boat',
        goalType: 'savings',
        targetAmountCents: BigInt(200000),
        currentAmountCents: BigInt(0),
        status: 'abandoned',
      },
    ]);

    const result = await getGoals(userId);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Holiday Fund');
    expect(result[0]!.status).toBe('active');
  });

  it('getGoals computes currentAmountCents from linked account balance (opening + transactions)', async () => {
    // Opening balance is 100000 from seedUserAndAccount
    // Insert a transaction on the account: +50000
    await testDb.insert(transactions).values({
      userId,
      accountId,
      postedDate: '2026-01-15',
      descriptionRaw: 'Pay',
      amountCents: BigInt(50000),
      classificationSource: 'unclassified',
      isExcludedFromSpending: false,
    });

    await testDb.insert(goals).values({
      userId,
      name: 'Savings Account Goal',
      goalType: 'savings',
      targetAmountCents: BigInt(200000),
      currentAmountCents: BigInt(0), // stored value — should be ignored
      linkedAccountId: accountId,
      status: 'active',
    });

    const result = await getGoals(userId);
    expect(result).toHaveLength(1);
    // currentAmountCents should be opening (100000) + transaction (50000) = 150000
    expect(result[0]!.currentAmountCents).toBe(BigInt(150000));
  });

  it('createGoal inserts and returns the new goal', async () => {
    const goal = await createGoal(userId, {
      name: 'Emergency Fund',
      goalType: 'savings',
      targetAmountCents: BigInt(300000),
      currentAmountCents: BigInt(50000),
      status: 'active',
    });

    expect(goal.name).toBe('Emergency Fund');
    expect(goal.goalType).toBe('savings');
    expect(goal.targetAmountCents).toBe(BigInt(300000));
    expect(goal.currentAmountCents).toBe(BigInt(50000));
    expect(goal.status).toBe('active');
    expect(goal.id).toBeTruthy();

    // Verify it's in the DB
    const fetched = await getGoalById(userId, goal.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Emergency Fund');
  });

  it('updateGoal patches fields and enforces ownership', async () => {
    const [inserted] = await testDb.insert(goals).values({
      userId,
      name: 'Travel',
      goalType: 'savings',
      targetAmountCents: BigInt(100000),
      currentAmountCents: BigInt(0),
      status: 'active',
    }).returning();

    await updateGoal(userId, inserted!.id, {
      name: 'Europe Travel',
      targetAmountCents: BigInt(200000),
      status: 'active',
    });

    const updated = await getGoalById(userId, inserted!.id);
    expect(updated!.name).toBe('Europe Travel');
    expect(updated!.targetAmountCents).toBe(BigInt(200000));

    // Another user cannot update
    const otherUserId = 'aaaaaaaa-0000-0000-0000-000000000001';
    await updateGoal(otherUserId, inserted!.id, { name: 'Hacked' });

    const unchanged = await getGoalById(userId, inserted!.id);
    expect(unchanged!.name).toBe('Europe Travel');
  });

  it('deleteGoal removes the row', async () => {
    const [inserted] = await testDb.insert(goals).values({
      userId,
      name: 'Delete Me',
      goalType: 'savings',
      targetAmountCents: BigInt(10000),
      currentAmountCents: BigInt(0),
      status: 'active',
    }).returning();

    await deleteGoal(userId, inserted!.id);

    const rows = await testDb.select().from(goals).where(eq(goals.id, inserted!.id));
    expect(rows).toHaveLength(0);
  });
});
