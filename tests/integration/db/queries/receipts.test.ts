import { describe, it, expect, beforeEach } from 'vitest';
import 'dotenv/config';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { resetTestDb, testDb, seedUserAndAccount } from '@/tests/helpers/db';
import { getReceiptsByFY } from '@/lib/db/queries/receipts';

describe('getReceiptsByFY', () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await resetTestDb();
    ({ userId, accountId } = await seedUserAndAccount());
    await withUser(userId, db =>
      db.insert(transactions).values([
        { userId, accountId, postedDate: '2025-08-01', descriptionRaw: 'A', amountCents: BigInt(-100),
          classificationSource: 'unclassified', receiptObjectKey: 'u/receipts/tx1/file.pdf',
          receiptFilename: 'invoice.pdf', receiptContentType: 'application/pdf', receiptUploadedAt: new Date() },
        { userId, accountId, postedDate: '2025-09-01', descriptionRaw: 'B', amountCents: BigInt(-200),
          classificationSource: 'unclassified' }, // no receipt
        { userId, accountId, postedDate: '2024-08-01', descriptionRaw: 'C', amountCents: BigInt(-300),
          classificationSource: 'unclassified', receiptObjectKey: 'u/receipts/tx3/file.png',
          receiptFilename: 'photo.png', receiptContentType: 'image/png', receiptUploadedAt: new Date() },
      ]),
    );
  });

  it('returns only receipted transactions in FY range', async () => {
    const rows = await getReceiptsByFY(userId, '2025-07-01', '2026-06-30');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.descriptionRaw).toBe('A');
    expect(rows[0]!.receiptFilename).toBe('invoice.pdf');
  });

  it('returns empty for FY with no receipts', async () => {
    const rows = await getReceiptsByFY(userId, '2026-07-01', '2027-06-30');
    expect(rows).toHaveLength(0);
  });
});
