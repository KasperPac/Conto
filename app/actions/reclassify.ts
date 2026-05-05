'use server';
import { revalidatePath } from 'next/cache';
import { and, eq, ilike } from 'drizzle-orm';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { withUser } from '@/lib/db/client';
import { transactions, rules } from '@/lib/db/schema';

export async function reclassifyTransaction(
  transactionId: string,
  categoryId: string,
  applyToAll: boolean,
): Promise<void> {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }

  await withUser(userId, async (tx) => {
    const [updated] = await tx.update(transactions)
      .set({ categoryId, classificationSource: 'manual' })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
      .returning({ descriptionRaw: transactions.descriptionRaw });

    if (!updated) return;

    if (applyToAll) {
      await tx.insert(rules).values({
        userId,
        pattern: updated.descriptionRaw,
        matchField: 'description_raw',
        categoryId,
        priority: 0,
        source: 'manual',
        createdFromTransactionId: transactionId,
        active: true,
      });

      await tx.update(transactions)
        .set({ categoryId, classificationSource: 'manual' })
        .where(and(
          eq(transactions.userId, userId),
          ilike(transactions.descriptionRaw, `%${updated.descriptionRaw}%`),
        ));
    }
  });

  revalidatePath('/accounts', 'layout');
}
