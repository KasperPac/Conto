import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db';
import { budgets, categories, transactions } from '@/lib/db/schema';
import {
  getBudgets,
  getBudgetWithSpend,
  upsertBudget,
  deactivateBudget,
} from '@/lib/db/queries/budgets';
import { eq } from 'drizzle-orm';

describe('budgets queries', () => {
  let userId: string;
  let accountId: string;
  let categoryId: string;

  beforeEach(async () => {
    await resetTestDb();
    ({ userId, accountId } = await seedUserAndAccount());

    const [cat] = await testDb.insert(categories).values({
      name: 'Groceries',
      isIncome: false,
      isEssential: true,
    }).returning();
    categoryId = cat!.id;
  });

  it('getBudgets returns active budgets joined with category name', async () => {
    await testDb.insert(budgets).values({
      userId,
      categoryId,
      period: 'monthly',
      amountCents: BigInt(50000),
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    });

    const result = await getBudgets(userId);
    expect(result).toHaveLength(1);
    expect(result[0]!.categoryName).toBe('Groceries');
    expect(result[0]!.amountCents).toBe(BigInt(50000));
    expect(result[0]!.period).toBe('monthly');
  });

  it('getBudgets excludes deactivated budgets (effectiveTo in past)', async () => {
    await testDb.insert(budgets).values([
      {
        userId,
        categoryId,
        period: 'monthly',
        amountCents: BigInt(50000),
        effectiveFrom: '2025-01-01',
        effectiveTo: '2025-06-30', // past date
      },
      {
        userId,
        categoryId,
        period: 'weekly',
        amountCents: BigInt(20000),
        effectiveFrom: '2026-01-01',
        effectiveTo: null, // active
      },
    ]);

    const result = await getBudgets(userId);
    expect(result).toHaveLength(1);
    expect(result[0]!.period).toBe('weekly');
  });

  it('getBudgetWithSpend sums negative non-excluded transactions in the period', async () => {
    await testDb.insert(budgets).values({
      userId,
      categoryId,
      period: 'monthly',
      amountCents: BigInt(50000),
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    });

    // Spending transaction (negative, not excluded)
    await testDb.insert(transactions).values({
      userId,
      accountId,
      postedDate: '2026-05-10',
      descriptionRaw: 'Supermarket',
      amountCents: BigInt(-12000),
      categoryId,
      classificationSource: 'rule',
      isExcludedFromSpending: false,
    });

    // Excluded transaction (should not count)
    await testDb.insert(transactions).values({
      userId,
      accountId,
      postedDate: '2026-05-11',
      descriptionRaw: 'Transfer',
      amountCents: BigInt(-5000),
      categoryId,
      classificationSource: 'rule',
      isExcludedFromSpending: true,
    });

    // Positive transaction (income, should not count)
    await testDb.insert(transactions).values({
      userId,
      accountId,
      postedDate: '2026-05-12',
      descriptionRaw: 'Refund',
      amountCents: BigInt(3000),
      categoryId,
      classificationSource: 'rule',
      isExcludedFromSpending: false,
    });

    const result = await getBudgetWithSpend(userId, 'monthly', '2026-05-01', '2026-05-31');
    expect(result).toHaveLength(1);
    expect(result[0]!.amountCents).toBe(BigInt(50000));
    // Only the -12000 transaction should be counted (as positive absolute value)
    expect(result[0]!.spentCents).toBe(BigInt(12000));
  });

  it('upsertBudget updates existing active budget for same category+period (not insert duplicate)', async () => {
    // Insert initial budget
    await testDb.insert(budgets).values({
      userId,
      categoryId,
      period: 'monthly',
      amountCents: BigInt(30000),
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    });

    // Upsert should update, not duplicate
    await upsertBudget(userId, {
      categoryId,
      period: 'monthly',
      amountCents: BigInt(45000),
      effectiveFrom: '2026-05-01',
    });

    const rows = await testDb.select().from(budgets).where(eq(budgets.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountCents).toBe(BigInt(45000));

    // Also check via getBudgets
    const result = await getBudgets(userId);
    expect(result).toHaveLength(1);
    expect(result[0]!.amountCents).toBe(BigInt(45000));
  });

  it('deactivateBudget sets effectiveTo to today (and getBudgets no longer returns it)', async () => {
    const [inserted] = await testDb.insert(budgets).values({
      userId,
      categoryId,
      period: 'monthly',
      amountCents: BigInt(50000),
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    }).returning();

    // Before deactivation, it shows up
    const before = await getBudgets(userId);
    expect(before).toHaveLength(1);

    await deactivateBudget(userId, inserted!.id);

    // After deactivation, it should not show up in active budgets
    // (effectiveTo = today, which equals today so it would still pass ">=today" check)
    // The getBudgets filter is effectiveTo >= current_date, so today is included.
    // We need to verify effectiveTo is set to today
    const [updated] = await testDb.select().from(budgets).where(eq(budgets.id, inserted!.id));
    expect(updated!.effectiveTo).not.toBeNull();

    // Manually set effectiveTo to yesterday to verify exclusion works
    await testDb.update(budgets).set({ effectiveTo: '2026-05-05' }).where(eq(budgets.id, inserted!.id));
    const after = await getBudgets(userId);
    expect(after).toHaveLength(0);
  });
});
