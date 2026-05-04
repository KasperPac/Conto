import type { PgBoss } from 'pg-boss';

interface NoopPayload {
  uploadedKey?: string;
  userId?: string;
  filename?: string;
  [key: string]: unknown;
}

export async function registerNoop(boss: PgBoss): Promise<void> {
  // pg-boss v12 work() handler receives Job<T>[] (an array of jobs)
  await boss.work<NoopPayload>('noop', async (jobs) => {
    for (const job of jobs) {
      console.log('[noop]', job.data);
    }
  });
}
