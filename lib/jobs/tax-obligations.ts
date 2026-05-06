import type { PgBoss } from 'pg-boss';
import { db, withUser } from '@/lib/db/client';
import { users, expectedEvents } from '@/lib/db/schema';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';

interface TaxEvent {
  date: string; // 'YYYY-MM-DD'
  description: string;
}

// Generate all ATO tax due dates that fall within [windowStart, windowEnd]
function generateTaxDates(windowStart: Date, windowEnd: Date): TaxEvent[] {
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
  const startYear = windowStart.getFullYear();

  // Check 3 years to cover an 18-month window
  for (let yearOffset = 0; yearOffset <= 2; yearOffset++) {
    const year = startYear + yearOffset;
    for (const t of templates) {
      // For Feb: use last day of month to handle leap years
      const lastDay =
        t.month === 2 ? new Date(Date.UTC(year, 2, 0)).getUTCDate() : t.day;
      const date = new Date(Date.UTC(year, t.month - 1, lastDay));
      if (date >= windowStart && date <= windowEnd) {
        events.push({
          date: date.toISOString().slice(0, 10),
          description: t.description,
        });
      }
    }
  }

  return events;
}

async function materialiseForUser(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  const windowStartStr = windowStart.toISOString().slice(0, 10);
  const events = generateTaxDates(windowStart, windowEnd);

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

    if (events.length === 0) return;

    await tx.insert(expectedEvents).values(
      events.map((e) => ({
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
      const today = new Date();
      const windowEnd = new Date(today);
      windowEnd.setMonth(windowEnd.getMonth() + 18);

      for (const job of jobs) {
        const { userId } = job.data;
        try {
          await materialiseForUser(userId, today, windowEnd);
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
