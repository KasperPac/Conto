import { describe, it, expect, beforeEach } from 'vitest';
import { parseEnv, resetEnvCacheForTests } from '@/lib/types/env';

describe('parseEnv', () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    process.env = { ...ORIGINAL };
    resetEnvCacheForTests();
  });

  it('returns parsed env when all required keys present', () => {
    process.env.DATABASE_URL = 'postgres://x:y@localhost:5432/z';
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.R2_ACCOUNT_ID = 'a';
    process.env.R2_ACCESS_KEY_ID = 'a';
    process.env.R2_SECRET_ACCESS_KEY = 'a';
    process.env.R2_BUCKET = 'b';
    const env = parseEnv();
    expect(env.DATABASE_URL).toBe('postgres://x:y@localhost:5432/z');
  });

  it('throws a readable error naming the missing key', () => {
    delete process.env.DATABASE_URL;
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    expect(() => parseEnv()).toThrowError(/DATABASE_URL/);
  });
});
