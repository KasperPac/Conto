import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { getTransactions } from '@/lib/db/queries/transactions';
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db';
import { categories, transactions } from '@/lib/db/schema';

describe('getTransactions deductible filter', () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await resetTestDb();
    ({ userId, accountId } = await seedUserAndAccount());
  });

  it('deductibleOnly=true returns only deductible-category transactions', async () => {
    const [deductCat] = await testDb.insert(categories).values({
      userId,
      name: 'Work Tools',
      isIncome: false,
      isEssential: false,
      isDiscretionary: true,
      isDeductibleCandidate: true,
    }).returning();

    const [normalCat] = await testDb.insert(categories).values({
      userId,
      name: 'Groceries',
      isIncome: false,
      isEssential: true,
      isDiscretionary: false,
      isDeductibleCandidate: false,
    }).returning();

    await testDb.insert(transactions).values([
      {
        userId, accountId, postedDate: '2026-05-01', descriptionRaw: 'KEYBOARD PURCHASE',
        amountCents: BigInt(-15000), classificationSource: 'manual', categoryId: deductCat!.id,
        isExcludedFromSpending: false,
      },
      {
        userId, accountId, postedDate: '2026-05-02', descriptionRaw: 'WOOLWORTHS GROCERY',
        amountCents: BigInt(-5000), classificationSource: 'manual', categoryId: normalCat!.id,
        isExcludedFromSpending: false,
      },
    ]);

    const results = await getTransactions(userId, accountId, { deductibleOnly: true });
    expect(results).toHaveLength(1);
    expect(results[0]!.descriptionRaw).toBe('KEYBOARD PURCHASE');
  });

  it('deductibleOnly=false returns all transactions', async () => {
    await testDb.insert(transactions).values([
      {
        userId, accountId, postedDate: '2026-05-01', descriptionRaw: 'TX A',
        amountCents: BigInt(-1000), classificationSource: 'unclassified',
        isExcludedFromSpending: false,
      },
      {
        userId, accountId, postedDate: '2026-05-02', descriptionRaw: 'TX B',
        amountCents: BigInt(-2000), classificationSource: 'unclassified',
        isExcludedFromSpending: false,
      },
    ]);

    const results = await getTransactions(userId, accountId, {});
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});
