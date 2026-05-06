import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { resetTestDb, seedUserAndAccount } from '@/tests/helpers/db';
import {
  upsertWfhEntry, deleteWfhEntry,
  getWfhEntriesByMonth, getWfhSummaryByFY,
} from '@/lib/db/queries/wfh-entries';

describe('wfh-entries', () => {
  let userId: string;
  beforeEach(async () => {
    await resetTestDb();
    ({ userId } = await seedUserAndAccount());
  });

  it('upserts on same date', async () => {
    await upsertWfhEntry(userId, '2026-05-01', 8);
    await upsertWfhEntry(userId, '2026-05-01', 6); // update
    const entries = await getWfhEntriesByMonth(userId, 2026, 5);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.hours).toBe('6.00');
  });

  it('deletes an entry', async () => {
    await upsertWfhEntry(userId, '2026-05-01', 8);
    await deleteWfhEntry(userId, '2026-05-01');
    const entries = await getWfhEntriesByMonth(userId, 2026, 5);
    expect(entries).toHaveLength(0);
  });

  it('getWfhEntriesByMonth filters to correct month', async () => {
    await upsertWfhEntry(userId, '2026-05-01', 8);
    await upsertWfhEntry(userId, '2026-06-01', 7);
    const may = await getWfhEntriesByMonth(userId, 2026, 5);
    expect(may).toHaveLength(1);
    expect(may[0]!.date).toBe('2026-05-01');
  });

  it('getWfhSummaryByFY sums correctly and groups by month', async () => {
    await upsertWfhEntry(userId, '2025-08-01', 8);
    await upsertWfhEntry(userId, '2025-08-04', 7.5);
    await upsertWfhEntry(userId, '2025-09-01', 8);
    const summary = await getWfhSummaryByFY(userId, '2025-07-01', '2026-06-30');
    expect(parseFloat(summary.totalHours)).toBeCloseTo(23.5);
    expect(summary.byMonth).toHaveLength(2);
    const aug = summary.byMonth.find(m => m.month === '2025-08')!;
    expect(parseFloat(aug.hours)).toBeCloseTo(15.5);
  });
});
