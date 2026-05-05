import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { getSubscriptionGroups, getUnlabelledCandidates } from '@/lib/db/queries/subscriptions';
import { seedAuMerchants } from '@/lib/db/seeds/au-merchants';
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db';
import { merchants, recurrenceGroups } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('subscription queries', () => {
  let userId: string;
  let netflixMerchantId: string;
  let woolsMerchantId: string;

  beforeEach(async () => {
    await resetTestDb();
    await seedAuMerchants(testDb as any);
    ({ userId } = await seedUserAndAccount());

    const [netflix] = await testDb.select({ id: merchants.id })
      .from(merchants).where(eq(merchants.canonicalName, 'Netflix'));
    const [wools] = await testDb.select({ id: merchants.id })
      .from(merchants).where(eq(merchants.canonicalName, 'Woolworths'));
    netflixMerchantId = netflix!.id;
    woolsMerchantId = wools!.id;
  });

  it('getSubscriptionGroups returns groups with isSubscription merchant', async () => {
    await testDb.insert(recurrenceGroups).values({
      userId,
      merchantId: netflixMerchantId,
      descriptionPattern: 'NETFLIX',
      cadence: 'monthly',
      medianAmountCents: BigInt(2299),
      amountStddevCents: BigInt(0),
      medianIntervalDays: 30,
      lastSeenDate: '2026-04-01',
      nextExpectedDate: '2026-05-01',
      status: 'active',
      confidence: '0.950',
      source: 'auto',
    });

    const groups = await getSubscriptionGroups(userId);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.merchantName).toBe('Netflix');
    expect(groups[0]!.medianAmountCents).toBe(BigInt(2299));
  });

  it('getSubscriptionGroups excludes cancelled groups', async () => {
    await testDb.insert(recurrenceGroups).values({
      userId,
      merchantId: netflixMerchantId,
      descriptionPattern: 'NETFLIX',
      cadence: 'monthly',
      medianAmountCents: BigInt(2299),
      amountStddevCents: BigInt(0),
      medianIntervalDays: 30,
      lastSeenDate: '2026-04-01',
      nextExpectedDate: '2026-05-01',
      status: 'cancelled',
      confidence: '0.950',
      source: 'auto',
    });

    const groups = await getSubscriptionGroups(userId);
    expect(groups).toHaveLength(0);
  });

  it('getUnlabelledCandidates returns monthly non-subscription merchant groups', async () => {
    await testDb.insert(recurrenceGroups).values({
      userId,
      merchantId: woolsMerchantId,
      descriptionPattern: 'WOOLWORTHS',
      cadence: 'monthly',
      medianAmountCents: BigInt(45000),
      amountStddevCents: BigInt(5000),
      medianIntervalDays: 30,
      lastSeenDate: '2026-04-01',
      nextExpectedDate: '2026-05-01',
      status: 'active',
      confidence: '0.800',
      source: 'auto',
    });

    const candidates = await getUnlabelledCandidates(userId);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]!.descriptionPattern).toBe('WOOLWORTHS');
  });

  it('getUnlabelledCandidates excludes weekly groups', async () => {
    await testDb.insert(recurrenceGroups).values({
      userId,
      merchantId: woolsMerchantId,
      descriptionPattern: 'WOOLWORTHS',
      cadence: 'weekly',
      medianAmountCents: BigInt(10000),
      amountStddevCents: BigInt(2000),
      medianIntervalDays: 7,
      lastSeenDate: '2026-04-28',
      nextExpectedDate: '2026-05-05',
      status: 'active',
      confidence: '0.800',
      source: 'auto',
    });

    const candidates = await getUnlabelledCandidates(userId);
    expect(candidates.find(c => c.cadence === 'weekly')).toBeUndefined();
  });
});
