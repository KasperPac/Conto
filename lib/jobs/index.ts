import type { PgBoss } from 'pg-boss';
import { registerParseStatement } from './parse-statement';
import { registerDetectTransfers } from './detect-transfers';

export async function registerHandlers(boss: PgBoss): Promise<void> {
  await registerParseStatement(boss);
  await registerDetectTransfers(boss);
}
