import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactions, transactionLinks, accounts } from '@/lib/db/schema';
import { resetTestDb, seedUserAndAccount, testDb } from '../helpers/db';
import {
  confirmLink,
  dismissLink,
  createManualLink,
  unlinkTransactions,
} from '@/lib/db/queries/transaction-links';

describe('transfer link operations', () => {
  let userId: string;
  let accountIdA: string;
  let accountIdB: string;
  let fromTxId: string;
  let toTxId: string;

  beforeEach(async () => {
    await resetTestDb();
    const seeded = await seedUserAndAccount();
    userId    = seeded.userId;
    accountIdA = seeded.accountId;

    const [accB] = await withUser(userId, tx =>
      tx.insert(accounts).values({
        userId,
        name: 'Savings ••5678',
        institution: 'TEST',
        type: 'savings',
        openingBalanceCents: BigInt(0),
        openingBalanceDate: '2026-01-01',
      }).returning({ id: accounts.id }),
    );
    if (!accB) throw new Error('insert failed');
    accountIdB = accB.id;

    const txRows = await withUser(userId, tx =>
      tx.insert(transactions).values([
        {
          userId, accountId: accountIdA,
          postedDate: '2026-03-01', descriptionRaw: 'Transfer out',
          amountCents: BigInt(-50000), classificationSource: 'unclassified' as const,
        },
        {
          userId, accountId: accountIdB,
          postedDate: '2026-03-01', descriptionRaw: 'Transfer in',
          amountCents: BigInt(50000), classificationSource: 'unclassified' as const,
        },
      ]).returning({ id: transactions.id }),
    );
    if (!txRows[0] || !txRows[1]) throw new Error('insert failed');
    fromTxId = txRows[0].id;
    toTxId   = txRows[1].id;
  });

  async function insertSuggestedLink(): Promise<string> {
    const [link] = await withUser(userId, tx =>
      tx.insert(transactionLinks).values({
        userId,
        linkType:          'transfer',
        fromTransactionId: fromTxId,
        toTransactionId:   toTxId,
        confidence:        '0.750',
        source:            'suggested',
      }).returning({ id: transactionLinks.id }),
    );
    if (!link) throw new Error('insert failed');
    return link.id;
  }

  it('confirmLink → source becomes user, both legs excluded', async () => {
    const linkId = await insertSuggestedLink();
    await confirmLink(userId, linkId);

    const [link] = await testDb.select().from(transactionLinks).where(eq(transactionLinks.id, linkId));
    expect(link?.source).toBe('user');

    const [fromTx] = await testDb.select().from(transactions).where(eq(transactions.id, fromTxId));
    const [toTx]   = await testDb.select().from(transactions).where(eq(transactions.id, toTxId));
    expect(fromTx?.isExcludedFromSpending).toBe(true);
    expect(toTx?.isExcludedFromSpending).toBe(true);
  });

  it('dismissLink → row deleted, legs unchanged', async () => {
    const linkId = await insertSuggestedLink();
    await dismissLink(userId, linkId);

    const links = await testDb.select().from(transactionLinks).where(eq(transactionLinks.id, linkId));
    expect(links).toHaveLength(0);

    const [fromTx] = await testDb.select().from(transactions).where(eq(transactions.id, fromTxId));
    const [toTx]   = await testDb.select().from(transactions).where(eq(transactions.id, toTxId));
    expect(fromTx?.isExcludedFromSpending).toBe(false);
    expect(toTx?.isExcludedFromSpending).toBe(false);
  });

  it('createManualLink → row inserted with source=user, both legs excluded', async () => {
    await createManualLink(userId, fromTxId, toTxId, 'transfer');

    const links = await testDb.select().from(transactionLinks).where(eq(transactionLinks.userId, userId));
    expect(links).toHaveLength(1);
    expect(links[0]!.source).toBe('user');
    expect(links[0]!.confidence).toBe('1.000');

    const [fromTx] = await testDb.select().from(transactions).where(eq(transactions.id, fromTxId));
    const [toTx]   = await testDb.select().from(transactions).where(eq(transactions.id, toTxId));
    expect(fromTx?.isExcludedFromSpending).toBe(true);
    expect(toTx?.isExcludedFromSpending).toBe(true);
  });

  it('unlinkTransactions → row deleted, both legs reset to false', async () => {
    const linkId = await insertSuggestedLink();
    await confirmLink(userId, linkId);  // First confirm to set isExcludedFromSpending=true
    await unlinkTransactions(userId, linkId);

    const links = await testDb.select().from(transactionLinks).where(eq(transactionLinks.id, linkId));
    expect(links).toHaveLength(0);

    const [fromTx] = await testDb.select().from(transactions).where(eq(transactions.id, fromTxId));
    const [toTx]   = await testDb.select().from(transactions).where(eq(transactions.id, toTxId));
    expect(fromTx?.isExcludedFromSpending).toBe(false);
    expect(toTx?.isExcludedFromSpending).toBe(false);
  });
});
