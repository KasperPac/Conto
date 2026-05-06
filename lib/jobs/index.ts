import type { PgBoss } from 'pg-boss';
import { registerParseStatement } from './parse-statement';
import { registerDetectTransfers } from './detect-transfers';
import { registerLinkPayslips } from './link-payslips';
import { projectExpectedEvents } from './project-expected-events';
import { matchExpectedEventsForTransaction } from './match-expected-events';
import { registerTaxObligations } from './tax-obligations';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

export async function registerHandlers(boss: PgBoss): Promise<void> {
  await registerParseStatement(boss);
  await registerDetectTransfers(boss);
  await registerLinkPayslips(boss);

  await boss.createQueue('project-expected-events').catch(() => {});
  await boss.work('project-expected-events', async (jobs) => {
    for (const job of jobs as { data: { userId: string; horizonDays?: number } }[]) {
      const { userId, horizonDays } = job.data;
      await projectExpectedEvents(userId, horizonDays ?? 90);
    }
  });

  await boss.createQueue('project-expected-events-fanout').catch(() => {});
  await boss.work('project-expected-events-fanout', async () => {
    const ids = await db.select({ id: users.id }).from(users);
    for (const { id } of ids) {
      await boss.send('project-expected-events', { userId: id });
    }
  });

  await boss.createQueue('match-expected-events').catch(() => {});
  await boss.work('match-expected-events', async (jobs) => {
    for (const job of jobs as { data: { transactionId: string } }[]) {
      await matchExpectedEventsForTransaction(job.data.transactionId);
    }
  });

  await registerTaxObligations(boss);
}
