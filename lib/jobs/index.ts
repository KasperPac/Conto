import type { PgBoss } from 'pg-boss';
import { registerNoop } from './noop';

export async function registerHandlers(boss: PgBoss): Promise<void> {
  await boss.createQueue('noop').catch(() => { /* queue may already exist */ });
  await registerNoop(boss);
}
