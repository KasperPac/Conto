import { db } from '@/lib/db/client';
import { transactions, recurrenceGroups, payCadences, accounts } from '@/lib/db/schema';
import { and, eq, gte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { detectRecurrence } from '@/lib/domain/recurrence';
import { detectPayCadence } from '@/lib/domain/pay-cadence';
import { boss, getBossRaw } from '@/lib/jobs/boss';

function isoOffsetMonths(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export async function refreshRecurrencesForUser(userId: string): Promise<void> {
  const lookback = isoOffsetMonths(-12);
  const txs = await db.select().from(transactions).where(
    and(eq(transactions.userId, userId), gte(transactions.postedDate, lookback)),
  );

  const outflows = txs.filter(t => t.amountCents < 0n);
  const inflows  = txs.filter(t => t.amountCents > 0n);

  const detected = detectRecurrence(
    outflows.map(t => ({
      id: t.id,
      postedDate: t.postedDate as string,
      amountCents: Number(t.amountCents),
      descriptionClean: t.descriptionClean ?? t.descriptionRaw,
      merchantId: t.merchantId,
    })),
    { minOccurrences: 3, maxStddevPct: 0.25 },
  );

  for (const g of detected) {
    // Use raw SQL for the coalesce-keyed upsert since Drizzle can't target expressions.
    await db.execute(sql`
      insert into recurrence_groups
        (user_id, merchant_id, description_pattern, cadence, median_amount_cents, amount_stddev_cents,
         median_interval_days, last_seen_date, next_expected_date, status, confidence, source)
      values
        (${userId}, ${g.merchantId ?? null}, ${g.descriptionPattern}, ${g.cadence},
         ${g.medianAmountCents.toString()}, ${g.amountStddevCents.toString()},
         ${g.medianIntervalDays}, ${g.lastSeenDate}, ${g.nextExpectedDate},
         'active', ${g.confidence.toFixed(3)}, 'auto')
      on conflict (user_id, coalesce(merchant_id::text, description_pattern))
      do update set
        cadence              = excluded.cadence,
        median_amount_cents  = excluded.median_amount_cents,
        amount_stddev_cents  = excluded.amount_stddev_cents,
        median_interval_days = excluded.median_interval_days,
        last_seen_date       = excluded.last_seen_date,
        next_expected_date   = excluded.next_expected_date,
        confidence           = excluded.confidence
    `);
  }

  // Pay cadences — don't override manual ones
  const accs = await db.select().from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)));

  for (const acc of accs) {
    const candidates = detectPayCadence(
      inflows
        .filter(t => t.accountId === acc.id)
        .map(t => ({
          id: t.id,
          accountId: t.accountId,
          postedDate: t.postedDate as string,
          amountCents: Number(t.amountCents),
          descriptionClean: t.descriptionClean ?? t.descriptionRaw,
        })),
      { minOccurrences: 3, maxAmountStddevPct: 0.1 },
    );
    for (const c of candidates) {
      // Only insert if no active manual cadence for this employer+account
      const [existing] = await db.select().from(payCadences).where(
        and(
          eq(payCadences.userId, userId),
          eq(payCadences.accountId, acc.id),
          eq(payCadences.employer, c.employer),
          eq(payCadences.active, true),
        ),
      ).limit(1);
      if (existing?.source === 'manual') continue;

      if (existing) {
        // Update detected cadence
        await db.update(payCadences)
          .set({ cadence: c.cadence, expectedNetCents: c.expectedNetCents, nextPayDate: c.nextPayDate })
          .where(eq(payCadences.id, existing.id));
      } else {
        await db.insert(payCadences).values({
          userId, accountId: acc.id, employer: c.employer, cadence: c.cadence,
          expectedNetCents: c.expectedNetCents, nextPayDate: c.nextPayDate,
          source: 'detected', active: true,
        });
      }
    }
  }

  // Enqueue projection (ensure queue exists first)
  const bossRaw = await getBossRaw();
  await bossRaw.createQueue('project-expected-events').catch(() => {});
  await boss.send('project-expected-events', { userId });
}
