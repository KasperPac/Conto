import { describe, it, expect, beforeEach } from 'vitest';
import { testDb as db } from '@/tests/helpers/db';
import { transactions, expectedEvents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resetTestDb, seedUserAndAccount } from '@/tests/helpers/db';
import { matchExpectedEventsForTransaction } from '@/lib/jobs/match-expected-events';

describe('matchExpectedEventsForTransaction', () => {
  beforeEach(async () => { await resetTestDb(); });

  it('matches the closest pending event by date', async () => {
    const { userId, accountId } = await seedUserAndAccount();
    const [farther] = await db.insert(expectedEvents).values({
      userId, accountId, source: 'recurrence_group', sourceId: null,
      expectedDate: '2026-05-10', expectedAmountCents: -1599n,
      expectedAmountLowCents: -1700n, expectedAmountHighCents: -1500n,
      description: 'NETFLIX', status: 'pending', matchedTransactionId: null,
      snoozedUntil: null, confidence: '0.95', generatedAt: new Date(), userNote: null,
    }).returning();
    const [closer] = await db.insert(expectedEvents).values({
      userId, accountId, source: 'recurrence_group', sourceId: null,
      expectedDate: '2026-05-12', expectedAmountCents: -1599n,
      expectedAmountLowCents: -1700n, expectedAmountHighCents: -1500n,
      description: 'NETFLIX', status: 'pending', matchedTransactionId: null,
      snoozedUntil: null, confidence: '0.95', generatedAt: new Date(), userNote: null,
    }).returning();

    const [tx] = await db.insert(transactions).values({
      userId, accountId, statementId: null,
      postedDate: '2026-05-13', descriptionRaw: 'NETFLIX', descriptionClean: 'NETFLIX',
      amountCents: -1599n, balanceAfterCents: null, categoryId: null, subcategoryId: null,
      merchantId: null, classificationSource: 'unclassified', classificationRuleId: null,
      isExcludedFromSpending: false, notes: null, createdAt: new Date(),
    }).returning();

    const result = await matchExpectedEventsForTransaction(tx.id);
    expect(result.matchedEventId).toBe(closer.id);
    const [updated] = await db.select().from(expectedEvents).where(eq(expectedEvents.id, closer.id));
    expect(updated.status).toBe('matched');
    expect(updated.matchedTransactionId).toBe(tx.id);
  });

  it('returns null when nothing matches', async () => {
    const { userId, accountId } = await seedUserAndAccount();
    const [tx] = await db.insert(transactions).values({
      userId, accountId, statementId: null,
      postedDate: '2026-05-13', descriptionRaw: 'COFFEE', descriptionClean: 'COFFEE',
      amountCents: -550n, balanceAfterCents: null, categoryId: null, subcategoryId: null,
      merchantId: null, classificationSource: 'unclassified', classificationRuleId: null,
      isExcludedFromSpending: false, notes: null, createdAt: new Date(),
    }).returning();
    const result = await matchExpectedEventsForTransaction(tx.id);
    expect(result.matchedEventId).toBeNull();
  });

  it('matches a snoozed event when the charge actually lands', async () => {
    const { userId, accountId } = await seedUserAndAccount();
    const [snoozed] = await db.insert(expectedEvents).values({
      userId, accountId, source: 'recurrence_group', sourceId: null,
      expectedDate: '2026-05-12', expectedAmountCents: -1599n,
      expectedAmountLowCents: -1700n, expectedAmountHighCents: -1500n,
      description: 'NETFLIX', status: 'snoozed', matchedTransactionId: null,
      snoozedUntil: '2030-01-01', confidence: '0.95', generatedAt: new Date(), userNote: null,
    }).returning();
    const [tx] = await db.insert(transactions).values({
      userId, accountId, statementId: null,
      postedDate: '2026-05-12', descriptionRaw: 'NETFLIX', descriptionClean: 'NETFLIX',
      amountCents: -1599n, balanceAfterCents: null, categoryId: null, subcategoryId: null,
      merchantId: null, classificationSource: 'unclassified', classificationRuleId: null,
      isExcludedFromSpending: false, notes: null, createdAt: new Date(),
    }).returning();
    const result = await matchExpectedEventsForTransaction(tx.id);
    expect(result.matchedEventId).toBe(snoozed.id);
  });
});
