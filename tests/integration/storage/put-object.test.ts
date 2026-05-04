import { describe, it, expect } from 'vitest';
import { HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET } from '@/lib/storage/r2';
import { putObject } from '@/lib/storage/put-object';
import 'dotenv/config';

describe('putObject', () => {
  it('uploads to R2 and returns a user-prefixed key', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const body = Buffer.from(`hello-${Date.now()}`);
    const { key } = await putObject({
      userId, body, contentType: 'text/plain', originalFilename: 'hello.txt',
    });

    expect(key.startsWith(`${userId}/`)).toBe(true);
    expect(key.endsWith('/hello.txt')).toBe(true);

    // Verify the object exists.
    const head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    expect(head.ContentLength).toBe(body.length);

    // Cleanup.
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  });

  it('rejects unsafe filenames by sanitising them', async () => {
    const userId = '00000000-0000-0000-0000-000000000002';
    const { key } = await putObject({
      userId, body: Buffer.from('x'),
      contentType: 'text/plain',
      originalFilename: '../../etc/passwd',
    });
    expect(key.includes('..')).toBe(false);
    expect(key.includes('/etc/')).toBe(false);
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  });
});
