import { db } from '@/lib/db/client';
import { recurrenceGroups, payCadences, expectedEvents, accounts } from '@/lib/db/schema';
import { addDaysISO } from '@/lib/domain/_stats';
import { and, eq, gte, inArray, ne } from 'drizzle-orm';

export async function projectExpectedEvents(
  userId: string,
  horizonDays: number = 90,
): Promise<{ inserted: number; deleted: number }> {
  return await db.transaction(async (tx) => {
    const today = new Date().toISOString().slice(0, 10);
    const horizonEnd = addDaysISO(today, horizonDays);

    // Step 1: delete pending auto-source rows in the future window.
    // Rows with status != 'pending' (e.g. snoozed, matched) are preserved.
    const deleted = await tx.delete(expectedEvents).where(
      and(
        eq(expectedEvents.userId, userId),
        inArray(expectedEvents.source, ['recurrence_group', 'pay_cadence']),
        eq(expectedEvents.status, 'pending'),
        gte(expectedEvents.expectedDate, today),
      ),
    ).returning();

    // Fetch existing non-pending rows (snoozed, matched, etc.) so we can skip
    // re-inserting a pending duplicate for the same source+sourceId+date.
    const existingNonPending = await tx.select({
      sourceId: expectedEvents.sourceId,
      expectedDate: expectedEvents.expectedDate,
    }).from(expectedEvents).where(
      and(
        eq(expectedEvents.userId, userId),
        inArray(expectedEvents.source, ['recurrence_group', 'pay_cadence']),
        ne(expectedEvents.status, 'pending'),
        gte(expectedEvents.expectedDate, today),
      ),
    );
    const skipKey = new Set(
      existingNonPending.map(r => `${r.sourceId ?? ''}::${r.expectedDate as string}`),
    );

    // Step 2: project active recurrence_groups.
    const groups = await tx.select().from(recurrenceGroups).where(
      and(eq(recurrenceGroups.userId, userId), eq(recurrenceGroups.status, 'active')),
    );

    const rows: (typeof expectedEvents.$inferInsert)[] = [];

    // Use first active checking account as default for outflow events.
    const [primary] = await tx.select().from(accounts).where(
      and(eq(accounts.userId, userId), eq(accounts.type, 'checking'), eq(accounts.isActive, true)),
    ).limit(1);
    if (!primary) return { inserted: 0, deleted: deleted.length };

    for (const g of groups) {
      let date = g.nextExpectedDate as string;
      while (date <= horizonEnd) {
        if (!skipKey.has(`${g.id}::${date}`)) {
          rows.push({
            userId,
            accountId: primary.id,
            source: 'recurrence_group',
            sourceId: g.id,
            expectedDate: date,
            expectedAmountCents: g.medianAmountCents,
            expectedAmountLowCents: g.medianAmountCents - g.amountStddevCents,
            expectedAmountHighCents: g.medianAmountCents + g.amountStddevCents,
            description: g.descriptionPattern,
            status: 'pending',
            matchedTransactionId: null,
            snoozedUntil: null,
            confidence: g.confidence,
            generatedAt: new Date(),
            userNote: null,
          });
        }
        date = addDaysISO(date, g.medianIntervalDays);
      }
    }

    // Step 3: project active pay_cadences.
    const cadences = await tx.select().from(payCadences).where(
      and(eq(payCadences.userId, userId), eq(payCadences.active, true)),
    );

    for (const c of cadences) {
      const intervalMap: Record<string, number> = { weekly: 7, fortnightly: 14, monthly: 30 };
      const interval = intervalMap[c.cadence] ?? 30;
      let date = c.nextPayDate as string;
      while (date <= horizonEnd) {
        if (!skipKey.has(`${c.id}::${date}`)) {
          rows.push({
            userId,
            accountId: c.accountId,
            source: 'pay_cadence',
            sourceId: c.id,
            expectedDate: date,
            expectedAmountCents: c.expectedNetCents,
            expectedAmountLowCents: c.expectedNetCents,
            expectedAmountHighCents: c.expectedNetCents,
            description: c.employer,
            status: 'pending',
            matchedTransactionId: null,
            snoozedUntil: null,
            confidence: '1.000',
            generatedAt: new Date(),
            userNote: null,
          });
        }
        date = addDaysISO(date, interval);
      }
    }

    if (rows.length > 0) {
      await tx.insert(expectedEvents).values(rows);
    }
    return { inserted: rows.length, deleted: deleted.length };
  });
}
