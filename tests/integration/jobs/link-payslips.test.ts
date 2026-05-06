import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactions, transactionLinks, payslips } from '@/lib/db/schema';
import { resetTestDb, seedUserAndAccount } from '../../helpers/db';
import { runLinkPayslips } from '@/lib/jobs/link-payslips';

describe('runLinkPayslips', () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await resetTestDb();
    ({ userId, accountId } = await seedUserAndAccount());
  });

  it('auto-confirms high-confidence match (same-day + employer name)', async () => {
    await withUser(userId, async (tx) => {
      await tx.insert(transactions).values({
        userId, accountId, postedDate: '2026-05-01',
        descriptionRaw: 'ACME PAYROLL', amountCents: BigInt(423456),
        classificationSource: 'unclassified',
      });
      await tx.insert(payslips).values({
        userId, employer: 'Acme Corp', periodStart: '2026-04-16', periodEnd: '2026-04-30',
        payDate: '2026-05-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(36544), netCents: BigInt(423456), source: 'manual',
      });
    });

    await runLinkPayslips(userId);

    const links = await withUser(userId, tx =>
      tx.select().from(transactionLinks).where(and(eq(transactionLinks.userId, userId), eq(transactionLinks.linkType, 'income'))),
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.source).toBe('auto');
    expect(parseFloat(links[0]!.confidence ?? '0')).toBeGreaterThanOrEqual(0.90);
  });

  it('marks low-confidence match as suggested', async () => {
    await withUser(userId, async (tx) => {
      await tx.insert(transactions).values({
        userId, accountId, postedDate: '2026-05-03',
        descriptionRaw: 'DEPOSIT', amountCents: BigInt(423456),
        classificationSource: 'unclassified',
      });
      await tx.insert(payslips).values({
        userId, employer: 'Acme Corp', periodStart: '2026-04-16', periodEnd: '2026-04-30',
        payDate: '2026-05-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(36544), netCents: BigInt(423456), source: 'manual',
      });
    });

    await runLinkPayslips(userId);

    const links = await withUser(userId, tx =>
      tx.select().from(transactionLinks).where(and(eq(transactionLinks.userId, userId), eq(transactionLinks.linkType, 'income'))),
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.source).toBe('suggested');
  });

  it('skips payslips that already have an income link', async () => {
    let payslipId: string;
    let txId: string;
    await withUser(userId, async (tx) => {
      const [t] = await tx.insert(transactions).values({
        userId, accountId, postedDate: '2026-05-01',
        descriptionRaw: 'DEPOSIT', amountCents: BigInt(423456),
        classificationSource: 'unclassified',
      }).returning({ id: transactions.id });
      txId = t!.id;
      const [p] = await tx.insert(payslips).values({
        userId, employer: 'Acme Corp', periodStart: '2026-04-16', periodEnd: '2026-04-30',
        payDate: '2026-05-01', grossCents: BigInt(600000), taxWithheldCents: BigInt(140000),
        superCents: BigInt(36544), netCents: BigInt(423456), source: 'manual',
      }).returning({ id: payslips.id });
      payslipId = p!.id;
      await tx.insert(transactionLinks).values({
        userId, linkType: 'income', fromTransactionId: txId!, payslipId: payslipId!,
        confidence: '0.700', source: 'user',
      });
    });

    await runLinkPayslips(userId);

    const links = await withUser(userId, tx =>
      tx.select().from(transactionLinks).where(and(eq(transactionLinks.userId, userId), eq(transactionLinks.linkType, 'income'))),
    );
    expect(links).toHaveLength(1); // not duplicated
  });
});
