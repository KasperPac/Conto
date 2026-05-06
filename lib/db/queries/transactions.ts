import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { withUser } from '@/lib/db/client';
import { transactionLinks, transactions, categories } from '@/lib/db/schema';
import type { ParsedRow } from '@/lib/parsers/pdf/types';
import { classifyTransaction } from '@/lib/domain/classification';
import type { LoadedRule, LoadedMerchant } from '@/lib/domain/classification';

export async function bulkInsertTransactions(
  userId: string,
  accountId: string,
  statementId: string | null,
  rows: ParsedRow[],
  userRules: LoadedRule[] = [],
  merchantList: LoadedMerchant[] = [],
): Promise<number> {
  if (rows.length === 0) return 0;
  return withUser(userId, async (tx) => {
    const values = rows.map(r => {
      const descriptionClean = r.description_raw.toLowerCase().replace(/\s+/g, ' ').trim();
      const classification = classifyTransaction(
        { descriptionRaw: r.description_raw, descriptionClean, merchantId: null },
        userRules,
        merchantList,
      );
      return {
        userId,
        accountId,
        statementId,
        postedDate: r.posted_date,
        descriptionRaw: r.description_raw,
        descriptionClean,
        amountCents: r.amount_cents,
        balanceAfterCents: r.balance_after_cents ?? null,
        categoryId: classification.categoryId ?? undefined,
        merchantId: classification.merchantId ?? undefined,
        classificationSource: classification.source,
        classificationRuleId: classification.ruleId ?? undefined,
      };
    });

    const result = await tx.insert(transactions)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: transactions.id });

    return result.length;
  });
}

export interface TxFilter {
  from?: string;
  to?: string;
  categoryId?: string;
  search?: string;
  direction?: 'debit' | 'credit';
  limit?: number;
  deductibleOnly?: boolean;
}

export async function getTransactions(userId: string, accountId: string, filter: TxFilter = {}) {
  return withUser(userId, async (tx) => {
    const limit = filter.limit ?? 50;
    const conditions = [
      eq(transactions.accountId, accountId),
      eq(transactions.userId, userId),
    ];
    if (filter.from)       conditions.push(gte(transactions.postedDate, filter.from));
    if (filter.to)         conditions.push(lte(transactions.postedDate, filter.to));
    if (filter.categoryId) conditions.push(eq(transactions.categoryId, filter.categoryId));
    if (filter.search)     conditions.push(ilike(transactions.descriptionRaw, `%${filter.search}%`));
    if (filter.direction === 'debit')  conditions.push(sql`${transactions.amountCents} < 0`);
    if (filter.direction === 'credit') conditions.push(sql`${transactions.amountCents} > 0`);
    if (filter.deductibleOnly)         conditions.push(eq(categories.isDeductibleCandidate, true));

    // LEFT JOIN both legs of transaction_links. Assumes a transaction appears on at most
    // one link per direction (enforced by application logic — no unique index on the legs).
    const fl = alias(transactionLinks, 'fl');
    const tl = alias(transactionLinks, 'tl');

    return tx.select({
      id:                    transactions.id,
      postedDate:            transactions.postedDate,
      descriptionRaw:        transactions.descriptionRaw,
      amountCents:           transactions.amountCents,
      balanceAfterCents:     transactions.balanceAfterCents,
      classificationSource:  transactions.classificationSource,
      categoryId:            transactions.categoryId,
      categoryName:          categories.name,
      isExcludedFromSpending: transactions.isExcludedFromSpending,
      receiptObjectKey: transactions.receiptObjectKey,
      receiptFilename: transactions.receiptFilename,
      receiptContentType: transactions.receiptContentType,
      linkType: sql<string | null>`COALESCE(${fl.linkType}, ${tl.linkType})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(fl, and(eq(fl.fromTransactionId, transactions.id), eq(fl.userId, userId)))
    .leftJoin(tl, and(eq(tl.toTransactionId,   transactions.id), eq(tl.userId, userId)))
    .where(and(...conditions))
    .orderBy(desc(transactions.postedDate), desc(transactions.id))
    .limit(limit + 1);
  });
}
