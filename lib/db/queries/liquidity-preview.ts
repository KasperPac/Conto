import { db } from '@/lib/db/client';
import { expectedEvents, users, accounts, transactions } from '@/lib/db/schema';
import { and, eq, gte, lte, inArray, sql } from 'drizzle-orm';
import { projectRunway } from '@/lib/domain/runway';
import type { LiquidityPreview, ExpectedEvent } from '@/lib/types/cashflow';

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function getLiquidityPreview(
  userId: string,
  horizonDays: 30 | 60 | 90,
): Promise<LiquidityPreview> {
  const today = new Date().toISOString().slice(0, 10);
  const horizonEnd = addDays(today, horizonDays);

  // Load user's buffer setting
  const [u] = await db.select({ buffer: users.cashflowBufferCents }).from(users).where(eq(users.id, userId)).limit(1);
  const buffer = u?.buffer ?? 0n;

  // Compute current balance: sum openingBalance + all non-excluded transactions per active account
  const accs = await db.select({
    id: accounts.id,
    openingBalanceCents: accounts.openingBalanceCents,
    txSum: sql<string>`COALESCE(SUM(${transactions.amountCents}), '0')`,
  })
  .from(accounts)
  .leftJoin(transactions, and(
    eq(transactions.accountId, accounts.id),
    eq(transactions.isExcludedFromSpending, false),
  ))
  .where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)))
  .groupBy(accounts.id);

  let startBalance = 0n;
  for (const a of accs) {
    startBalance += a.openingBalanceCents + BigInt(a.txSum);
  }

  // Load pending + snoozed events within the horizon
  const rows = await db.select().from(expectedEvents).where(and(
    eq(expectedEvents.userId, userId),
    gte(expectedEvents.expectedDate, today),
    lte(expectedEvents.expectedDate, horizonEnd),
    inArray(expectedEvents.status, ['pending', 'snoozed']),
  ));

  // Map to ExpectedEvent, treating snoozed-still-future as excluded from projection
  const effective: ExpectedEvent[] = rows
    .filter(r => !(r.status === 'snoozed' && r.snoozedUntil && r.snoozedUntil > today))
    .map(r => ({
      id: r.id as any,
      userId: r.userId,
      accountId: r.accountId,
      source: r.source as any,
      sourceId: r.sourceId,
      expectedDate: r.expectedDate as any,
      expectedAmountCents: r.expectedAmountCents as any,
      expectedAmountLowCents: r.expectedAmountLowCents as any,
      expectedAmountHighCents: r.expectedAmountHighCents as any,
      description: r.description,
      status: r.status as any,
      matchedTransactionId: r.matchedTransactionId,
      snoozedUntil: r.snoozedUntil as any,
      confidence: Number(r.confidence),
      generatedAt: r.generatedAt ?? new Date(),
      userNote: r.userNote,
    }));

  const points = projectRunway(startBalance as any, effective, horizonDays, today);

  const dipsBelowBuffer: LiquidityPreview['dipsBelowBuffer'] = [];
  for (const p of points) {
    const low = BigInt(p.lowCents as any);
    if (low < buffer) {
      dipsBelowBuffer.push({
        date: p.date as any,
        shortfallCents: (buffer - low) as any,
      });
    }
  }

  return {
    asOf: today as any,
    startBalanceCents: startBalance as any,
    bufferCents: buffer as any,
    horizonDays,
    points,
    dipsBelowBuffer,
  };
}
