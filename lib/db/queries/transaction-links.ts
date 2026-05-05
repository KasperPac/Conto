import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { withUser } from '@/lib/db/client';
import { transactionLinks, transactions, accounts } from '@/lib/db/schema';
import type { TxWithAccount } from '@/lib/domain/transfers';
import { toCents } from '@/lib/types/money';

export interface LinkRow {
  id: string;
  linkType: string;
  confidence: string | null;
  source: string;
  fromTxId: string;
  fromDate: string;
  fromDesc: string;
  fromAmountCents: bigint;
  fromAccountName: string;
  toTxId: string;
  toDate: string;
  toDesc: string;
  toAmountCents: bigint;
  toAccountName: string;
}

export async function getUnlinkedTransactions(userId: string): Promise<TxWithAccount[]> {
  return withUser(userId, async (tx) => {
    const fromRows = await tx
      .select({ id: transactionLinks.fromTransactionId })
      .from(transactionLinks)
      .where(eq(transactionLinks.userId, userId));

    const toRows = await tx
      .select({ id: transactionLinks.toTransactionId })
      .from(transactionLinks)
      .where(and(
        eq(transactionLinks.userId, userId),
        sql`${transactionLinks.toTransactionId} is not null`,
      ));

    const linkedIds = [
      ...fromRows.map(r => r.id),
      ...toRows.map(r => r.id!),
    ];

    const conditions = [eq(transactions.userId, userId)];
    if (linkedIds.length > 0) conditions.push(notInArray(transactions.id, linkedIds));

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
      .where(and(...conditions));

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
      .innerJoin(toTx,    eq(transactionLinks.toTransactionId,   toTx.id))
      .innerJoin(fromAcc, eq(fromTx.accountId,  fromAcc.id))
      .innerJoin(toAcc,   eq(toTx.accountId,    toAcc.id))
      .where(and(
        eq(transactionLinks.userId, userId),
        inArray(transactionLinks.source, sourceFilter),
      ))
      .orderBy(desc(transactionLinks.createdAt));

    return rows.map(r => ({
      ...r,
      toTxId:        r.toTxId!,
      toDate:        r.toDate!,
      toDesc:        r.toDesc!,
      toAmountCents: r.toAmountCents!,
      toAccountName: r.toAccountName!,
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
    if (!link) return;
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
  await withUser(userId, async (tx) => {
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
    if (!link) return;
    const ids = [link.fromId, link.toId].filter((id): id is string => id != null);
    if (ids.length > 0) {
      await tx.update(transactions)
        .set({ isExcludedFromSpending: false })
        .where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));
    }
  });
}
