import { describe, it, expect, beforeEach } from 'vitest';
import { PgBoss } from 'pg-boss';
import 'dotenv/config';
import { resetTestDb, seedUserAndAccount, testDb } from '../../helpers/db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';

const url =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

describe('detect-transfers job', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function insertTx(userId: string, accountId: string, opts: {
    amount: bigint;
    date: string;
    desc: string;
  }) {
    const [row] = await withUser(userId, tx =>
      tx.insert(schema.transactions).values({
        userId,
        accountId,
        postedDate: opts.date,
        descriptionRaw: opts.desc,
        amountCents: opts.amount,
        classificationSource: 'unclassified' as const,
      }).returning({ id: schema.transactions.id }),
    );
    if (!row) throw new Error('insert failed');
    return row.id;
  }

  it('auto-links a high-confidence transfer pair', async () => {
    const { userId, accountId } = await seedUserAndAccount();

    const [savingsAcc] = await withUser(userId, tx =>
      tx.insert(schema.accounts).values({
        userId,
        name: 'Savings ••9999',
        institution: 'TEST',
        type: 'savings',
        openingBalanceCents: BigInt(0),
        openingBalanceDate: '2026-01-01',
      }).returning({ id: schema.accounts.id }),
    );
    if (!savingsAcc) throw new Error('insert failed');

    const fromId = await insertTx(userId, accountId,      { amount: BigInt(-50000), date: '2026-03-01', desc: 'Transfer to savings' });
    const toId   = await insertTx(userId, savingsAcc.id,  { amount: BigInt(50000),  date: '2026-03-01', desc: 'Transfer from everyday' });

    const boss = new PgBoss({ connectionString: url });
    await boss.start();

    const { registerDetectTransfers } = await import('@/lib/jobs/detect-transfers');
    await registerDetectTransfers(boss);

    await boss.send('detect-transfers', { userId });
    await new Promise(r => setTimeout(r, 4000));
    await boss.stop({ graceful: true });

    const [link] = await testDb
      .select()
      .from(schema.transactionLinks)
      .where(eq(schema.transactionLinks.userId, userId));

    expect(link?.source).toBe('auto');
    expect(link?.linkType).toBe('transfer');

    const [fromTx] = await testDb.select().from(schema.transactions).where(eq(schema.transactions.id, fromId));
    const [toTx]   = await testDb.select().from(schema.transactions).where(eq(schema.transactions.id, toId));
    expect(fromTx?.isExcludedFromSpending).toBe(true);
    expect(toTx?.isExcludedFromSpending).toBe(true);
  }, 20_000);

  it('stores a low-confidence pair as suggested without excluding legs', async () => {
    const { userId, accountId } = await seedUserAndAccount();

    const [savingsAcc] = await withUser(userId, tx =>
      tx.insert(schema.accounts).values({
        userId,
        name: 'Savings ••8888',
        institution: 'TEST',
        type: 'savings',
        openingBalanceCents: BigInt(0),
        openingBalanceDate: '2026-01-01',
      }).returning({ id: schema.accounts.id }),
    );
    if (!savingsAcc) throw new Error('insert failed');

    // 3-day gap, no keywords → confidence = 0.60 (suggested, not auto)
    const fromId = await insertTx(userId, accountId,     { amount: BigInt(-20000), date: '2026-03-01', desc: 'Salary' });
    const toId   = await insertTx(userId, savingsAcc.id, { amount: BigInt(20000),  date: '2026-03-04', desc: 'Deposit' });

    const boss = new PgBoss({ connectionString: url });
    await boss.start();

    const { registerDetectTransfers } = await import('@/lib/jobs/detect-transfers');
    await registerDetectTransfers(boss);

    await boss.send('detect-transfers', { userId });
    await new Promise(r => setTimeout(r, 4000));
    await boss.stop({ graceful: true });

    const [link] = await testDb
      .select()
      .from(schema.transactionLinks)
      .where(eq(schema.transactionLinks.userId, userId));

    expect(link?.source).toBe('suggested');

    const [fromTx] = await testDb.select().from(schema.transactions).where(eq(schema.transactions.id, fromId));
    const [toTx]   = await testDb.select().from(schema.transactions).where(eq(schema.transactions.id, toId));
    expect(fromTx?.isExcludedFromSpending).toBe(false);
    expect(toTx?.isExcludedFromSpending).toBe(false);
  }, 20_000);
});
