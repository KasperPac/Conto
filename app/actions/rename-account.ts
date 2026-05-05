'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { renameAccount } from '@/lib/db/queries/accounts';

export async function renameAccountAction(accountId: string, name: string): Promise<void> {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
  if (!name.trim()) throw new Error('Name required');
  await renameAccount(userId, accountId, name.trim());
  revalidatePath('/accounts');
}
