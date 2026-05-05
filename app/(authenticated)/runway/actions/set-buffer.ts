'use server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth/server';
import { revalidatePath } from 'next/cache';

export async function setCashflowBuffer(formData: FormData): Promise<void> {
  const userId = await getCurrentUserId();
  const raw = formData.get('bufferCents');
  const cents = BigInt(String(raw ?? '0'));
  await db.update(users).set({ cashflowBufferCents: cents }).where(eq(users.id, userId));
  revalidatePath('/runway');
}
