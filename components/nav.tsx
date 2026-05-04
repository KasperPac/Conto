'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';

export function Nav({ userLabel }: { userLabel: string }) {
  const router = useRouter();
  async function onSignOut() {
    await signOut();
    router.push('/sign-in');
    router.refresh();
  }
  return (
    <nav className="border-b">
      <div className="max-w-4xl mx-auto p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="font-semibold">Conto</Link>
          <Link href="/upload" className="text-sm text-zinc-700">Upload</Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600">{userLabel}</span>
          <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
        </div>
      </div>
    </nav>
  );
}
