import { PgBoss } from 'pg-boss';
import { parseEnv } from '@/lib/types/env';

const env = parseEnv();

export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
});
