'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';

export function Nav({ userLabel, pendingSuggestions = 0 }: { userLabel: string; pendingSuggestions?: number }) {
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
          <Link href="/statements" className="text-sm text-zinc-700 hover:text-zinc-900">Statements</Link>
          <Link href="/accounts" className="text-sm text-zinc-700 hover:text-zinc-900">Accounts</Link>
          <Link href="/transfers" className="text-sm text-zinc-700 hover:text-zinc-900 flex items-center gap-1">
            Transfers
            {pendingSuggestions > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 leading-none">
                {pendingSuggestions}
              </span>
            )}
          </Link>
          <Link href="/runway" className="text-sm text-zinc-700 hover:text-zinc-900">Runway</Link>
          <Link href="/categories" className="text-sm text-zinc-700 hover:text-zinc-900">Categories</Link>
          <Link href="/upload" className="text-sm text-zinc-700 hover:text-zinc-900">Upload</Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600">{userLabel}</span>
          <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
        </div>
      </div>
    </nav>
  );
}
