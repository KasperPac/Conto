import { describe, it, expect, beforeEach } from 'vitest';
import { testDb as db } from '@/tests/helpers/db';
import { expectedEvents } from '@/lib/db/schema';
import { resetTestDb, seedUserAndAccount } from '@/tests/helpers/db';
import { getBillsCalendar } from '@/lib/db/queries/bills-calendar';

describe('getBillsCalendar', () => {
  beforeEach(async () => { await resetTestDb(); });

  it('returns days within range with effective status, excludes dismissed', async () => {
    const { userId, accountId } = await seedUserAndAccount();
    await db.insert(expectedEvents).values([
      {
        userId, accountId, source: 'recurrence_group', sourceId: null,
        expectedDate: '2026-05-12', expectedAmountCents: -1599n,
        expectedAmountLowCents: -1599n, expectedAmountHighCents: -1599n,
        description: 'NETFLIX', status: 'pending', matchedTransactionId: null,
        snoozedUntil: null, confidence: '0.95', generatedAt: new Date(), userNote: null,
      },
      {
        userId, accountId, source: 'recurrence_group', sourceId: null,
        expectedDate: '2026-05-12', expectedAmountCents: -2000n,
        expectedAmountLowCents: -2000n, expectedAmountHighCents: -2000n,
        description: 'GYM', status: 'snoozed', matchedTransactionId: null,
        snoozedUntil: '2030-01-01', confidence: '0.85', generatedAt: new Date(), userNote: null,
      },
      {
        userId, accountId, source: 'recurrence_group', sourceId: null,
        expectedDate: '2026-05-12', expectedAmountCents: -100n,
        expectedAmountLowCents: -100n, expectedAmountHighCents: -100n,
        description: 'OLDDISMISSED', status: 'dismissed', matchedTransactionId: null,
        snoozedUntil: null, confidence: '0.5', generatedAt: new Date(), userNote: null,
      },
    ]);

    const days = await getBillsCalendar(userId, '2026-05-01', '2026-05-31');
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-05-12');
    const descs = days[0].events.map(e => e.description);
    expect(descs).toContain('NETFLIX');
    expect(descs).toContain('GYM');
    expect(descs).not.toContain('OLDDISMISSED');
    const gym = days[0].events.find(e => e.description === 'GYM');
    expect(gym?.effectiveStatus).toBe('snoozed');
    const netflix = days[0].events.find(e => e.description === 'NETFLIX');
    expect(netflix?.effectiveStatus).toBe('pending');
  });
});
