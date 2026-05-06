import { and, between, eq, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { payslips } from '@/lib/db/schema';
import { toCents } from '@/lib/types/money';
import type { Cents } from '@/lib/types/money';

export interface IncomeSummary {
  grossCents: Cents;
  taxCents: Cents;
  superCents: Cents;
  netCents: Cents;
  count: number;
}

export interface IncomeByMonth {
  month: string; // 'YYYY-MM'
  grossCents: Cents;
  taxCents: Cents;
  superCents: Cents;
  netCents: Cents;
}

export interface IncomeByEmployer {
  employer: string;
  grossCents: Cents;
  taxCents: Cents;
  superCents: Cents;
  netCents: Cents;
  count: number;
}

export async function getIncomeSummary(userId: string, start: string, end: string): Promise<IncomeSummary> {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select({
        grossCents: sql<bigint>`coalesce(sum(gross_cents), 0)::bigint`,
        taxCents:   sql<bigint>`coalesce(sum(tax_withheld_cents), 0)::bigint`,
        superCents: sql<bigint>`coalesce(sum(super_cents), 0)::bigint`,
        netCents:   sql<bigint>`coalesce(sum(net_cents), 0)::bigint`,
        count:      sql<number>`count(*)::int`,
      })
      .from(payslips)
      .where(and(eq(payslips.userId, userId), between(payslips.payDate, start, end)));
    return {
      grossCents: toCents(row!.grossCents),
      taxCents:   toCents(row!.taxCents),
      superCents: toCents(row!.superCents),
      netCents:   toCents(row!.netCents),
      count:      row!.count,
    };
  });
}

export async function getIncomeByMonth(userId: string, start: string, end: string): Promise<IncomeByMonth[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        month:      sql<string>`to_char(pay_date, 'YYYY-MM')`,
        grossCents: sql<bigint>`sum(gross_cents)::bigint`,
        taxCents:   sql<bigint>`sum(tax_withheld_cents)::bigint`,
        superCents: sql<bigint>`sum(super_cents)::bigint`,
        netCents:   sql<bigint>`sum(net_cents)::bigint`,
      })
      .from(payslips)
      .where(and(eq(payslips.userId, userId), between(payslips.payDate, start, end)))
      .groupBy(sql`to_char(pay_date, 'YYYY-MM')`)
      .orderBy(sql`to_char(pay_date, 'YYYY-MM')`);
    return rows.map(r => ({
      month: r.month,
      grossCents: toCents(r.grossCents),
      taxCents:   toCents(r.taxCents),
      superCents: toCents(r.superCents),
      netCents:   toCents(r.netCents),
    }));
  });
}

export async function getIncomeByEmployer(userId: string, start: string, end: string): Promise<IncomeByEmployer[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        employer:   payslips.employer,
        grossCents: sql<bigint>`sum(gross_cents)::bigint`,
        taxCents:   sql<bigint>`sum(tax_withheld_cents)::bigint`,
        superCents: sql<bigint>`sum(super_cents)::bigint`,
        netCents:   sql<bigint>`sum(net_cents)::bigint`,
        count:      sql<number>`count(*)::int`,
      })
      .from(payslips)
      .where(and(eq(payslips.userId, userId), between(payslips.payDate, start, end)))
      .groupBy(payslips.employer)
      .orderBy(sql`sum(gross_cents) desc`);
    return rows.map(r => ({
      employer:   r.employer,
      grossCents: toCents(r.grossCents),
      taxCents:   toCents(r.taxCents),
      superCents: toCents(r.superCents),
      netCents:   toCents(r.netCents),
      count:      r.count,
    }));
  });
}
