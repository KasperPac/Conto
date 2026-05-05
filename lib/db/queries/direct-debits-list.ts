import { db } from '@/lib/db/client';
import { recurrenceGroups, merchants } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import type { DirectDebit } from '@/lib/types/cashflow';
import { classifyAsDirectDebit } from '@/lib/domain/direct-debits';

export async function getDirectDebitRegister(
  userId: string,
  options?: { activeOnly?: boolean; recentlyChanged?: boolean },
): Promise<DirectDebit[]> {
  const conditions = [eq(recurrenceGroups.userId, userId)];
  if (options?.activeOnly) conditions.push(eq(recurrenceGroups.status, 'active'));

  const rows = await db.select({
    g: recurrenceGroups,
    m: merchants,
  })
  .from(recurrenceGroups)
  .leftJoin(merchants, eq(recurrenceGroups.merchantId, merchants.id))
  .where(and(...conditions));

  const out: DirectDebit[] = [];
  for (const { g, m } of rows) {
    const kind = classifyAsDirectDebit({ descriptionPattern: g.descriptionPattern });
    if (!kind) continue;

    if (options?.recentlyChanged) {
      const mean = Math.abs(Number(g.medianAmountCents));
      const sd = Number(g.amountStddevCents);
      if (mean === 0 || sd / mean <= 0.05) continue;
    }

    const lo = g.medianAmountCents - g.amountStddevCents;
    const hi = g.medianAmountCents + g.amountStddevCents;

    out.push({
      groupId: g.id as any,
      merchantName: m?.canonicalName ?? g.descriptionPattern,
      kind,
      cadence: g.cadence as any,
      observedAmountLowCents: lo as any,
      observedAmountHighCents: hi as any,
      lastSeenDate: g.lastSeenDate as any,
      nextExpectedDate: g.nextExpectedDate as any,
      status: g.status as any,
    });
  }
  return out;
}
