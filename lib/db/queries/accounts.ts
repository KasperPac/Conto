import { and, eq, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { accounts, transactions } from '@/lib/db/schema';

export async function findOrCreateAccount(userId: string, data: {
  institution: string;
  accountNumberFragment: string;
  accountType: 'checking' | 'savings' | 'credit_card';
  periodStart: string;
}): Promise<string> {
  return withUser(userId, async (tx) => {
    const existing = await tx.select({ id: accounts.id })
      .from(accounts)
      .where(and(
        eq(accounts.userId, userId),
        eq(accounts.institution, data.institution),
        sql`${accounts.name} LIKE ${'%••' + data.accountNumberFragment}`,
      ))
      .limit(1);

    const first = existing[0];
    if (first) return first.id;

    const typeLabel = data.accountType === 'checking'    ? 'Everyday'
                    : data.accountType === 'savings'     ? 'Savings'
                    : 'Credit Card';
    const name = `${data.institution} ${typeLabel} ••${data.accountNumberFragment}`;

    const inserted = await tx.insert(accounts).values({
      userId,
      name,
      institution: data.institution,
      type: data.accountType,
      currency: 'AUD',
      openingBalanceCents: BigInt(0),
      openingBalanceDate: data.periodStart,
    }).returning({ id: accounts.id });

    if (!inserted[0]) throw new Error('Insert returned no rows');
    return inserted[0].id;
  });
}

export async function getAccountsWithBalance(userId: string) {
  return withUser(userId, async (tx) => {
    const rows = await tx.select({
      id: accounts.id,
      name: accounts.name,
      institution: accounts.institution,
      type: accounts.type,
      currency: accounts.currency,
      openingBalanceCents: accounts.openingBalanceCents,
      isActive: accounts.isActive,
      txSum: sql<string>`COALESCE(SUM(${transactions.amountCents}), 0)`,
    })
    .from(accounts)
    .leftJoin(transactions, and(
      eq(transactions.accountId, accounts.id),
      eq(transactions.isExcludedFromSpending, false),
    ))
    .where(eq(accounts.userId, userId))
    .groupBy(accounts.id)
    .orderBy(accounts.institution);

    return rows.map(r => ({
      ...r,
      balanceCents: r.openingBalanceCents + BigInt(r.txSum),
    }));
  });
}

export async function renameAccount(userId: string, accountId: string, name: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.update(accounts).set({ name }).where(and(
      eq(accounts.id, accountId),
      eq(accounts.userId, userId),
    ));
  });
}
