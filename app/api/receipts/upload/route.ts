import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { putReceiptObject } from '@/lib/storage/put-receipt';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export async function POST(req: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (e instanceof Error && e.message.includes('headers')) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    throw e;
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 }); }

  const file = formData.get('file');
  const transactionId = formData.get('transactionId');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (typeof transactionId !== 'string' || !transactionId) return NextResponse.json({ error: 'transactionId required' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: `Unsupported content type: ${file.type}` }, { status: 400 });

  // Verify transaction ownership
  const [tx] = await withUser(userId, db =>
    db.select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId))),
  );
  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 403 });

  const body = Buffer.from(await file.arrayBuffer());
  let key: string;
  try {
    ({ key } = await putReceiptObject({
      userId,
      transactionId,
      body,
      contentType: file.type,
      originalFilename: file.name,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Unsupported') || msg.includes('10 MB')) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: 'Upload failed', detail: msg }, { status: 502 });
  }

  await withUser(userId, db =>
    db.update(transactions)
      .set({
        receiptObjectKey:   key,
        receiptFilename:    file.name,
        receiptContentType: file.type,
        receiptUploadedAt:  new Date(),
      })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId))),
  );

  return NextResponse.json({ ok: true, key });
}
