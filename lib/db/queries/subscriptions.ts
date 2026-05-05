import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { merchants, recurrenceGroups } from '@/lib/db/schema';

export interface SubscriptionGroup {
  id: string;
  merchantId: string;
  merchantName: string;
  cadence: string;
  medianAmountCents: bigint;
  lastSeenDate: string;
  nextExpectedDate: string;
  status: string;
}

export interface UnlabelledCandidate {
  id: string;
  merchantId: string;
  descriptionPattern: string;
  cadence: string;
  medianAmountCents: bigint;
  lastSeenDate: string;
}

export async function getSubscriptionGroups(userId: string): Promise<SubscriptionGroup[]> {
  const rows = await db
    .select({
      id: recurrenceGroups.id,
      merchantId: recurrenceGroups.merchantId,
      merchantName: merchants.canonicalName,
      cadence: recurrenceGroups.cadence,
      medianAmountCents: recurrenceGroups.medianAmountCents,
      lastSeenDate: recurrenceGroups.lastSeenDate,
      nextExpectedDate: recurrenceGroups.nextExpectedDate,
      status: recurrenceGroups.status,
    })
    .from(recurrenceGroups)
    .innerJoin(
      merchants,
      and(
        eq(recurrenceGroups.merchantId, merchants.id),
        eq(merchants.isSubscription, true),
      ),
    )
    .where(
      and(
        eq(recurrenceGroups.userId, userId),
        ne(recurrenceGroups.status, 'cancelled'),
      ),
    )
    .orderBy(desc(recurrenceGroups.medianAmountCents));

  return rows as unknown as SubscriptionGroup[];
}

export async function getUnlabelledCandidates(userId: string): Promise<UnlabelledCandidate[]> {
  const rows = await db
    .select({
      id: recurrenceGroups.id,
      merchantId: recurrenceGroups.merchantId,
      descriptionPattern: recurrenceGroups.descriptionPattern,
      cadence: recurrenceGroups.cadence,
      medianAmountCents: recurrenceGroups.medianAmountCents,
      lastSeenDate: recurrenceGroups.lastSeenDate,
    })
    .from(recurrenceGroups)
    .innerJoin(
      merchants,
      and(
        eq(recurrenceGroups.merchantId, merchants.id),
        eq(merchants.isSubscription, false),
      ),
    )
    .where(
      and(
        eq(recurrenceGroups.userId, userId),
        eq(recurrenceGroups.status, 'active'),
        inArray(recurrenceGroups.cadence, ['monthly', 'quarterly', 'annual']),
      ),
    )
    .orderBy(desc(recurrenceGroups.medianAmountCents));

  return rows as unknown as UnlabelledCandidate[];
}
