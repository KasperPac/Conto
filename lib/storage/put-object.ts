import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { r2, R2_BUCKET } from './r2';

interface Args {
  userId: string;
  body: Uint8Array | Buffer;
  contentType: string;
  originalFilename: string;
}

export async function putObject(args: Args): Promise<{ key: string }> {
  const safeName = args.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const key = `${args.userId}/${randomUUID()}/${safeName}`;
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: args.body,
    ContentType: args.contentType,
  }));
  return { key };
}
