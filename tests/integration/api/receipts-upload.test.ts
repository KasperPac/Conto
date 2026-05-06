import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { testDb, resetTestDb, seedUserAndAccount } from '../../helpers/db';
import { POST } from '@/app/api/receipts/upload/route';

// Minimal 1×1 white PNG (base64)
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

// Mock putReceiptObject so tests don't hit real R2
vi.mock('@/lib/storage/put-receipt', () => ({
  putReceiptObject: vi.fn().mockResolvedValue({ key: 'test-user/receipts/test-tx/uuid.png' }),
}));

async function makeRequest(userId: string, txId: string, contentType = 'image/png') {
  const buf = Buffer.from(PNG_B64, 'base64');
  const file = new File([buf], 'receipt.png', { type: contentType });
  const fd = new FormData();
  fd.append('file', file);
  fd.append('transactionId', txId);

  const mod = await import('@/lib/auth/server');
  vi.spyOn(mod, 'getCurrentUserId').mockResolvedValue(userId);

  return POST(new Request('http://localhost/api/receipts/upload', { method: 'POST', body: fd }));
}

describe('POST /api/receipts/upload', () => {
  let userId: string;
  let accountId: string;
  let txId: string;

  beforeEach(async () => {
    await resetTestDb();
    ({ userId, accountId } = await seedUserAndAccount());
    const [t] = await withUser(userId, db =>
      db.insert(transactions).values({
        userId, accountId,
        postedDate: '2026-05-01',
        descriptionRaw: 'Coffee',
        amountCents: BigInt(-500),
        classificationSource: 'unclassified',
      }).returning({ id: transactions.id }),
    );
    txId = t!.id;
  });

  it('returns 200 and updates the transaction', async () => {
    const res = await makeRequest(userId, txId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const [row] = await testDb.select().from(transactions).where(eq(transactions.id, txId));
    expect(row!.receiptFilename).toBe('receipt.png');
    expect(row!.receiptContentType).toBe('image/png');
    expect(row!.receiptObjectKey).toMatch(/receipts\//);
  });

  it('returns 403 for unknown transactionId', async () => {
    const res = await makeRequest(userId, '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(403);
  });

  it('returns 400 for unsupported content type', async () => {
    const res = await makeRequest(userId, txId, 'text/plain');
    expect(res.status).toBe(400);
  });
});
