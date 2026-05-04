import { describe, it, expect, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { auth } from '@/lib/auth/better-auth';
import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

describe('better-auth sign-up + sign-in', () => {
  const pool = new Pool({ connectionString: url });
  const _db = drizzle(pool, { schema });

  beforeEach(async () => {
    // Truncate Better Auth tables; cascade handles FK order
    await pool.query('truncate table session, account, verification, users restart identity cascade');
  });

  it('signs up a new user and returns a session', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: 'test@conto.local',
        password: 'correct horse battery staple',
        name: 'Test User',
      },
      headers: new Headers(),
    });
    expect(result.user.email).toBe('test@conto.local');
    expect(result.token).toBeTruthy();

    const { rows: users } = await pool.query("select id, email from users where email = 'test@conto.local'");
    expect(users.length).toBe(1);
    const { rows: accounts } = await pool.query('select 1 from account where user_id = $1', [users[0]!.id]);
    expect(accounts.length).toBe(1);
  });

  it('rejects invalid credentials', async () => {
    await auth.api.signUpEmail({
      body: { email: 'a@b.com', password: 'correct horse battery staple', name: 'A' },
      headers: new Headers(),
    });
    await expect(auth.api.signInEmail({
      body: { email: 'a@b.com', password: 'WRONG' },
      headers: new Headers(),
    })).rejects.toThrow();
  });
});
