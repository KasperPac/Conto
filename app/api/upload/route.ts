import { NextResponse } from 'next/server';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { putObject } from '@/lib/storage/put-object';
import { createStatement } from '@/lib/db/queries/statements';
import { boss } from '@/lib/jobs/boss';

export async function POST(req: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    // next/headers throws when called outside a Next.js request scope (e.g. in tests);
    // treat that as unauthenticated so integration tests can exercise the 401 path.
    if (e instanceof Error && e.message.includes('headers')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    throw e;
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const arrayBuf = await file.arrayBuffer();
  const body = Buffer.from(arrayBuf);

  let key: string;
  try {
    ({ key } = await putObject({
      userId,
      body,
      contentType: file.type || 'application/octet-stream',
      originalFilename: file.name,
    }));
  } catch (err) {
    return NextResponse.json({ error: 'R2 upload failed', detail: String(err) }, { status: 502 });
  }

  let statementId: string;
  try {
    statementId = await createStatement(userId, {
      sourceFilename: file.name,
      sourceObjectKey: key,
      format: 'pdf',
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create statement record', detail: String(err) }, { status: 502 });
  }

  try {
    await boss.send('parse-statement', { statementId, userId, sourceObjectKey: key });
  } catch (err) {
    return NextResponse.json({
      error: 'Upload succeeded but job enqueue failed',
      statementId, detail: String(err),
    }, { status: 502 });
  }

  return NextResponse.json({ ok: true, statementId });
}
