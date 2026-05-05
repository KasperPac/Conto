import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { categories } from '@/lib/db/schema';
import { seedAuSubcategories } from '@/lib/db/seeds/au-subcategories';
import { resetTestDb, testDb } from '@/tests/helpers/db';

describe('AU subcategory seed', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('seeds at least one subcategory for each documented deduction_kind', async () => {
    await seedAuSubcategories(testDb as any);
    const kinds = ['wfh', 'donation', 'work_tools', 'motor_vehicle', 'professional_sub'];
    for (const k of kinds) {
      const rows = await testDb.select().from(categories).where(eq(categories.deductionKind, k));
      expect(rows.length, `expected at least one subcategory for ${k}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('is idempotent', async () => {
    await seedAuSubcategories(testDb as any);
    const before = await testDb.select({ c: sql<number>`count(*)::int` }).from(categories);
    await seedAuSubcategories(testDb as any);
    const after = await testDb.select({ c: sql<number>`count(*)::int` }).from(categories);
    expect(after[0]!.c).toBe(before[0]!.c);
  });
});
