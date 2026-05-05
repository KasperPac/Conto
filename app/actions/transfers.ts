'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import {
  confirmLink,
  dismissLink,
  createManualLink,
  unlinkTransactions,
} from '@/lib/db/queries/transaction-links';

async function getUser(): Promise<string> {
  try {
    return await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function confirmTransferLink(linkId: string): Promise<void> {
  const userId = await getUser();
  await confirmLink(userId, linkId);
  revalidatePath('/transfers');
}

export async function dismissTransferLink(linkId: string): Promise<void> {
  const userId = await getUser();
  await dismissLink(userId, linkId);
  revalidatePath('/transfers');
}

export async function createManualTransferLink(
  fromTxId: string,
  toTxId: string,
  linkType: string,
): Promise<void> {
  const userId = await getUser();
  await createManualLink(userId, fromTxId, toTxId, linkType as 'transfer' | 'cc_payment');
  revalidatePath('/transfers');
}

export async function unlinkTransferTransactions(linkId: string): Promise<void> {
  const userId = await getUser();
  await unlinkTransactions(userId, linkId);
  revalidatePath('/transfers');
}
