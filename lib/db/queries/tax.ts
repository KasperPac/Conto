import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { withUser } from '@/lib/db/client'
import { payslips, transactions, categories, merchants } from '@/lib/db/schema'
import { toCents } from '@/lib/types/money'
import type { Cents } from '@/lib/types/money'

export interface SuperPayslipRow {
  id: string
  payDate: string
  superCents: Cents
  salarySacrificeCents: Cents
  runningTotalCents: Cents
}

export interface SuperCapData {
  rows: SuperPayslipRow[]
  totalSuperCents: Cents
  totalSalarySacrificeCents: Cents
}

export async function getSuperCapData(
  userId: string,
  fyStart: string,
  fyEnd: string,
): Promise<SuperCapData> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: payslips.id,
        payDate: payslips.payDate,
        superCents: payslips.superCents,
        salarySacrificeCents: payslips.salarySacrificeCents,
      })
      .from(payslips)
      .where(
        and(
          eq(payslips.userId, userId),
          sql`${payslips.payDate}::date >= ${fyStart}::date`,
          sql`${payslips.payDate}::date <= ${fyEnd}::date`,
        ),
      )
      .orderBy(payslips.payDate)

    let runningTotal = 0n
    let totalSuper = 0n
    let totalSalSac = 0n

    const payslipRows: SuperPayslipRow[] = rows.map(row => {
      const superAmt = row.superCents
      const salSacAmt = row.salarySacrificeCents
      runningTotal += superAmt + salSacAmt
      totalSuper += superAmt
      totalSalSac += salSacAmt
      return {
        id: row.id,
        payDate: row.payDate as string,
        superCents: toCents(superAmt),
        salarySacrificeCents: toCents(salSacAmt),
        runningTotalCents: toCents(runningTotal),
      }
    })

    return {
      rows: payslipRows,
      totalSuperCents: toCents(totalSuper),
      totalSalarySacrificeCents: toCents(totalSalSac),
    }
  })
}

export interface DonationRow {
  id: string
  date: string
  merchantName: string | null
  description: string
  amountCents: Cents  // positive (absolute value of the negative transaction)
}

export interface DonationData {
  rows: DonationRow[]
  totalCents: Cents
}

export async function getDonationData(
  userId: string,
  fyStart: string,
  fyEnd: string,
): Promise<DonationData> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: transactions.id,
        date: transactions.postedDate,
        merchantName: merchants.canonicalName,
        description: transactions.descriptionClean,
        amountCents: transactions.amountCents,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(categories.deductionKind, 'donation'),
          sql`${transactions.postedDate}::date >= ${fyStart}::date`,
          sql`${transactions.postedDate}::date <= ${fyEnd}::date`,
        ),
      )
      .orderBy(sql`${transactions.postedDate} desc`)

    let total = 0n
    const donationRows: DonationRow[] = rows.map(row => {
      const amountCents = toCents(-row.amountCents)  // negate: spending is negative in DB
      total += amountCents
      return {
        id: row.id,
        date: row.date as string,
        merchantName: row.merchantName ?? null,
        description: row.description ?? '',
        amountCents,
      }
    })

    return { rows: donationRows, totalCents: toCents(total) }
  })
}

export interface PayslipFySummary {
  totalGrossCents: Cents
  totalPaygCents: Cents
  payslipCount: number
  earliestPayDate: string | null
  latestPayDate: string | null
}

export async function getPayslipSummaryForFy(
  userId: string,
  fyStart: string,
  fyEnd: string,
): Promise<PayslipFySummary> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        payDate: payslips.payDate,
        grossCents: payslips.grossCents,
        taxWithheldCents: payslips.taxWithheldCents,
      })
      .from(payslips)
      .where(
        and(
          eq(payslips.userId, userId),
          sql`${payslips.payDate}::date >= ${fyStart}::date`,
          sql`${payslips.payDate}::date <= ${fyEnd}::date`,
        ),
      )
      .orderBy(payslips.payDate)

    if (rows.length === 0) {
      return {
        totalGrossCents: toCents(0n),
        totalPaygCents: toCents(0n),
        payslipCount: 0,
        earliestPayDate: null,
        latestPayDate: null,
      }
    }

    let totalGross = 0n
    let totalPayg = 0n
    for (const row of rows) {
      totalGross += row.grossCents
      totalPayg += row.taxWithheldCents
    }

    return {
      totalGrossCents: toCents(totalGross),
      totalPaygCents: toCents(totalPayg),
      payslipCount: rows.length,
      earliestPayDate: rows[0]!.payDate as string,
      latestPayDate: rows[rows.length - 1]!.payDate as string,
    }
  })
}

export interface DeductibleKindTotal {
  deductionKind: string
  totalCents: Cents
}

export interface DeductibleFyTotals {
  byKind: DeductibleKindTotal[]
  grandTotalCents: Cents
}

export async function getDeductibleTotalsForFy(
  userId: string,
  fyStart: string,
  fyEnd: string,
): Promise<DeductibleFyTotals> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        deductionKind: categories.deductionKind,
        amountCents: transactions.amountCents,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(categories.isDeductibleCandidate, true),
          isNotNull(categories.deductionKind),
          sql`${transactions.postedDate}::date >= ${fyStart}::date`,
          sql`${transactions.postedDate}::date <= ${fyEnd}::date`,
        ),
      )

    // Group by deductionKind in TypeScript
    const kindMap = new Map<string, bigint>()
    for (const row of rows) {
      const kind = row.deductionKind!
      const abs = -row.amountCents  // spending is negative in DB; negate to get positive amount
      kindMap.set(kind, (kindMap.get(kind) ?? 0n) + abs)
    }

    const byKind: DeductibleKindTotal[] = Array.from(kindMap.entries())
      .map(([deductionKind, total]) => ({
        deductionKind,
        totalCents: toCents(total),
      }))
      .sort((a, b) => (b.totalCents > a.totalCents ? 1 : b.totalCents < a.totalCents ? -1 : 0))

    let grandTotal = 0n
    for (const k of byKind) {
      grandTotal += k.totalCents
    }

    return {
      byKind,
      grandTotalCents: toCents(grandTotal),
    }
  })
}
