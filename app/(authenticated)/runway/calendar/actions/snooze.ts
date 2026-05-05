'use server';
import { db } from '@/lib/db/client';
import { expectedEvents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function snoozeEvent(formData: FormData): Promise<void> {
  const id = String(formData.get('eventId'));
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + 30);
  await db.update(expectedEvents)
    .set({ status: 'snoozed', snoozedUntil: until.toISOString().slice(0, 10) })
    .where(eq(expectedEvents.id, id));
  revalidatePath('/runway/calendar');
  revalidatePath('/runway');
}
