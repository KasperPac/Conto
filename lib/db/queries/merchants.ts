import { eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { merchants } from '@/lib/db/schema';
import type { LoadedMerchant } from '@/lib/domain/classification';

export async function getUserMerchants(userId: string): Promise<LoadedMerchant[]> {
  const rows = await db
    .select({
      id: merchants.id,
      canonicalName: merchants.canonicalName,
      defaultCategoryId: merchants.defaultCategoryId,
      patterns: merchants.patterns,
      isSubscription: merchants.isSubscription,
    })
    .from(merchants)
    .where(or(isNull(merchants.userId), eq(merchants.userId, userId)))
    .orderBy(merchants.canonicalName);

  return rows.map(r => ({
    ...r,
    patterns: r.patterns as string[] | null,
  }));
}

export async function setMerchantIsSubscription(
  merchantId: string,
  isSubscription: boolean,
): Promise<void> {
  await db
    .update(merchants)
    .set({ isSubscription })
    .where(eq(merchants.id, merchantId));
}
