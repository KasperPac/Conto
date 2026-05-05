import { describe, it, expect, beforeEach } from 'vitest';
import { testDb as db } from '@/tests/helpers/db';
import { expectedEvents, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resetTestDb, seedUserAndAccount } from '@/tests/helpers/db';
import { getLiquidityPreview } from '@/lib/db/queries/liquidity-preview';

function addDaysFromToday(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('getLiquidityPreview', () => {
  beforeEach(async () => { await resetTestDb(); });

  it('returns 31 points for 30d horizon and flags dips below buffer', async () => {
    const { userId, accountId } = await seedUserAndAccount({ openingBalanceCents: 100000n });
    // Set buffer to 50000 cents
    await db.update(users).set({ cashflowBufferCents: 50000n }).where(eq(users.id, userId));
    // Insert an expected event that will drain balance below buffer
    await db.insert(expectedEvents).values({
      userId, accountId, source: 'recurrence_group', sourceId: null,
      expectedDate: addDaysFromToday(2),
      expectedAmountCents: -60000n, expectedAmountLowCents: -60000n, expectedAmountHighCents: -60000n,
      description: 'BIG BILL', status: 'pending', matchedTransactionId: null,
      snoozedUntil: null, confidence: '0.95', generatedAt: new Date(), userNote: null,
    });

    const preview = await getLiquidityPreview(userId, 30);
    expect(preview.points).toHaveLength(31);
    expect(preview.dipsBelowBuffer.length).toBeGreaterThanOrEqual(1);
    expect(preview.dipsBelowBuffer[0].date).toBe(addDaysFromToday(2));
  });
});
