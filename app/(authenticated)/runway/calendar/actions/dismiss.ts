'use server';
import { db } from '@/lib/db/client';
import { expectedEvents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function dismissEvent(formData: FormData): Promise<void> {
  const id = String(formData.get('eventId'));
  await db.update(expectedEvents).set({ status: 'dismissed' }).where(eq(expectedEvents.id, id));
  revalidatePath('/runway/calendar');
  revalidatePath('/runway');
}
