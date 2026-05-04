import { describe, it, expect } from 'vitest';
import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import 'dotenv/config';

const url =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL!.replace(/\/conto$/, '/conto_test');

describe('pg-boss noop', () => {
  it('starts, registers noop handler, processes a sent job', async () => {
    const boss = new PgBoss({ connectionString: url });
    await boss.start();

    let received: unknown = null;

    await boss.createQueue('noop').catch(() => { /* already exists */ });

    // pg-boss v12: WorkHandler receives Job<T>[] (array)
    await boss.work<{ hello: string }>('noop', async (jobs: Job<{ hello: string }>[]) => {
      const first = jobs[0];
      if (first !== undefined) {
        received = first.data;
      }
    });

    await boss.send('noop', { hello: 'world' });

    // Wait for pg-boss polling cycle (default 2s) + buffer
    await new Promise((r) => setTimeout(r, 3000));

    expect(received).toEqual({ hello: 'world' });

    await boss.stop({ graceful: true });
  }, 15_000);
});
