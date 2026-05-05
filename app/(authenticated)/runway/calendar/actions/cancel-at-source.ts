'use server';
import { db } from '@/lib/db/client';
import { expectedEvents, recurrenceGroups } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth/server';
import { boss } from '@/lib/jobs/boss';
import { revalidatePath } from 'next/cache';

export async function cancelAtSource(formData: FormData): Promise<void> {
  const userId = await getCurrentUserId();
  const id = String(formData.get('eventId'));
  const [ev] = await db.select().from(expectedEvents).where(eq(expectedEvents.id, id)).limit(1);
  if (!ev || ev.source !== 'recurrence_group' || !ev.sourceId) return;
  await db.update(recurrenceGroups).set({ status: 'cancelled' }).where(eq(recurrenceGroups.id, ev.sourceId));
  await boss.send('project-expected-events', { userId });
  revalidatePath('/runway/calendar');
  revalidatePath('/runway');
}
