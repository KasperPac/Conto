import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { parseEnv } from '@/lib/types/env';

const env = parseEnv();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accountsAuth,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.BETTER_AUTH_URL],
  advanced: {
    database: {
      // users.id is a uuid column; session/account ids are text.
      // Using a JS function ensures UUIDs are always passed as values
      // (not deferred to gen_random_uuid() which only works on uuid columns).
      generateId: () => crypto.randomUUID(),
    },
  },
});
