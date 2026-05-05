import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { sql, eq, isNull } from 'drizzle-orm';
import { merchants, categories } from '@/lib/db/schema';
import { seedAuMerchants } from '@/lib/db/seeds/au-merchants';
import { resetTestDb, testDb } from '@/tests/helpers/db';

describe('AU merchant seed', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('seeds system categories needed by merchants', async () => {
    await seedAuMerchants(testDb as any);
    const rows = await testDb
      .select({ c: sql<number>`count(*)::int` })
      .from(categories)
      .where(isNull(categories.userId));
    expect(rows[0]!.c).toBeGreaterThanOrEqual(10);
  });

  it('seeds ≥ 35 system merchants', async () => {
    await seedAuMerchants(testDb as any);
    const rows = await testDb
      .select({ c: sql<number>`count(*)::int` })
      .from(merchants)
      .where(isNull(merchants.userId));
    expect(rows[0]!.c).toBeGreaterThanOrEqual(35);
  });

  it('subscription merchants have isSubscription = true', async () => {
    await seedAuMerchants(testDb as any);
    for (const name of ['Netflix', 'Spotify', 'Disney+', 'Adobe CC', 'Microsoft 365']) {
      const rows = await testDb
        .select({ isSubscription: merchants.isSubscription })
        .from(merchants)
        .where(eq(merchants.canonicalName, name));
      expect(rows[0]?.isSubscription, `${name} should be isSubscription=true`).toBe(true);
    }
  });

  it('non-subscription merchants have isSubscription = false', async () => {
    await seedAuMerchants(testDb as any);
    for (const name of ['Woolworths', 'Coles', "McDonald's", 'AGL']) {
      const rows = await testDb
        .select({ isSubscription: merchants.isSubscription })
        .from(merchants)
        .where(eq(merchants.canonicalName, name));
      expect(rows[0]?.isSubscription, `${name} should be isSubscription=false`).toBe(false);
    }
  });

  it('is idempotent', async () => {
    await seedAuMerchants(testDb as any);
    const before = await testDb.select({ c: sql<number>`count(*)::int` }).from(merchants);
    await seedAuMerchants(testDb as any);
    const after = await testDb.select({ c: sql<number>`count(*)::int` }).from(merchants);
    expect(after[0]!.c).toBe(before[0]!.c);
  });
});
