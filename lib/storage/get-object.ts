import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET } from './r2';

export async function getObject(key: string): Promise<Buffer> {
  const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  if (!res.Body) throw new Error(`Empty R2 response for key: ${key}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
