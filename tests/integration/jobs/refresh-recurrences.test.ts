import { describe, it, expect, beforeEach } from 'vitest';
import { testDb as db } from '@/tests/helpers/db';
import { transactions, recurrenceGroups } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resetTestDb, seedUserAndAccount } from '@/tests/helpers/db';
import { refreshRecurrencesForUser } from '@/lib/jobs/refresh-recurrences';

describe('refreshRecurrencesForUser', () => {
  beforeEach(async () => { await resetTestDb(); });

  it('upserts a monthly recurrence group from 3 monthly Netflix outflows, idempotent', async () => {
    const { userId, accountId } = await seedUserAndAccount();
    for (const date of ['2026-01-15', '2026-02-15', '2026-03-15']) {
      await db.insert(transactions).values({
        userId, accountId, statementId: null,
        postedDate: date, descriptionRaw: 'NETFLIX', descriptionClean: 'NETFLIX',
        amountCents: -1599n, balanceAfterCents: null,
        categoryId: null, subcategoryId: null, merchantId: null,
        classificationSource: 'unclassified', classificationRuleId: null,
        isExcludedFromSpending: false, notes: null, createdAt: new Date(),
      });
    }
    await refreshRecurrencesForUser(userId);
    const groups = await db.select().from(recurrenceGroups).where(eq(recurrenceGroups.userId, userId));
    expect(groups).toHaveLength(1);
    expect(groups[0].cadence).toBe('monthly');
    expect(groups[0].descriptionPattern).toBe('NETFLIX');

    // Idempotency
    await refreshRecurrencesForUser(userId);
    const groups2 = await db.select().from(recurrenceGroups).where(eq(recurrenceGroups.userId, userId));
    expect(groups2).toHaveLength(1);
  });
});
