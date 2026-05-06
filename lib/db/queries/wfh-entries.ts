import { and, eq, lt, lte, gte, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { wfhEntries } from '@/lib/db/schema';

export interface WfhEntry {
  id: string;
  date: string;
  hours: string; // numeric comes back as string from pg driver
}

export interface WfhSummary {
  totalHours: string;
  byMonth: Array<{ month: string; hours: string }>;
}

export async function upsertWfhEntry(userId: string, date: string, hours: number): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.insert(wfhEntries)
      .values({ userId, date, hours: String(hours) })
      .onConflictDoUpdate({
        target: [wfhEntries.userId, wfhEntries.date],
        set: { hours: String(hours), updatedAt: new Date() },
      });
  });
}

export async function deleteWfhEntry(userId: string, date: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.delete(wfhEntries)
      .where(and(eq(wfhEntries.userId, userId), eq(wfhEntries.date, date)));
  });
}

export async function getWfhEntriesByMonth(userId: string, year: number, month: number): Promise<WfhEntry[]> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const startOfNext = `${nextYear}-${pad(nextMonth)}-01`;
  return withUser(userId, async (tx) => {
    return tx.select({ id: wfhEntries.id, date: wfhEntries.date, hours: wfhEntries.hours })
      .from(wfhEntries)
      .where(and(eq(wfhEntries.userId, userId), gte(wfhEntries.date, start), lt(wfhEntries.date, startOfNext)))
      .orderBy(wfhEntries.date);
  });
}

export async function getWfhSummaryByFY(userId: string, fyStart: string, fyEnd: string): Promise<WfhSummary> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        month: sql<string>`to_char(${wfhEntries.date}, 'YYYY-MM')`,
        hours: sql<string>`sum(${wfhEntries.hours})::text`,
      })
      .from(wfhEntries)
      .where(and(eq(wfhEntries.userId, userId), gte(wfhEntries.date, fyStart), lte(wfhEntries.date, fyEnd)))
      .groupBy(sql`to_char(${wfhEntries.date}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${wfhEntries.date}, 'YYYY-MM')`);

    const totalHours = rows.reduce((acc, r) => acc + parseFloat(r.hours), 0).toFixed(2);
    return { totalHours, byMonth: rows };
  });
}
