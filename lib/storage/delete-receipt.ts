import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET } from './r2';

export async function deleteReceiptObject(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}
