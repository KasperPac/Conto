import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PgBoss } from 'pg-boss';
import 'dotenv/config';
import { resetTestDb, seedUserAndAccount } from '../../helpers/db';
import { testDb } from '../../helpers/db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const url =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

// Mock R2 getObject to return actual fixture bytes
const nabFixture = readFileSync(
  path.resolve('tests/fixtures/pdf/nab/nab_pdf_v1_sample.pdf'),
);

vi.mock('@/lib/storage/get-object', () => ({
  getObject: vi.fn().mockResolvedValue(nabFixture),
}));

describe('parse-statement job', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('processes a NAB/Virgin Money PDF and creates account + transactions', async () => {
    const { userId } = await seedUserAndAccount();

    // Insert a statement record
    const [stmt] = await testDb.insert(schema.statements).values({
      userId,
      sourceFilename: 'nab_pdf_v1_sample.pdf',
      sourceObjectKey: 'fake/key.pdf',
      format: 'pdf',
      status: 'pending',
    }).returning();
    if (!stmt) throw new Error('Failed to insert statement');

    const boss = new PgBoss({ connectionString: url });
    await boss.start();

    // Register the real handler
    const { registerParseStatement } = await import('@/lib/jobs/parse-statement');
    await registerParseStatement(boss);

    // Enqueue the job
    await boss.send('parse-statement', {
      statementId: stmt.id,
      userId,
      sourceObjectKey: 'fake/key.pdf',
    });

    // Wait for pg-boss polling cycle
    await new Promise((r) => setTimeout(r, 4000));

    await boss.stop({ graceful: true });

    // Statement should be marked parsed
    const [updated] = await testDb.select()
      .from(schema.statements)
      .where(eq(schema.statements.id, stmt.id));
    expect(updated?.status).toBe('parsed');
    expect(updated?.parsedAt).toBeTruthy();

    // Transactions should exist for this statement
    const txs = await testDb.select()
      .from(schema.transactions)
      .where(eq(schema.transactions.statementId, stmt.id));
    expect(txs.length).toBeGreaterThan(0);
  }, 20_000);
});
