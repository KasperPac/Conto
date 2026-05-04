import { boss } from './boss';
import { registerHandlers } from './index';

async function main(): Promise<void> {
  await boss.start();
  await registerHandlers(boss);
  console.log('[worker] ready');

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      console.log(`[worker] received ${sig}, shutting down…`);
      boss.stop({ graceful: true }).then(() => {
        process.exit(0);
      }).catch((err: unknown) => {
        console.error('[worker] stop error:', err);
        process.exit(1);
      });
    });
  }
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
