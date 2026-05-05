import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { transactions, categories, rules } from '@/lib/db/schema';
import { bulkInsertTransactions } from '@/lib/db/queries/transactions';
import { seedAuMerchants } from '@/lib/db/seeds/au-merchants';
import { getUserRules } from '@/lib/db/queries/rules';
import { getUserMerchants } from '@/lib/db/queries/merchants';
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db';
import type { ParsedRow } from '@/lib/parsers/pdf/types';

describe('classify on ingest', () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await resetTestDb();
    await seedAuMerchants(testDb as any);
    ({ userId, accountId } = await seedUserAndAccount());
  });

  it('Woolworths transaction is classified as Groceries via merchant pattern', async () => {
    const rulesList = await getUserRules(userId);
    const merchantsList = await getUserMerchants(userId);

    const rows: ParsedRow[] = [{
      posted_date: '2026-05-01',
      description_raw: 'WOOLWORTHS 0423 SYDNEY',
      amount_cents: BigInt(-5432),
      balance_after_cents: undefined,
    }];

    await bulkInsertTransactions(userId, accountId, null, rows, rulesList, merchantsList);

    const [tx] = await testDb.select().from(transactions).where(eq(transactions.userId, userId));
    expect(tx!.classificationSource).toBe('system_rule');
    expect(tx!.merchantId).not.toBeNull();

    const [cat] = await testDb.select({ name: categories.name }).from(categories)
      .where(eq(categories.id, tx!.categoryId!));
    expect(cat!.name).toBe('Groceries');
  });

  it('unrecognised transaction stays unclassified', async () => {
    const rulesList = await getUserRules(userId);
    const merchantsList = await getUserMerchants(userId);

    const rows: ParsedRow[] = [{
      posted_date: '2026-05-02',
      description_raw: 'XYZZY RANDOM SHOP 9999',
      amount_cents: BigInt(-1000),
      balance_after_cents: undefined,
    }];

    await bulkInsertTransactions(userId, accountId, null, rows, rulesList, merchantsList);

    const [tx] = await testDb.select().from(transactions).where(eq(transactions.userId, userId));
    expect(tx!.classificationSource).toBe('unclassified');
    expect(tx!.categoryId).toBeNull();
  });

  it('user rule wins over merchant pattern', async () => {
    const [cat] = await testDb.insert(categories).values({
      userId,
      name: 'My Custom Category',
      isIncome: false,
      isEssential: false,
      isDiscretionary: true,
      isDeductibleCandidate: false,
    }).returning();

    await testDb.insert(rules).values({
      userId,
      pattern: 'WOOLWORTHS',
      matchField: 'description_raw',
      categoryId: cat!.id,
      priority: 10,
      source: 'manual',
      active: true,
    });

    const rulesList = await getUserRules(userId);
    const merchantsList = await getUserMerchants(userId);

    const rows: ParsedRow[] = [{
      posted_date: '2026-05-03',
      description_raw: 'WOOLWORTHS 0423 SYDNEY',
      amount_cents: BigInt(-3000),
      balance_after_cents: undefined,
    }];

    await bulkInsertTransactions(userId, accountId, null, rows, rulesList, merchantsList);

    const [tx] = await testDb.select().from(transactions).where(eq(transactions.userId, userId));
    expect(tx!.classificationSource).toBe('user_rule');
    expect(tx!.categoryId).toBe(cat!.id);
  });
});
