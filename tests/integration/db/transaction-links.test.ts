import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactions, transactionLinks, accounts } from '@/lib/db/schema';
import { resetTestDb, seedUserAndAccount, testDb } from '../../helpers/db';
import {
  getUnlinkedTransactions,
  getSuggestedLinks,
  getConfirmedLinks,
  confirmLink,
  dismissLink,
  createManualLink,
  unlinkTransactions,
} from '@/lib/db/queries/transaction-links';

describe('transaction-links queries', () => {
  let userId: string;
  let accountIdA: string;
  let accountIdB: string;
  let fromTxId: string;
  let toTxId: string;

  beforeEach(async () => {
    await resetTestDb();
    const seeded = await seedUserAndAccount();
    userId = seeded.userId;
    accountIdA = seeded.accountId;

    const [accB] = await withUser(userId, tx =>
      tx.insert(accounts).values({
        userId,
        name: 'Savings',
        institution: 'TEST',
        type: 'savings',
        openingBalanceCents: BigInt(0),
        openingBalanceDate: '2026-01-01',
      }).returning({ id: accounts.id }),
    );
    if (!accB) throw new Error('seed failed');
    accountIdB = accB.id;

    const txRows = await withUser(userId, tx =>
      tx.insert(transactions).values([
        { userId, accountId: accountIdA, postedDate: '2026-03-01', descriptionRaw: 'Transfer out', amountCents: BigInt(-50000), classificationSource: 'unclassified' as const },
        { userId, accountId: accountIdB, postedDate: '2026-03-01', descriptionRaw: 'Transfer in',  amountCents: BigInt(50000),  classificationSource: 'unclassified' as const },
      ]).returning({ id: transactions.id }),
    );
    if (!txRows[0] || !txRows[1]) throw new Error('seed failed');
    fromTxId = txRows[0].id;
    toTxId   = txRows[1].id;
  });

  async function seedLink(source: string): Promise<string> {
    const [link] = await withUser(userId, tx =>
      tx.insert(transactionLinks).values({
        userId,
        linkType: 'transfer',
        fromTransactionId: fromTxId,
        toTransactionId: toTxId,
        confidence: '0.750',
        source,
      }).returning({ id: transactionLinks.id }),
    );
    if (!link) throw new Error('seed failed');
    return link.id;
  }

  it('getUnlinkedTransactions returns transactions not on either leg', async () => {
    // Both should be unlinked initially
    const unlinked = await getUnlinkedTransactions(userId);
    expect(unlinked.map(t => t.id)).toContain(fromTxId);
    expect(unlinked.map(t => t.id)).toContain(toTxId);

    // After linking, neither should appear
    await seedLink('suggested');
    const afterLink = await getUnlinkedTransactions(userId);
    expect(afterLink.map(t => t.id)).not.toContain(fromTxId);
    expect(afterLink.map(t => t.id)).not.toContain(toTxId);
  });

  it('getSuggestedLinks returns suggested rows', async () => {
    await seedLink('suggested');
    const rows = await getSuggestedLinks(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe('suggested');
  });

  it('getConfirmedLinks returns auto and user rows', async () => {
    await seedLink('auto');
    const rows = await getConfirmedLinks(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe('auto');
  });

  it('confirmLink sets source=user and excludes both legs', async () => {
    const linkId = await seedLink('suggested');
    await confirmLink(userId, linkId);

    const [link] = await testDb.select().from(transactionLinks).where(eq(transactionLinks.id, linkId));
    expect(link?.source).toBe('user');

    const [from] = await testDb.select().from(transactions).where(eq(transactions.id, fromTxId));
    const [to]   = await testDb.select().from(transactions).where(eq(transactions.id, toTxId));
    expect(from?.isExcludedFromSpending).toBe(true);
    expect(to?.isExcludedFromSpending).toBe(true);
  });

  it('dismissLink deletes row, legs unchanged', async () => {
    const linkId = await seedLink('suggested');
    await dismissLink(userId, linkId);

    const links = await testDb.select().from(transactionLinks).where(eq(transactionLinks.id, linkId));
    expect(links).toHaveLength(0);

    const [from] = await testDb.select().from(transactions).where(eq(transactions.id, fromTxId));
    expect(from?.isExcludedFromSpending).toBe(false);
  });

  it('createManualLink inserts with source=user, excludes both legs', async () => {
    await createManualLink(userId, fromTxId, toTxId, 'transfer');

    const links = await testDb.select().from(transactionLinks).where(eq(transactionLinks.userId, userId));
    expect(links).toHaveLength(1);
    expect(links[0]!.source).toBe('user');
    expect(links[0]!.confidence).toBe('1.000');

    const [from] = await testDb.select().from(transactions).where(eq(transactions.id, fromTxId));
    expect(from?.isExcludedFromSpending).toBe(true);
  });

  it('unlinkTransactions deletes row and resets isExcludedFromSpending', async () => {
    const linkId = await seedLink('suggested');
    await confirmLink(userId, linkId);
    await unlinkTransactions(userId, linkId);

    const links = await testDb.select().from(transactionLinks).where(eq(transactionLinks.id, linkId));
    expect(links).toHaveLength(0);

    const [from] = await testDb.select().from(transactions).where(eq(transactions.id, fromTxId));
    const [to]   = await testDb.select().from(transactions).where(eq(transactions.id, toTxId));
    expect(from?.isExcludedFromSpending).toBe(false);
    expect(to?.isExcludedFromSpending).toBe(false);
  });
});
