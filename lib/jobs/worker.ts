import { getBossRaw } from './boss';
import { registerHandlers } from './index';

async function main(): Promise<void> {
  const boss = await getBossRaw();
  await registerHandlers(boss);
  console.log('[worker] ready');
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      console.log(`[worker] received ${sig}, shutting down…`);
      await boss.stop({ graceful: true });
      process.exit(0);
    });
  }
}

main().catch((err) => { console.error('[worker] fatal:', err); process.exit(1); });
