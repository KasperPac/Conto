import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getDirectDebitRegister } from '@/lib/db/queries/direct-debits-list';
import DirectDebitsTable from './_components/DirectDebitsTable';

interface Props { searchParams: Promise<Record<string, string>>; }

export default async function DirectDebitsPage({ searchParams }: Props) {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const sp = await searchParams;
  const rows = await getDirectDebitRegister(userId, {
    activeOnly: sp.active === '1',
    recentlyChanged: sp.changed === '1',
  });

  return (
    <div className="p-6">
      <header className="flex items-center gap-4 mb-4">
        <h1 className="text-xl font-semibold">Direct debits &amp; recurring pulls</h1>
      </header>
      <nav className="flex gap-3 text-sm mb-4">
        <a href="/runway/direct-debits" className={`underline ${!sp.active && !sp.changed ? 'font-semibold' : ''}`}>All</a>
        <a href="/runway/direct-debits?active=1" className={`underline ${sp.active === '1' ? 'font-semibold' : ''}`}>Active only</a>
        <a href="/runway/direct-debits?changed=1" className={`underline ${sp.changed === '1' ? 'font-semibold' : ''}`}>Recently changed</a>
      </nav>
      <DirectDebitsTable rows={rows} />
    </div>
  );
}
