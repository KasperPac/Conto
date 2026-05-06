import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

describe('schema', () => {
  const pool = new Pool({ connectionString: url });

  it('every required table exists', async () => {
    const required = [
      'users','session','account','verification',
      'accounts','statements','transactions','transaction_links','merchants','categories','rules','payslips','subscriptions','goals','budgets',
      'recurrence_groups','pay_cadences','expected_events','wfh_entries',
    ];
    const { rows } = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'"
    );
    const present = new Set(rows.map(r => r.table_name));
    for (const t of required) {
      expect(present.has(t), `expected table ${t}`).toBe(true);
    }
  });

  it('plan A schema deltas are present', async () => {
    const checks: Array<[string, string]> = [
      ['categories', 'is_deductible_candidate'],
      ['categories', 'deduction_kind'],
      ['transactions', 'receipt_object_key'],
      ['transactions', 'receipt_uploaded_at'],
      ['transactions', 'recurrence_group_id'],
      ['users', 'cashflow_buffer_cents'],
      ['payslips', 'cadence'],
      ['transactions', 'receipt_filename'],
      ['transactions', 'receipt_content_type'],
      ['wfh_entries', 'id'],
      ['wfh_entries', 'user_id'],
      ['wfh_entries', 'date'],
      ['wfh_entries', 'hours'],
      ['wfh_entries', 'created_at'],
      ['wfh_entries', 'updated_at'],
    ];
    for (const [table, column] of checks) {
      const { rows } = await pool.query(
        "select 1 from information_schema.columns where table_name = $1 and column_name = $2",
        [table, column],
      );
      expect(rows.length, `expected ${table}.${column}`).toBe(1);
    }
  });

  it('users does not have password_hash (Better Auth manages credentials separately)', async () => {
    const { rows } = await pool.query(
      "select 1 from information_schema.columns where table_name = 'users' and column_name = 'password_hash'"
    );
    expect(rows.length).toBe(0);
  });

  it('RLS is enabled on domain tables', async () => {
    const tables = ['accounts','transactions','recurrence_groups','expected_events'];
    const { rows } = await pool.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = any($1)",
      [tables],
    );
    for (const r of rows) {
      expect(r.rowsecurity, `RLS expected on ${r.tablename}`).toBe(true);
    }
  });

  it('partial index expected_events_pending_idx exists', async () => {
    const { rows } = await pool.query(
      "select 1 from pg_indexes where indexname = 'expected_events_pending_idx'"
    );
    expect(rows.length).toBe(1);
  });
});
