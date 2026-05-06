import { describe, it, expect, beforeEach } from 'vitest'
import 'dotenv/config'
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db'
import { payslips, transactions, categories } from '@/lib/db/schema'
import { getSuperCapData, getDonationData, getPayslipSummaryForFy, getDeductibleTotalsForFy } from '@/lib/db/queries/tax'

describe('getSuperCapData', () => {
  let userId: string

  beforeEach(async () => {
    await resetTestDb()
    ;({ userId } = await seedUserAndAccount())
  })

  it('returns empty result when no payslips', async () => {
    const result = await getSuperCapData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(0)
    expect(result.totalSuperCents).toBe(BigInt(0))
    expect(result.totalSalarySacrificeCents).toBe(BigInt(0))
  })

  it('returns payslips in FY ordered by payDate ascending with running totals', async () => {
    await testDb.insert(payslips).values([
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        payDate: '2025-07-31',
        grossCents: BigInt(1000000),
        taxWithheldCents: BigInt(200000),
        superCents: BigInt(110000),
        salarySacrificeCents: BigInt(50000),
        netCents: BigInt(750000),
        source: 'manual',
      },
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-08-01',
        periodEnd: '2025-08-31',
        payDate: '2025-08-31',
        grossCents: BigInt(1000000),
        taxWithheldCents: BigInt(200000),
        superCents: BigInt(110000),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(750000),
        source: 'manual',
      },
    ])

    const result = await getSuperCapData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(2)

    // First row: $1,100 super + $500 salary sacrifice, running = $1,600
    expect(result.rows[0]!.superCents).toBe(BigInt(110000))
    expect(result.rows[0]!.salarySacrificeCents).toBe(BigInt(50000))
    expect(result.rows[0]!.runningTotalCents).toBe(BigInt(160000))

    // Second row: $1,100 super + $0, running = $2,700
    expect(result.rows[1]!.superCents).toBe(BigInt(110000))
    expect(result.rows[1]!.salarySacrificeCents).toBe(BigInt(0))
    expect(result.rows[1]!.runningTotalCents).toBe(BigInt(270000))

    expect(result.totalSuperCents).toBe(BigInt(220000))
    expect(result.totalSalarySacrificeCents).toBe(BigInt(50000))
  })

  it('excludes payslips outside the FY range', async () => {
    await testDb.insert(payslips).values({
      userId,
      employer: 'ACME',
      periodStart: '2024-06-01',
      periodEnd: '2024-06-30',
      payDate: '2024-06-30',  // prior FY
      grossCents: BigInt(1000000),
      taxWithheldCents: BigInt(200000),
      superCents: BigInt(110000),
      salarySacrificeCents: BigInt(0),
      netCents: BigInt(750000),
      source: 'manual',
    })

    const result = await getSuperCapData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(0)
  })
})

describe('getDonationData', () => {
  let userId: string
  let accountId: string

  beforeEach(async () => {
    await resetTestDb()
    ;({ userId, accountId } = await seedUserAndAccount())
  })

  it('returns empty result when no donation transactions', async () => {
    const result = await getDonationData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(0)
    expect(result.totalCents).toBe(BigInt(0))
  })

  it('returns only transactions with deductionKind = donation, amounts positive', async () => {
    // Insert donation category
    const [donationCat] = await testDb.insert(categories).values({
      name: 'Donations — DGR-registered',
      deductionKind: 'donation',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    // Insert non-donation category
    const [groceryCat] = await testDb.insert(categories).values({
      name: 'Groceries',
      isIncome: false,
      isEssential: true,
    }).returning()

    await testDb.insert(transactions).values([
      {
        userId,
        accountId,
        postedDate: '2025-09-15',
        descriptionRaw: 'BEYOND BLUE',
        descriptionClean: 'Beyond Blue',
        amountCents: BigInt(-5000),  // -$50 (spending)
        classificationSource: 'manual',
        categoryId: donationCat!.id,
      },
      {
        userId,
        accountId,
        postedDate: '2025-10-01',
        descriptionRaw: 'WOOLWORTHS',
        descriptionClean: 'Woolworths',
        amountCents: BigInt(-12000),  // groceries, not donation
        classificationSource: 'manual',
        categoryId: groceryCat!.id,
      },
    ])

    const result = await getDonationData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.amountCents).toBe(BigInt(5000))  // positive display
    expect(result.rows[0]!.description).toBe('Beyond Blue')
    expect(result.totalCents).toBe(BigInt(5000))
  })

  it('excludes donation transactions outside the FY range', async () => {
    const [donationCat] = await testDb.insert(categories).values({
      name: 'Donations — DGR-registered',
      deductionKind: 'donation',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    await testDb.insert(transactions).values({
      userId,
      accountId,
      postedDate: '2024-06-01',  // prior FY
      descriptionRaw: 'OLD CHARITY',
      amountCents: BigInt(-10000),
      classificationSource: 'manual',
      categoryId: donationCat!.id,
    })

    const result = await getDonationData(userId, '2025-07-01', '2026-06-30')
    expect(result.rows).toHaveLength(0)
  })
})

describe('getPayslipSummaryForFy', () => {
  let userId: string

  beforeEach(async () => {
    await resetTestDb()
    ;({ userId } = await seedUserAndAccount())
  })

  it('returns zero totals and null dates when no payslips', async () => {
    const result = await getPayslipSummaryForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.totalGrossCents).toBe(BigInt(0))
    expect(result.totalPaygCents).toBe(BigInt(0))
    expect(result.payslipCount).toBe(0)
    expect(result.earliestPayDate).toBeNull()
    expect(result.latestPayDate).toBeNull()
  })

  it('sums grossCents and taxWithheldCents correctly across multiple payslips', async () => {
    await testDb.insert(payslips).values([
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        payDate: '2025-07-31',
        grossCents: BigInt(800000),
        taxWithheldCents: BigInt(180000),
        superCents: BigInt(88000),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(620000),
        source: 'manual',
      },
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-08-01',
        periodEnd: '2025-08-31',
        payDate: '2025-08-31',
        grossCents: BigInt(900000),
        taxWithheldCents: BigInt(200000),
        superCents: BigInt(99000),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(700000),
        source: 'manual',
      },
    ])

    const result = await getPayslipSummaryForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.payslipCount).toBe(2)
    expect(result.totalGrossCents).toBe(BigInt(1700000))
    expect(result.totalPaygCents).toBe(BigInt(380000))
  })

  it('excludes payslips with payDate outside the FY range', async () => {
    await testDb.insert(payslips).values([
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        payDate: '2025-07-31',  // inside FY
        grossCents: BigInt(500000),
        taxWithheldCents: BigInt(100000),
        superCents: BigInt(55000),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(400000),
        source: 'manual',
      },
      {
        userId,
        employer: 'ACME',
        periodStart: '2024-06-01',
        periodEnd: '2024-06-30',
        payDate: '2024-06-30',  // prior FY — should be excluded
        grossCents: BigInt(999999),
        taxWithheldCents: BigInt(999999),
        superCents: BigInt(0),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(1),
        source: 'manual',
      },
    ])

    const result = await getPayslipSummaryForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.payslipCount).toBe(1)
    expect(result.totalGrossCents).toBe(BigInt(500000))
    expect(result.totalPaygCents).toBe(BigInt(100000))
  })

  it('returns correct earliestPayDate and latestPayDate', async () => {
    await testDb.insert(payslips).values([
      {
        userId,
        employer: 'ACME',
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        payDate: '2025-07-31',
        grossCents: BigInt(500000),
        taxWithheldCents: BigInt(100000),
        superCents: BigInt(0),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(400000),
        source: 'manual',
      },
      {
        userId,
        employer: 'ACME',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        payDate: '2026-03-31',
        grossCents: BigInt(500000),
        taxWithheldCents: BigInt(100000),
        superCents: BigInt(0),
        salarySacrificeCents: BigInt(0),
        netCents: BigInt(400000),
        source: 'manual',
      },
    ])

    const result = await getPayslipSummaryForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.payslipCount).toBe(2)
    expect(result.earliestPayDate).toBe('2025-07-31')
    expect(result.latestPayDate).toBe('2026-03-31')
  })
})

describe('getDeductibleTotalsForFy', () => {
  let userId: string
  let accountId: string

  beforeEach(async () => {
    await resetTestDb()
    ;({ userId, accountId } = await seedUserAndAccount())
  })

  it('returns empty result when no deductible transactions', async () => {
    const result = await getDeductibleTotalsForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.byKind).toHaveLength(0)
    expect(result.grandTotalCents).toBe(BigInt(0))
  })

  it('groups by deductionKind and returns absolute amounts', async () => {
    const [donationCat] = await testDb.insert(categories).values({
      name: 'Donations — DGR-registered',
      deductionKind: 'donation',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    const [wfhCat] = await testDb.insert(categories).values({
      name: 'WFH — utilities',
      deductionKind: 'wfh',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    await testDb.insert(transactions).values([
      {
        userId,
        accountId,
        postedDate: '2025-09-01',
        descriptionRaw: 'CHARITY ONE',
        amountCents: BigInt(-3000),
        classificationSource: 'manual',
        categoryId: donationCat!.id,
      },
      {
        userId,
        accountId,
        postedDate: '2025-10-01',
        descriptionRaw: 'CHARITY TWO',
        amountCents: BigInt(-7000),
        classificationSource: 'manual',
        categoryId: donationCat!.id,
      },
      {
        userId,
        accountId,
        postedDate: '2025-11-01',
        descriptionRaw: 'ELECTRICITY BILL',
        amountCents: BigInt(-15000),
        classificationSource: 'manual',
        categoryId: wfhCat!.id,
      },
    ])

    const result = await getDeductibleTotalsForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.byKind).toHaveLength(2)
    // sorted descending: wfh ($150) > donation ($100)
    expect(result.byKind[0]!.deductionKind).toBe('wfh')
    expect(result.byKind[0]!.totalCents).toBe(BigInt(15000))
    expect(result.byKind[1]!.deductionKind).toBe('donation')
    expect(result.byKind[1]!.totalCents).toBe(BigInt(10000))
    expect(result.grandTotalCents).toBe(BigInt(25000))
  })

  it('excludes non-deductible categories', async () => {
    const [deductibleCat] = await testDb.insert(categories).values({
      name: 'Donations — DGR-registered',
      deductionKind: 'donation',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    // isDeductibleCandidate = false — should be excluded
    const [nonDeductibleCat] = await testDb.insert(categories).values({
      name: 'Groceries',
      isDeductibleCandidate: false,
      isIncome: false,
      isEssential: true,
    }).returning()

    // isDeductibleCandidate = true but deductionKind = null — should be excluded
    const [nullKindCat] = await testDb.insert(categories).values({
      name: 'Misc deductible',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    await testDb.insert(transactions).values([
      {
        userId,
        accountId,
        postedDate: '2025-09-01',
        descriptionRaw: 'CHARITY',
        amountCents: BigInt(-5000),
        classificationSource: 'manual',
        categoryId: deductibleCat!.id,
      },
      {
        userId,
        accountId,
        postedDate: '2025-09-02',
        descriptionRaw: 'WOOLWORTHS',
        amountCents: BigInt(-10000),
        classificationSource: 'manual',
        categoryId: nonDeductibleCat!.id,
      },
      {
        userId,
        accountId,
        postedDate: '2025-09-03',
        descriptionRaw: 'MISC',
        amountCents: BigInt(-2000),
        classificationSource: 'manual',
        categoryId: nullKindCat!.id,
      },
    ])

    const result = await getDeductibleTotalsForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.byKind).toHaveLength(1)
    expect(result.byKind[0]!.deductionKind).toBe('donation')
    expect(result.grandTotalCents).toBe(BigInt(5000))
  })

  it('excludes transactions outside the FY range', async () => {
    const [donationCat] = await testDb.insert(categories).values({
      name: 'Donations — DGR-registered',
      deductionKind: 'donation',
      isDeductibleCandidate: true,
      isIncome: false,
      isEssential: false,
    }).returning()

    await testDb.insert(transactions).values([
      {
        userId,
        accountId,
        postedDate: '2025-08-01',  // inside FY
        descriptionRaw: 'CURRENT CHARITY',
        amountCents: BigInt(-6000),
        classificationSource: 'manual',
        categoryId: donationCat!.id,
      },
      {
        userId,
        accountId,
        postedDate: '2024-06-01',  // prior FY — excluded
        descriptionRaw: 'OLD CHARITY',
        amountCents: BigInt(-99999),
        classificationSource: 'manual',
        categoryId: donationCat!.id,
      },
    ])

    const result = await getDeductibleTotalsForFy(userId, '2025-07-01', '2026-06-30')
    expect(result.byKind).toHaveLength(1)
    expect(result.grandTotalCents).toBe(BigInt(6000))
  })
})
