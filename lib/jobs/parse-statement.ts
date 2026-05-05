import type { PgBoss } from 'pg-boss';
import { getObject } from '@/lib/storage/get-object';
import { dispatch, UnknownFormatError } from '@/lib/parsers/pdf/index';
import { createStatement, updateStatement } from '@/lib/db/queries/statements';
import { findOrCreateAccount } from '@/lib/db/queries/accounts';
import { bulkInsertTransactions } from '@/lib/db/queries/transactions';

interface Payload {
  statementId: string;
  userId: string;
  sourceObjectKey: string;
}

export async function registerParseStatement(boss: PgBoss): Promise<void> {
  await boss.createQueue('parse-statement').catch(() => {});
  await boss.work<Payload>('parse-statement', { batchSize: 2, localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const { statementId, userId, sourceObjectKey } = job.data;
      try {
        const buf = await getObject(sourceObjectKey);
        let parsed;
        try {
          parsed = await dispatch(buf);
        } catch (e) {
          if (e instanceof UnknownFormatError) {
            await updateStatement(userId, statementId, { status: 'failed', parseError: 'unknown_format' });
            return;
          }
          throw e;
        }

        const accountId = await findOrCreateAccount(userId, {
          institution: parsed.institution,
          accountNumberFragment: parsed.account_number_fragment,
          accountType: parsed.account_type,
          periodStart: parsed.period_start,
        });

        await updateStatement(userId, statementId, {
          accountId,
          parserTemplate: parsed.template_id,
          periodStart: parsed.period_start,
          periodEnd: parsed.period_end,
          status: 'parsing',
        });

        await bulkInsertTransactions(userId, accountId, statementId, parsed.rows);

        await updateStatement(userId, statementId, {
          status: 'parsed',
          parsedAt: new Date(),
        });
      } catch (err) {
        await updateStatement(userId, statementId, {
          status: 'failed',
          parseError: String(err),
        }).catch(() => {});
        throw err;
      }
    }
  });
}
