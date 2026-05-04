import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/server';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Welcome, {user?.name ?? user?.email}.</h1>
      <p className="text-sm text-zinc-600">You&apos;re signed in. Phase 0 demo:</p>
      <Link href="/upload" className="inline-block px-4 py-2 border rounded">Upload a file</Link>
    </div>
  );
}
