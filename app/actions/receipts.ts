'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { clearReceipt } from '@/lib/db/queries/receipts';

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
  await clearReceipt(userId, transactionId);
  revalidatePath('/income/receipts');
}
