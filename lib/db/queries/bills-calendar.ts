import { db } from '@/lib/db/client';
import { expectedEvents } from '@/lib/db/schema';
import { and, eq, gte, lte, notInArray } from 'drizzle-orm';
import type { CalendarDay } from '@/lib/types/cashflow';

export async function getBillsCalendar(
  userId: string,
  monthStart: string,
  monthEnd: string,
): Promise<CalendarDay[]> {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db.select().from(expectedEvents).where(and(
    eq(expectedEvents.userId, userId),
    gte(expectedEvents.expectedDate, monthStart),
    lte(expectedEvents.expectedDate, monthEnd),
    notInArray(expectedEvents.status, ['dismissed', 'superseded']),
  ));

  const byDay = new Map<string, CalendarDay['events']>();
  for (const r of rows) {
    let effectiveStatus: 'pending' | 'snoozed' | 'matched' | 'dismissed';
    if (r.status === 'snoozed' && r.snoozedUntil && r.snoozedUntil > today) {
      effectiveStatus = 'snoozed';
    } else if (r.status === 'snoozed') {
      effectiveStatus = 'pending'; // expired snooze
    } else {
      effectiveStatus = r.status as typeof effectiveStatus;
    }

    const date = r.expectedDate as string;
    const day = byDay.get(date) ?? [];
    day.push({
      id: r.id as any,
      description: r.description,
      expectedAmountCents: r.expectedAmountCents as any,
      confidence: Number(r.confidence),
      source: r.source as any,
      effectiveStatus,
    });
    byDay.set(date, day);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => ({ date, events }));
}
