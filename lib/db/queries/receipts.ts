import { and, between, desc, eq, isNotNull } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';

export interface ReceiptRow {
  id: string;
  postedDate: string;
  descriptionRaw: string;
  amountCents: Cents;
  receiptObjectKey: string;
  receiptFilename: string;
  receiptContentType: string;
  receiptUploadedAt: Date | null;
}

export async function getReceiptsByFY(userId: string, fyStart: string, fyEnd: string): Promise<ReceiptRow[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: transactions.id,
        postedDate: transactions.postedDate,
        descriptionRaw: transactions.descriptionRaw,
        amountCents: transactions.amountCents,
        receiptObjectKey: transactions.receiptObjectKey,
        receiptFilename: transactions.receiptFilename,
        receiptContentType: transactions.receiptContentType,
        receiptUploadedAt: transactions.receiptUploadedAt,
      })
      .from(transactions)
      .where(and(
        eq(transactions.userId, userId),
        isNotNull(transactions.receiptObjectKey),
        between(transactions.postedDate, fyStart, fyEnd),
      ))
      .orderBy(desc(transactions.postedDate));

    return rows.map(r => ({
      ...r,
      amountCents: toCents(r.amountCents),
      receiptObjectKey: r.receiptObjectKey!,
      receiptFilename: r.receiptFilename ?? 'receipt',
      receiptContentType: r.receiptContentType ?? 'application/octet-stream',
    }));
  });
}

export async function clearReceipt(userId: string, transactionId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.update(transactions)
      .set({ receiptObjectKey: null, receiptFilename: null, receiptContentType: null, receiptUploadedAt: null })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
  });
}
