'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { withUser } from '@/lib/db/client';
import { transactionLinks, transactions } from '@/lib/db/schema';

async function getUser(): Promise<string> {
  try { return await getCurrentUserId(); }
  catch (e) {
    if (e instanceof UnauthenticatedError) throw new Error('Unauthenticated');
    throw e;
  }
}

export async function confirmIncomeLink(linkId: string): Promise<void> {
  const userId = await getUser();
  await withUser(userId, async (tx) => {
    const [link] = await tx
      .update(transactionLinks)
      .set({ source: 'user' })
      .where(and(
        eq(transactionLinks.id, linkId),
        eq(transactionLinks.userId, userId),
        eq(transactionLinks.linkType, 'income'),
      ))
      .returning({ id: transactionLinks.id });
    if (!link) throw new Error('Link not found');
  });
  revalidatePath('/income/payslips');
}

export async function dismissIncomeLink(linkId: string): Promise<void> {
  const userId = await getUser();
  await withUser(userId, async (tx) => {
    const [updated] = await tx
      .update(transactionLinks)
      .set({ source: 'dismissed' })
      .where(and(
        eq(transactionLinks.id, linkId),
        eq(transactionLinks.userId, userId),
        eq(transactionLinks.linkType, 'income'),
      ))
      .returning({ id: transactionLinks.id });
    if (!updated) throw new Error('Link not found');
  });
  revalidatePath('/income/payslips');
}

export async function createManualIncomeLink(payslipId: string, depositTxId: string): Promise<void> {
  const userId = await getUser();
  await withUser(userId, async (tx) => {
    // Verify deposit transaction belongs to user
    const [owned] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.id, depositTxId), eq(transactions.userId, userId)));
    if (!owned) throw new Error('Transaction not found');

    // Remove any existing income link for this payslip first
    await tx.delete(transactionLinks)
      .where(and(
        eq(transactionLinks.userId, userId),
        eq(transactionLinks.payslipId, payslipId),
        eq(transactionLinks.linkType, 'income'),
      ));
    await tx.insert(transactionLinks).values({
      userId,
      linkType: 'income',
      fromTransactionId: depositTxId,
      toTransactionId: null,
      payslipId,
      confidence: '1.000',
      source: 'user',
    });
  });
  revalidatePath('/income/payslips');
}
