'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { clearReceipt } from '@/lib/db/queries/receipts';
import { deleteReceiptObject } from '@/lib/storage/delete-receipt';

async function getUserId(): Promise<string> {
  try {
    return await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function deleteReceipt(transactionId: string): Promise<void> {
  const userId = await getUserId();

  // Read the key before clearing so we can delete from R2
  const [row] = await withUser(userId, db =>
    db.select({ receiptObjectKey: transactions.receiptObjectKey })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId))),
  );
  const key = row?.receiptObjectKey ?? null;

  await clearReceipt(userId, transactionId);

  if (key) {
    await deleteReceiptObject(key).catch(() => {
      // R2 deletion is best-effort; DB is already cleared
    });
  }

  revalidatePath('/income/receipts');
  revalidatePath('/accounts', 'layout');
}
