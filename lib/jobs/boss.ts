import { PgBoss } from 'pg-boss';
import { parseEnv } from '@/lib/types/env';

const env = parseEnv();

let _boss: PgBoss | null = null;
let _starting: Promise<PgBoss> | null = null;

async function ensureStarted(): Promise<PgBoss> {
  if (_boss) return _boss;
  if (_starting) return _starting;
  _starting = (async () => {
    const b = new PgBoss({ connectionString: env.DATABASE_URL });
    await b.start();
    _boss = b;
    return b;
  })();
  return _starting;
}

export const boss = {
  async send(name: string, data: unknown): Promise<void> {
    const b = await ensureStarted();
    await b.send(name, data as Record<string, unknown>);
  },
  async start(): Promise<PgBoss> {
    return ensureStarted();
  },
  async stop(opts?: { graceful?: boolean }): Promise<void> {
    if (_boss) { await _boss.stop(opts); _boss = null; }
    _starting = null;
  },
};

export async function getBossRaw(): Promise<PgBoss> {
  return ensureStarted();
}
