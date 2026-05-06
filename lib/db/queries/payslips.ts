import { and, desc, eq, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { payslips, transactionLinks, transactions, accounts } from '@/lib/db/schema';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';

export interface PayslipRow {
  id: string;
  employer: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  grossCents: Cents;
  taxWithheldCents: Cents;
  superCents: Cents;
  netCents: Cents;
  source: string;
  cadence: string | null;
  linkStatus: 'linked' | 'suggested' | 'unlinked';
  linkedDepositDate: string | null;
  linkedAccountName: string | null;
  linkId: string | null;
}

export async function getPayslipsByUser(userId: string): Promise<PayslipRow[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: payslips.id,
        employer: payslips.employer,
        periodStart: payslips.periodStart,
        periodEnd: payslips.periodEnd,
        payDate: payslips.payDate,
        grossCents: payslips.grossCents,
        taxWithheldCents: payslips.taxWithheldCents,
        superCents: payslips.superCents,
        netCents: payslips.netCents,
        source: payslips.source,
        cadence: payslips.cadence,
        linkId: transactionLinks.id,
        linkSource: transactionLinks.source,
        linkedDepositDate: transactions.postedDate,
        linkedAccountName: accounts.name,
      })
      .from(payslips)
      .leftJoin(
        transactionLinks,
        and(
          eq(transactionLinks.payslipId, payslips.id),
          eq(transactionLinks.linkType, 'income'),
        ),
      )
      .leftJoin(transactions, eq(transactionLinks.fromTransactionId, transactions.id))
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(eq(payslips.userId, userId))
      .orderBy(desc(payslips.payDate));

    return rows.map(r => ({
      id: r.id,
      employer: r.employer,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      payDate: r.payDate,
      grossCents: toCents(r.grossCents),
      taxWithheldCents: toCents(r.taxWithheldCents),
      superCents: toCents(r.superCents),
      netCents: toCents(r.netCents),
      source: r.source,
      cadence: r.cadence,
      linkId: r.linkId ?? null,
      linkStatus: (r.linkId == null ? 'unlinked' : r.linkSource === 'suggested' ? 'suggested' : 'linked') as PayslipRow['linkStatus'],
      linkedDepositDate: r.linkedDepositDate ?? null,
      linkedAccountName: r.linkedAccountName ?? null,
    }));
  });
}

export async function getUnlinkedPayslips(userId: string): Promise<PayslipRow[]> {
  const all = await getPayslipsByUser(userId);
  return all.filter(p => p.linkStatus === 'unlinked');
}

export async function getPayslipById(userId: string, id: string): Promise<PayslipRow | null> {
  const all = await getPayslipsByUser(userId);
  return all.find(p => p.id === id) ?? null;
}

export async function getPayslipsForLinkingJob(
  userId: string,
): Promise<Array<{ id: string; payDate: string; netCents: Cents; employer: string }>> {
  return withUser(userId, async (tx) => {
    const linkedSub = sql<string>`(
      SELECT payslip_id FROM transaction_links
      WHERE user_id = ${userId} AND payslip_id IS NOT NULL AND link_type = 'income'
    )`;
    const rows = await tx
      .select({ id: payslips.id, payDate: payslips.payDate, netCents: payslips.netCents, employer: payslips.employer })
      .from(payslips)
      .where(and(
        eq(payslips.userId, userId),
        sql`${payslips.id} NOT IN ${linkedSub}`,
      ));
    return rows.map(r => ({ ...r, netCents: toCents(r.netCents) }));
  });
}
