import { db } from '@/lib/db/client';
import { transactions, expectedEvents } from '@/lib/db/schema';
import { and, eq, inArray, gte, lte } from 'drizzle-orm';

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function matchExpectedEventsForTransaction(
  transactionId: string,
): Promise<{ matchedEventId: string | null }> {
  return await db.transaction(async (tx) => {
    const [t] = await tx.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!t) return { matchedEventId: null };

    const lowerDate = addDays(t.postedDate as string, -3);
    const upperDate = addDays(t.postedDate as string, 3);

    const candidates = await tx.select().from(expectedEvents).where(and(
      eq(expectedEvents.userId, t.userId),
      eq(expectedEvents.accountId, t.accountId),
      inArray(expectedEvents.status, ['pending', 'snoozed']),
      gte(expectedEvents.expectedDate, lowerDate),
      lte(expectedEvents.expectedDate, upperDate),
    ));

    // Filter: same sign + amount in band
    const txAmt = t.amountCents;
    const usable = candidates.filter(c => {
      const evAmt = c.expectedAmountCents;
      // Same sign check
      if (txAmt < 0n !== evAmt < 0n) return false;
      // Amount band: tx amount within [low, high] (all negative or all positive)
      const txAbs = txAmt < 0n ? -txAmt : txAmt;
      const lo = c.expectedAmountLowCents < 0n ? -c.expectedAmountLowCents : c.expectedAmountLowCents;
      const hi = c.expectedAmountHighCents < 0n ? -c.expectedAmountHighCents : c.expectedAmountHighCents;
      const minBand = lo < hi ? lo : hi;
      const maxBand = lo > hi ? lo : hi;
      return txAbs >= minBand && txAbs <= maxBand;
    });

    if (usable.length === 0) return { matchedEventId: null };

    const tDate = new Date((t.postedDate as string) + 'T00:00:00Z').getTime();
    usable.sort((a, b) => {
      const ad = Math.abs(new Date(a.expectedDate + 'T00:00:00Z').getTime() - tDate);
      const bd = Math.abs(new Date(b.expectedDate + 'T00:00:00Z').getTime() - tDate);
      if (ad !== bd) return ad - bd;
      const aAmtDelta = a.expectedAmountCents - t.amountCents;
      const bAmtDelta = b.expectedAmountCents - t.amountCents;
      const aAbs = aAmtDelta < 0n ? Number(-aAmtDelta) : Number(aAmtDelta);
      const bAbs = bAmtDelta < 0n ? Number(-bAmtDelta) : Number(bAmtDelta);
      if (aAbs !== bAbs) return aAbs - bAbs;
      return a.id < b.id ? -1 : 1;
    });

    const winner = usable[0];
    await tx.update(expectedEvents)
      .set({ status: 'matched', matchedTransactionId: t.id })
      .where(eq(expectedEvents.id, winner.id));

    return { matchedEventId: winner.id };
  });
}
