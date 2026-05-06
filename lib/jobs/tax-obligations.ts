import type { PgBoss } from 'pg-boss';
import { db, withUser } from '@/lib/db/client';
import { users, expectedEvents } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

interface TaxEvent {
  date: string; // 'YYYY-MM-DD'
  description: string;
}

// Generate all ATO tax due dates that fall within [windowStartStr, windowEndStr]
function generateTaxDates(windowStartStr: string, windowEndStr: string): TaxEvent[] {
  // Annual dates: { month: 1-based, day }
  const templates = [
    { month: 10, day: 28, description: 'Q1 BAS due' },
    { month: 2, day: 28, description: 'Q2 BAS due' },
    { month: 4, day: 28, description: 'Q3 BAS due' },
    { month: 7, day: 28, description: 'Q4 BAS due' },
    { month: 6, day: 30, description: 'End of financial year' },
    { month: 10, day: 31, description: 'Tax return due' },
  ];

  const events: TaxEvent[] = [];
  const startYear = parseInt(windowStartStr.slice(0, 4), 10);

  // Check 3 years to cover an 18-month window
  for (let yearOffset = 0; yearOffset <= 2; yearOffset++) {
    const year = startYear + yearOffset;
    for (const t of templates) {
      const date = new Date(Date.UTC(year, t.month - 1, t.day));
      const dateStr = date.toISOString().slice(0, 10);
      // Compare dates as strings (ISO format sorts correctly)
      if (dateStr >= windowStartStr && dateStr <= windowEndStr) {
        events.push({ date: dateStr, description: t.description });
      }
    }
  }

  return events;
}

async function materialiseForUser(
  userId: string,
  windowStartStr: string,
  windowEndStr: string,
): Promise<void> {
  const events = generateTaxDates(windowStartStr, windowEndStr);

  await withUser(userId, async (tx) => {
    // Delete only pending future tax events — snoozed/dismissed survive
    await tx
      .delete(expectedEvents)
      .where(
        and(
          eq(expectedEvents.userId, userId),
          eq(expectedEvents.source, 'tax_obligation'),
          inArray(expectedEvents.status, ['pending']),
          sql`${expectedEvents.expectedDate}::date >= ${windowStartStr}::date`,
        ),
      );

    // Don't create a new pending row for dates that already have a non-pending row
    const existingNonPending = await tx
      .select({ expectedDate: expectedEvents.expectedDate })
      .from(expectedEvents)
      .where(
        and(
          eq(expectedEvents.userId, userId),
          eq(expectedEvents.source, 'tax_obligation'),
          sql`${expectedEvents.status}::text != 'pending'`,
          sql`${expectedEvents.expectedDate}::date >= ${windowStartStr}::date`,
        ),
      );
    const skipDates = new Set(existingNonPending.map(r => r.expectedDate as string));
    const toInsert = events.filter(e => !skipDates.has(e.date));
    if (toInsert.length === 0) return;

    await tx.insert(expectedEvents).values(
      toInsert.map((e) => ({
        userId,
        accountId: null,
        source: 'tax_obligation' as const,
        sourceId: null,
        expectedDate: e.date,
        expectedAmountCents: BigInt(0),
        expectedAmountLowCents: BigInt(0),
        expectedAmountHighCents: BigInt(0),
        description: e.description,
        status: 'pending' as const,
        confidence: '1.000',
        snoozedUntil: null,
        matchedTransactionId: null,
        userNote: null,
      })),
    );
  });
}

export async function registerTaxObligations(boss: PgBoss): Promise<void> {
  // Per-user worker
  await boss.createQueue('materialise-tax-obligations').catch(() => {});
  await boss.work<{ userId: string }>(
    'materialise-tax-obligations',
    { batchSize: 4, localConcurrency: 1 },
    async (jobs) => {
      const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC
      const windowEndDate = new Date(todayStr);
      windowEndDate.setUTCMonth(windowEndDate.getUTCMonth() + 18);
      const windowEndStr = windowEndDate.toISOString().slice(0, 10);

      for (const job of jobs) {
        const { userId } = job.data;
        try {
          await materialiseForUser(userId, todayStr, windowEndStr);
        } catch (err) {
          console.error(
            `[tax-obligations] jobId=${job.id} userId=${userId}`,
            err,
          );
          throw err;
        }
      }
    },
  );

  // Fanout: send one job per user
  await boss.createQueue('materialise-tax-obligations-fanout').catch(() => {});
  await boss.work('materialise-tax-obligations-fanout', async () => {
    const allUsers = await db.select({ id: users.id }).from(users);
    for (const { id } of allUsers) {
      await boss.send('materialise-tax-obligations', { userId: id });
    }
  });

  // Schedule nightly at 02:00 Sydney time
  await boss
    .schedule(
      'materialise-tax-obligations-fanout',
      '0 2 * * *',
      {},
      { tz: 'Australia/Sydney' },
    )
    .catch(() => {});
}
