import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { Nav } from '@/components/nav';
import { getSuggestedLinks } from '@/lib/db/queries/transaction-links';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const u = user!;
  const suggested = await getSuggestedLinks(u.id).catch(() => []);
  return (
    <div className="min-h-screen">
      <Nav userLabel={u.name ?? u.email} pendingSuggestions={suggested.length} />
      <main className="p-6 max-w-4xl mx-auto">{children}</main>
    </div>
  );
}
