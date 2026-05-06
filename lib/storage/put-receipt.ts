import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { r2, R2_BUCKET } from './r2';

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg':      'jpg',
  'image/png':       'png',
};
const MAX_BYTES = 10 * 1024 * 1024;

interface Args {
  userId: string;
  transactionId: string;
  body: Buffer;
  contentType: string;
  originalFilename: string;
}

export async function putReceiptObject(args: Args): Promise<{ key: string }> {
  if (!ALLOWED.has(args.contentType)) throw new Error(`Unsupported content type: ${args.contentType}`);
  if (args.body.byteLength > MAX_BYTES) throw new Error('File exceeds 10 MB limit');
  const ext = EXT[args.contentType]!;
  const key = `${args.userId}/receipts/${args.transactionId}/${randomUUID()}.${ext}`;
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: args.body,
    ContentLength: args.body.byteLength,
    ContentType: args.contentType,
  }));
  return { key };
}
