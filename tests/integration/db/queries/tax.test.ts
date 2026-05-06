import { describe, it, expect, beforeEach } from 'vitest'
import 'dotenv/config'
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db'
import { payslips, transactions, categories } from '@/lib/db/schema'
import { getSuperCapData, getDonationData } from '@/lib/db/queries/tax'

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
