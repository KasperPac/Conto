import { describe, it, expect, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { seedAuSubcategories } from '@/lib/db/seeds/au-subcategories';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

describe('seedAuSubcategories', () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  beforeEach(async () => {
    await db.execute(sql`truncate table categories restart identity cascade`);
  });

  it('seeds at least one subcategory for each documented deduction_kind', async () => {
    await seedAuSubcategories(db);
    const kinds = ['wfh', 'donation', 'work_tools', 'motor_vehicle', 'professional_sub'];
    for (const k of kinds) {
      const { rows } = await pool.query(
        'select 1 from categories where deduction_kind = $1 and is_deductible_candidate = true',
        [k],
      );
      expect(rows.length, `expected at least one subcategory for ${k}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('is idempotent', async () => {
    await seedAuSubcategories(db);
    const { rows: before } = await pool.query('select count(*)::int as c from categories');
    await seedAuSubcategories(db);
    const { rows: after } = await pool.query('select count(*)::int as c from categories');
    expect(after[0]!.c).toBe(before[0]!.c);
  });
});
