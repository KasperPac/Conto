import type { PgBoss } from 'pg-boss';
import { getUnlinkedTransactions } from '@/lib/db/queries/transaction-links';
import { detectTransfers } from '@/lib/domain/transfers';
import { withUser } from '@/lib/db/client';
import { transactionLinks, transactions } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

interface Payload { userId: string }

export async function registerDetectTransfers(boss: PgBoss): Promise<void> {
  await boss.createQueue('detect-transfers').catch(() => {});
  await boss.work<Payload>('detect-transfers', { batchSize: 4, localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const { userId } = job.data;
      try {
        const txs = await getUnlinkedTransactions(userId);
        const candidates = detectTransfers(txs);
        if (candidates.length === 0) continue;

        await withUser(userId, async (tx) => {
          await tx.insert(transactionLinks).values(
            candidates.map(c => ({
              userId,
              linkType:          c.linkType,
              fromTransactionId: c.fromTxId,
              toTransactionId:   c.toTxId,
              confidence:        c.confidence.toFixed(3),
              source:            c.confidence >= 0.85 ? 'auto' : 'suggested',
            })),
          ).onConflictDoNothing();

          const autoLinked = candidates.filter(c => c.confidence >= 0.85);
          if (autoLinked.length > 0) {
            const autoIds = autoLinked.flatMap(c => [c.fromTxId, c.toTxId]);
            await tx.update(transactions)
              .set({ isExcludedFromSpending: true })
              .where(and(eq(transactions.userId, userId), inArray(transactions.id, autoIds)));
          }
        });
      } catch (err) {
        console.error(`[detect-transfers] userId=${userId}`, err);
        throw err;
      }
    }
  });
}
