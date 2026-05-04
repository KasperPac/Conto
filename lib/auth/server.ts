import { headers } from 'next/headers';
import { auth } from './better-auth';

export class UnauthenticatedError extends Error {
  constructor() {
    super('Unauthenticated');
    this.name = 'UnauthenticatedError';
  }
}

export async function getCurrentUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new UnauthenticatedError();
  return session.user.id;
}

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
