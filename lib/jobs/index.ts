import type { PgBoss } from 'pg-boss';
import { registerParseStatement } from './parse-statement';

export async function registerHandlers(boss: PgBoss): Promise<void> {
  await registerParseStatement(boss);
}
