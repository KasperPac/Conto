'use client';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  // baseURL inferred from window.location at runtime; no env access in client.
});

export const { signIn, signUp, signOut, useSession } = authClient;
