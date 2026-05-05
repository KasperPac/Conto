import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { and, eq, ilike } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactions, rules, categories } from '@/lib/db/schema';
import { resetTestDb, seedUserAndAccount, testDb } from '../helpers/db';

describe('reclassifyTransaction logic', () => {
  let userId: string;
  let accountId: string;
  let tx1Id: string;
  let tx2Id: string;
  let catId: string;

  beforeEach(async () => {
    await resetTestDb();
    const seeded = await seedUserAndAccount();
    userId = seeded.userId;
    accountId = seeded.accountId;

    const txRows = await withUser(userId, tx =>
      tx.insert(transactions).values([
        {
          userId,
          accountId,
          postedDate: '2026-01-01',
          descriptionRaw: 'WOOLWORTHS SYDNEY',
          amountCents: BigInt(-4560),
          classificationSource: 'unclassified' as const,
        },
        {
          userId,
          accountId,
          postedDate: '2026-01-08',
          descriptionRaw: 'WOOLWORTHS SYDNEY',
          amountCents: BigInt(-3200),
          classificationSource: 'unclassified' as const,
        },
      ]).returning({ id: transactions.id }),
    );

    if (!txRows[0] || !txRows[1]) throw new Error('Failed to insert test transactions');
    tx1Id = txRows[0].id;
    tx2Id = txRows[1].id;

    const catRows = await withUser(userId, tx =>
      tx.insert(categories).values({
        userId,
        name: 'Groceries',
        isIncome: false,
        isEssential: true,
        isDiscretionary: false,
      }).returning({ id: categories.id }),
    );
    if (!catRows[0]) throw new Error('Failed to insert test category');
    catId = catRows[0].id;
  });

  it('sets category on a single transaction', async () => {
    await withUser(userId, async (tx) => {
      await tx.update(transactions)
        .set({ categoryId: catId, classificationSource: 'manual' })
        .where(and(eq(transactions.id, tx1Id), eq(transactions.userId, userId)));
    });

    const [updated] = await testDb.select().from(transactions).where(eq(transactions.id, tx1Id));
    expect(updated?.categoryId).toBe(catId);
    expect(updated?.classificationSource).toBe('manual');

    const [untouched] = await testDb.select().from(transactions).where(eq(transactions.id, tx2Id));
    expect(untouched?.categoryId).toBeNull();
  });

  it('apply-to-all creates rule and updates all matching transactions', async () => {
    await withUser(userId, async (tx) => {
      const [updated] = await tx.update(transactions)
        .set({ categoryId: catId, classificationSource: 'manual' })
        .where(and(eq(transactions.id, tx1Id), eq(transactions.userId, userId)))
        .returning({ descriptionRaw: transactions.descriptionRaw });

      if (!updated) return;

      await tx.insert(rules).values({
        userId,
        pattern: updated.descriptionRaw,
        matchField: 'description_raw',
        categoryId: catId,
        priority: 0,
        source: 'manual',
        createdFromTransactionId: tx1Id,
        active: true,
      });

      await tx.update(transactions)
        .set({ categoryId: catId, classificationSource: 'manual' })
        .where(and(
          eq(transactions.userId, userId),
          ilike(transactions.descriptionRaw, `%${updated.descriptionRaw}%`),
        ));
    });

    const [tx1Updated] = await testDb.select().from(transactions).where(eq(transactions.id, tx1Id));
    const [tx2Updated] = await testDb.select().from(transactions).where(eq(transactions.id, tx2Id));
    expect(tx1Updated?.categoryId).toBe(catId);
    expect(tx2Updated?.categoryId).toBe(catId);

    const ruleRows = await testDb.select().from(rules).where(eq(rules.userId, userId));
    expect(ruleRows.length).toBe(1);
    expect(ruleRows[0]?.pattern).toBe('WOOLWORTHS SYDNEY');
  });
});
