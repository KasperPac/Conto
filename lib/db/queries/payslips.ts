import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
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
  linkConfidence: number | null;
  linkedDepositDesc: string | null;
}

export async function getPayslipsByUser(userId: string): Promise<PayslipRow[]> {
  return withUser(userId, async (tx) => {
    // Get latest income link per payslip (subquery)
    const linkSub = tx
      .selectDistinctOn([transactionLinks.payslipId], {
        payslipId: transactionLinks.payslipId,
        id: transactionLinks.id,
        source: transactionLinks.source,
        confidence: transactionLinks.confidence,
        depositDate: transactions.postedDate,
        depositDesc: transactions.descriptionRaw,
        accountName: accounts.name,
      })
      .from(transactionLinks)
      .leftJoin(transactions, eq(transactionLinks.fromTransactionId, transactions.id))
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(
        eq(transactionLinks.userId, userId),
        eq(transactionLinks.linkType, 'income'),
        isNotNull(transactionLinks.payslipId),
      ))
      .orderBy(transactionLinks.payslipId, desc(transactionLinks.createdAt))
      .as('link_sub');

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
        linkId: linkSub.id,
        linkSource: linkSub.source,
        linkConfidence: linkSub.confidence,
        linkedDepositDate: linkSub.depositDate,
        linkedDepositDesc: linkSub.depositDesc,
        linkedAccountName: linkSub.accountName,
      })
      .from(payslips)
      .leftJoin(linkSub, eq(linkSub.payslipId, payslips.id))
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
      linkStatus: (r.linkId == null || r.linkSource === 'dismissed' ? 'unlinked' : r.linkSource === 'suggested' ? 'suggested' : 'linked') as PayslipRow['linkStatus'],
      linkedDepositDate: r.linkedDepositDate ?? null,
      linkedDepositDesc: r.linkedDepositDesc ?? null,
      linkedAccountName: r.linkedAccountName ?? null,
      linkConfidence: r.linkConfidence != null ? parseFloat(r.linkConfidence as unknown as string) : null,
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
    const linkedIds = tx
      .select({ payslipId: transactionLinks.payslipId })
      .from(transactionLinks)
      .where(and(
        eq(transactionLinks.userId, userId),
        eq(transactionLinks.linkType, 'income'),
        isNotNull(transactionLinks.payslipId),
      ));

    const rows = await tx
      .select({ id: payslips.id, payDate: payslips.payDate, netCents: payslips.netCents, employer: payslips.employer })
      .from(payslips)
      .where(and(
        eq(payslips.userId, userId),
        sql`${payslips.id} NOT IN (${linkedIds})`,
      ));
    return rows.map(r => ({ ...r, netCents: toCents(r.netCents) }));
  });
}
