import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { withUser } from '@/lib/db/client';
import { transactionLinks, transactions, accounts } from '@/lib/db/schema';
import type { TxWithAccount } from '@/lib/domain/transfers';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';

export interface LinkRow {
  id: string;
  linkType: string;
  confidence: string | null;
  source: string;
  fromTxId: string;
  fromDate: string;
  fromDesc: string;
  fromAmountCents: Cents;
  fromAccountName: string;
  toTxId: string | null;
  toDate: string | null;
  toDesc: string | null;
  toAmountCents: Cents | null;
  toAccountName: string | null;
}

export async function getUnlinkedTransactions(userId: string): Promise<TxWithAccount[]> {
  return withUser(userId, async (tx) => {
    // Single query: exclude any transaction that appears on either leg of a link,
    // using a UNION subquery instead of 3 round-trips + an unbounded IN list.
    const linkedSub = sql<string>`(
      SELECT from_transaction_id FROM transaction_links WHERE user_id = ${userId}
      UNION
      SELECT to_transaction_id FROM transaction_links WHERE user_id = ${userId} AND to_transaction_id IS NOT NULL
    )`;

    const rows = await tx
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        accountType: accounts.type,
        postedDate: transactions.postedDate,
        amountCents: transactions.amountCents,
        descriptionRaw: transactions.descriptionRaw,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(
        eq(transactions.userId, userId),
        sql`${transactions.id} NOT IN ${linkedSub}`,
      ));

    return rows.map(r => ({
      ...r,
      accountType: r.accountType as 'checking' | 'savings' | 'credit_card',
      amountCents: toCents(r.amountCents),
    }));
  });
}

async function fetchLinkRows(userId: string, sourceFilter: string[]): Promise<LinkRow[]> {
  return withUser(userId, async (tx) => {
    const fromTx  = alias(transactions, 'from_tx');
    const toTx    = alias(transactions, 'to_tx');
    const fromAcc = alias(accounts, 'from_acc');
    const toAcc   = alias(accounts, 'to_acc');

    const rows = await tx
      .select({
        id:              transactionLinks.id,
        linkType:        transactionLinks.linkType,
        confidence:      transactionLinks.confidence,
        source:          transactionLinks.source,
        fromTxId:        transactionLinks.fromTransactionId,
        fromDate:        fromTx.postedDate,
        fromDesc:        fromTx.descriptionRaw,
        fromAmountCents: fromTx.amountCents,
        fromAccountName: fromAcc.name,
        toTxId:          transactionLinks.toTransactionId,
        toDate:          toTx.postedDate,
        toDesc:          toTx.descriptionRaw,
        toAmountCents:   toTx.amountCents,
        toAccountName:   toAcc.name,
      })
      .from(transactionLinks)
      .innerJoin(fromTx,  eq(transactionLinks.fromTransactionId, fromTx.id))
      .leftJoin(toTx,    eq(transactionLinks.toTransactionId,   toTx.id))
      .innerJoin(fromAcc, eq(fromTx.accountId,  fromAcc.id))
      .leftJoin(toAcc,   eq(toTx.accountId,    toAcc.id))
      .where(and(
        eq(transactionLinks.userId, userId),
        inArray(transactionLinks.source, sourceFilter),
      ))
      .orderBy(desc(transactionLinks.createdAt));

    return rows.map(r => ({
      ...r,
      fromAmountCents: toCents(r.fromAmountCents),
      toAmountCents: r.toAmountCents != null ? toCents(r.toAmountCents) : null,
    }));
  });
}

export function getSuggestedLinks(userId: string): Promise<LinkRow[]> {
  return fetchLinkRows(userId, ['suggested']);
}

export function getConfirmedLinks(userId: string): Promise<LinkRow[]> {
  return fetchLinkRows(userId, ['auto', 'user']);
}

export async function confirmLink(userId: string, linkId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    const [link] = await tx
      .update(transactionLinks)
      .set({ source: 'user' })
      .where(and(eq(transactionLinks.id, linkId), eq(transactionLinks.userId, userId)))
      .returning({
        fromId: transactionLinks.fromTransactionId,
        toId:   transactionLinks.toTransactionId,
      });
    if (!link) throw new Error('Link not found');
    const ids = [link.fromId, link.toId].filter((id): id is string => id != null);
    if (ids.length > 0) {
      await tx.update(transactions)
        .set({ isExcludedFromSpending: true })
        .where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));
    }
  });
}

export async function dismissLink(userId: string, linkId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.delete(transactionLinks)
      .where(and(eq(transactionLinks.id, linkId), eq(transactionLinks.userId, userId)));
  });
}

export async function createManualLink(
  userId: string,
  fromTxId: string,
  toTxId: string,
  linkType: 'transfer' | 'cc_payment',
): Promise<void> {
  if (fromTxId === toTxId) throw new Error('Cannot link a transaction to itself');
  await withUser(userId, async (tx) => {
    const owned = await tx.select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), inArray(transactions.id, [fromTxId, toTxId])));
    if (owned.length !== 2) throw new Error('One or both transactions not found for user');
    await tx.insert(transactionLinks).values({
      userId,
      linkType,
      fromTransactionId: fromTxId,
      toTransactionId:   toTxId,
      confidence:        '1.000',
      source:            'user',
    });
    await tx.update(transactions)
      .set({ isExcludedFromSpending: true })
      .where(and(
        eq(transactions.userId, userId),
        inArray(transactions.id, [fromTxId, toTxId]),
      ));
  });
}

export async function unlinkTransactions(userId: string, linkId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    const [link] = await tx
      .delete(transactionLinks)
      .where(and(eq(transactionLinks.id, linkId), eq(transactionLinks.userId, userId)))
      .returning({
        fromId: transactionLinks.fromTransactionId,
        toId:   transactionLinks.toTransactionId,
      });
    if (!link) throw new Error('Link not found');
    const candidates = [link.fromId, link.toId].filter((id): id is string => id != null);
    if (candidates.length === 0) return;

    // Only reset isExcludedFromSpending for legs no longer referenced by any remaining link.
    // A transaction may appear on multiple links (e.g. manual + suggested), so check first.
    const remaining = await tx
      .select({
        fromId: transactionLinks.fromTransactionId,
        toId:   transactionLinks.toTransactionId,
      })
      .from(transactionLinks)
      .where(and(
        eq(transactionLinks.userId, userId),
        or(...candidates.flatMap(c => [
          eq(transactionLinks.fromTransactionId, c),
          eq(transactionLinks.toTransactionId, c),
        ])),
      ));

    const stillLinked = new Set([
      ...remaining.map(r => r.fromId),
      ...remaining.map(r => r.toId).filter((id): id is string => id != null),
    ]);
    const toReset = candidates.filter(id => !stillLinked.has(id));
    if (toReset.length > 0) {
      await tx.update(transactions)
        .set({ isExcludedFromSpending: false })
        .where(and(eq(transactions.userId, userId), inArray(transactions.id, toReset)));
    }
  });
}
