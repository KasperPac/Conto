import type { PgBoss, JobWithMetadata } from 'pg-boss';
import { and, between, eq, gt, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactionLinks, transactions, payCadences } from '@/lib/db/schema';
import { getPayslipsForLinkingJob } from '@/lib/db/queries/payslips';
import { matchPayslipToIncome } from '@/lib/domain/payslip-linking';
import { toCents } from '@/lib/types/money';

interface Payload { userId: string }

export async function registerLinkPayslips(boss: PgBoss): Promise<void> {
  await boss.createQueue('link-payslips').catch(() => {});
  await boss.work<Payload>('link-payslips', { batchSize: 4, localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs as JobWithMetadata<Payload>[]) {
      const { userId } = job.data;
      try {
        await runLinkPayslips(userId);
      } catch (err) {
        console.error(`[link-payslips] jobId=${job.id} userId=${userId}`, err);
        throw err;
      }
    }
  });
}

export async function runLinkPayslips(userId: string): Promise<void> {
  const unlinkedPayslips = await getPayslipsForLinkingJob(userId);
  if (unlinkedPayslips.length === 0) return;

  await withUser(userId, async (tx) => {
    const cadences = await tx
      .select({ employer: payCadences.employer, cadence: payCadences.cadence })
      .from(payCadences)
      .where(and(eq(payCadences.userId, userId), eq(payCadences.active, true)));

    // Already-linked transaction IDs (avoid re-linking the same deposit)
    const linkedTxSub = tx
      .select({ fromTransactionId: transactionLinks.fromTransactionId })
      .from(transactionLinks)
      .where(and(eq(transactionLinks.userId, userId), eq(transactionLinks.linkType, 'income')));

    for (const payslip of unlinkedPayslips) {
      // Window: payDate ±7 days
      const payMs = new Date(payslip.payDate).getTime();
      const windowStart = new Date(payMs - 7 * 86_400_000).toISOString().slice(0, 10);
      const windowEnd   = new Date(payMs + 7 * 86_400_000).toISOString().slice(0, 10);

      const candidateRows = await tx
        .select({
          id: transactions.id,
          postedDate: transactions.postedDate,
          amountCents: transactions.amountCents,
          descriptionRaw: transactions.descriptionRaw,
        })
        .from(transactions)
        .where(and(
          eq(transactions.userId, userId),
          gt(transactions.amountCents, BigInt(0)),
          between(transactions.postedDate, windowStart, windowEnd),
          sql`${transactions.id} NOT IN (${linkedTxSub})`,
        ));

      // DB returns amountCents as bigint; cast to Cents before matching
      const candidateTxs = candidateRows.map(r => ({
        ...r,
        amountCents: toCents(r.amountCents),
      }));

      const matches = matchPayslipToIncome(payslip, candidateTxs, cadences);
      if (matches.length === 0) continue;

      const best = matches[0]!;
      // Use the rounded value for the threshold check to avoid floating-point drift
      // e.g. 0.70 + 0.20 = 0.8999999999999999 < 0.90, but rounds to 0.900
      const storedConfidence = best.confidence.toFixed(3);
      const roundedConfidence = parseFloat(storedConfidence);
      await tx.insert(transactionLinks).values({
        userId,
        linkType: 'income',
        fromTransactionId: best.transactionId,
        toTransactionId: null,
        payslipId: payslip.id,
        confidence: storedConfidence,
        source: roundedConfidence >= 0.90 ? 'auto' : 'suggested',
      }).onConflictDoNothing();
    }
  });
}
