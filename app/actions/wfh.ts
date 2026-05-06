'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { upsertWfhEntry as dbUpsert, deleteWfhEntry as dbDelete } from '@/lib/db/queries/wfh-entries';

async function getUser(): Promise<string> {
  try { return await getCurrentUserId(); }
  catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function upsertWfhEntry(date: string, hours: number): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format');
  const userId = await getUser();
  if (hours <= 0 || hours > 24) throw new Error('Hours must be between 0 and 24');
  await dbUpsert(userId, date, hours);
  revalidatePath('/income/wfh');
}

export async function deleteWfhEntry(date: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format');
  const userId = await getUser();
  await dbDelete(userId, date);
  revalidatePath('/income/wfh');
}
