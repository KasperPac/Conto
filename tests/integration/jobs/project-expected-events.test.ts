import { describe, it, expect, beforeEach } from 'vitest';
import { testDb as db } from '@/tests/helpers/db';
import { recurrenceGroups, expectedEvents } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { resetTestDb, seedUserAndAccount } from '@/tests/helpers/db';
import { projectExpectedEvents } from '@/lib/jobs/project-expected-events';

describe('projectExpectedEvents', () => {
  beforeEach(async () => { await resetTestDb(); });

  it('materialises monthly outflows and is idempotent; preserves manual + snoozed', async () => {
    const { userId, accountId } = await seedUserAndAccount();
    await db.insert(recurrenceGroups).values({
      userId, merchantId: null, descriptionPattern: 'NETFLIX',
      cadence: 'monthly', medianAmountCents: -1599n, amountStddevCents: 0n,
      medianIntervalDays: 30, lastSeenDate: '2026-04-15',
      nextExpectedDate: '2026-05-15', status: 'active',
      confidence: '0.950', source: 'auto',
    });

    // A manual row that should survive
    await db.insert(expectedEvents).values({
      userId, accountId, source: 'manual', sourceId: null,
      expectedDate: '2026-05-12', expectedAmountCents: -50000n,
      expectedAmountLowCents: -50000n, expectedAmountHighCents: -50000n,
      description: 'Fridge', status: 'pending', matchedTransactionId: null,
      snoozedUntil: null, confidence: '1.000', generatedAt: new Date(), userNote: null,
    });

    const r1 = await projectExpectedEvents(userId, 90);
    expect(r1.inserted).toBeGreaterThanOrEqual(2);

    // Snooze one of the materialised rows
    await db.update(expectedEvents)
      .set({ status: 'snoozed', snoozedUntil: '2030-01-01' })
      .where(and(eq(expectedEvents.userId, userId), eq(expectedEvents.source, 'recurrence_group')));

    const beforeCount = await db.select({ c: sql<number>`count(*)::int` }).from(expectedEvents).where(eq(expectedEvents.userId, userId));
    await projectExpectedEvents(userId, 90);
    const afterCount = await db.select({ c: sql<number>`count(*)::int` }).from(expectedEvents).where(eq(expectedEvents.userId, userId));
    expect(afterCount[0].c).toBe(beforeCount[0].c);

    // Manual row still there
    const manual = await db.select().from(expectedEvents).where(and(eq(expectedEvents.userId, userId), eq(expectedEvents.source, 'manual')));
    expect(manual).toHaveLength(1);

    // Snoozed row still there
    const snoozed = await db.select().from(expectedEvents).where(and(eq(expectedEvents.userId, userId), eq(expectedEvents.status, 'snoozed')));
    expect(snoozed.length).toBeGreaterThanOrEqual(1);
  });

  it('does not project from cancelled groups', async () => {
    const { userId } = await seedUserAndAccount();
    await db.insert(recurrenceGroups).values({
      userId, merchantId: null, descriptionPattern: 'OLDSUB',
      cadence: 'monthly', medianAmountCents: -999n, amountStddevCents: 0n,
      medianIntervalDays: 30, lastSeenDate: '2026-03-15',
      nextExpectedDate: '2026-05-15', status: 'cancelled',
      confidence: '0.95', source: 'auto',
    });
    const r = await projectExpectedEvents(userId, 90);
    expect(r.inserted).toBe(0);
  });
});
