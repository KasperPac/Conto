'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { withUser } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';

async function getUserId(): Promise<string> {
  try {
    return await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function createCategory(data: {
  name: string;
  parentId?: string;
  isIncome: boolean;
  isEssential: boolean;
  isDiscretionary: boolean;
}): Promise<void> {
  const userId = await getUserId();
  await withUser(userId, async (tx) => {
    await tx.insert(categories).values({ ...data, userId });
  });
  revalidatePath('/categories');
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const userId = await getUserId();
  await withUser(userId, async (tx) => {
    const [inUse] = await tx.select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.categoryId, categoryId), eq(transactions.userId, userId)))
      .limit(1);
    if (inUse) throw new Error('Category in use — reassign transactions first');
    await tx.delete(categories).where(and(
      eq(categories.id, categoryId),
      eq(categories.userId, userId),
    ));
  });
  revalidatePath('/categories');
}
