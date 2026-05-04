import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/upload/route';

describe('POST /api/upload', () => {
  it('returns 401 when unauthenticated', async () => {
    const req = new Request('http://localhost:3000/api/upload', {
      method: 'POST',
      body: new FormData(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
