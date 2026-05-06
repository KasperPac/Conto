import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { withUser } from '@/lib/db/client';
import { payslips } from '@/lib/db/schema';
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db';
import { getIncomeSummary, getIncomeByMonth, getIncomeByEmployer } from '@/lib/db/queries/income-summary';

const seed = (userId: string) =>
  withUser(userId, tx =>
    tx.insert(payslips).values([
      { userId, employer: 'Acme Corp', periodStart: '2025-07-16', periodEnd: '2025-07-31',
        payDate: '2025-08-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(57000), netCents: BigInt(403000), source: 'manual' },
      { userId, employer: 'Acme Corp', periodStart: '2025-08-16', periodEnd: '2025-08-31',
        payDate: '2025-09-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(57000), netCents: BigInt(403000), source: 'manual' },
      { userId, employer: 'Beta Ltd', periodStart: '2025-09-01', periodEnd: '2025-09-30',
        payDate: '2025-10-01', grossCents: BigInt(500000), taxWithheldCents: BigInt(100000),
        superCents: BigInt(47500), netCents: BigInt(352500), source: 'manual' },
    ]),
  );

describe('income-summary queries', () => {
  let userId: string;
  beforeEach(async () => {
    await resetTestDb();
    ({ userId } = await seedUserAndAccount());
    await seed(userId);
  });

  it('getIncomeSummary totals all payslips in range', async () => {
    const s = await getIncomeSummary(userId, '2025-07-01', '2026-06-30');
    expect(Number(s.grossCents)).toBe(1_700_000);
    expect(Number(s.taxCents)).toBe(380_000);
    expect(Number(s.superCents)).toBe(161_500);
    expect(Number(s.netCents)).toBe(1_158_500);
    expect(s.count).toBe(3);
  });

  it('getIncomeSummary returns zeros for empty range', async () => {
    const s = await getIncomeSummary(userId, '2020-07-01', '2021-06-30');
    expect(Number(s.grossCents)).toBe(0);
    expect(s.count).toBe(0);
  });

  it('getIncomeByMonth groups by pay month', async () => {
    const rows = await getIncomeByMonth(userId, '2025-07-01', '2026-06-30');
    expect(rows.length).toBe(3);
    expect(rows[0]!.month).toBe('2025-08');
    expect(Number(rows[0]!.grossCents)).toBe(600_000);
  });

  it('getIncomeByEmployer groups by employer', async () => {
    const rows = await getIncomeByEmployer(userId, '2025-07-01', '2026-06-30');
    expect(rows).toHaveLength(2);
    const acme = rows.find(r => r.employer === 'Acme Corp')!;
    expect(Number(acme.grossCents)).toBe(1_200_000);
    expect(acme.count).toBe(2);
  });
});
