import { Pool } from 'pg';
import 'dotenv/config';

export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL
    ?? process.env.DATABASE_URL?.replace(/\/conto$/, '/conto_test');
  if (!url) return;
  const pool = new Pool({ connectionString: url });
  const TABLES = [
    'expected_events', 'pay_cadences', 'recurrence_groups',
    'transaction_links', 'transactions',
    'subscriptions', 'goals', 'budgets', 'rules',
    'statements', 'accounts', 'payslips', 'merchants', 'categories',
    'session', 'account', 'verification', 'users',
  ];
  for (const t of TABLES) {
    await pool.query(`truncate table "${t}" restart identity cascade`).catch(() => {});
  }
  await pool.end();
}
