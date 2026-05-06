import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { auth } from '@/lib/auth/better-auth';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');
const pool = new Pool({ connectionString: url });
export const testDb = drizzle(pool, { schema });

const ALL_TABLES = [
  'wfh_entries', 'expected_events', 'pay_cadences', 'recurrence_groups',
  'transaction_links', 'transactions',
  'subscriptions', 'goals', 'budgets', 'rules',
  'statements', 'accounts', 'payslips', 'merchants', 'categories',
  'session', 'account', 'verification', 'users',
];

export async function resetTestDb(): Promise<void> {
  const list = ALL_TABLES.map(t => `"${t}"`).join(', ');
  await testDb.execute(sql.raw(`truncate table ${list} restart identity cascade`));
}

export interface SeededUser {
  userId: string;
  accountId: string;
  email: string;
}

export async function seedUserAndAccount(opts?: {
  email?: string;
  openingBalanceCents?: bigint;
}): Promise<SeededUser> {
  const email = opts?.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@conto.local`;

  const result = await auth.api.signUpEmail({
    body: { email, password: 'correct horse battery staple', name: email.split('@')[0] ?? email },
    headers: new Headers(),
  });
  const userId = result.user.id;

  const inserted = await testDb.insert(schema.accounts).values({
    userId,
    name: 'Test Account',
    institution: 'TEST',
    type: 'checking',
    openingBalanceCents: opts?.openingBalanceCents ?? BigInt(100000),
    openingBalanceDate: '2026-01-01',
  }).returning();

  if (!inserted[0]) throw new Error('Failed to insert test account');
  return { userId, accountId: inserted[0].id, email };
}
