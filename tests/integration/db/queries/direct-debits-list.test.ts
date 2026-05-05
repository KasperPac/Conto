import { describe, it, expect, beforeEach } from 'vitest';
import { testDb as db } from '@/tests/helpers/db';
import { recurrenceGroups, merchants } from '@/lib/db/schema';
import { resetTestDb, seedUserAndAccount } from '@/tests/helpers/db';
import { getDirectDebitRegister } from '@/lib/db/queries/direct-debits-list';

describe('getDirectDebitRegister', () => {
  beforeEach(async () => { await resetTestDb(); });

  it('returns active DD groups with merchant name', async () => {
    const { userId } = await seedUserAndAccount();
    const [m] = await db.insert(merchants).values({
      canonicalName: 'EnergyAustralia',
      defaultCategoryId: null,
      patterns: { contains: ['ENERGYAUSTRALIA'] },
    }).returning();
    await db.insert(recurrenceGroups).values({
      userId, merchantId: m.id, descriptionPattern: 'DD ENERGYAUSTRALIA',
      cadence: 'monthly', medianAmountCents: -12000n, amountStddevCents: 200n,
      medianIntervalDays: 30, lastSeenDate: '2026-04-15',
      nextExpectedDate: '2026-05-15', status: 'active',
      confidence: '0.95', source: 'auto',
    });
    const rows = await getDirectDebitRegister(userId, { activeOnly: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('dd_mandate');
    expect(rows[0].merchantName).toBe('EnergyAustralia');
    expect(rows[0].cadence).toBe('monthly');
  });

  it('excludes non-DD groups (transfers)', async () => {
    const { userId } = await seedUserAndAccount();
    await db.insert(recurrenceGroups).values({
      userId, merchantId: null, descriptionPattern: 'TFR TO SAVINGS',
      cadence: 'fortnightly', medianAmountCents: -50000n, amountStddevCents: 0n,
      medianIntervalDays: 14, lastSeenDate: '2026-04-20',
      nextExpectedDate: '2026-05-04', status: 'active',
      confidence: '0.95', source: 'auto',
    });
    const rows = await getDirectDebitRegister(userId, { activeOnly: true });
    expect(rows).toHaveLength(0);
  });
});
