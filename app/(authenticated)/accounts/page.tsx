import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getAccountsWithBalance } from '@/lib/db/queries/accounts';
import { RenameAccount } from './rename-account';

function formatCents(cents: bigint, currency: string): string {
  const n = Number(cents) / 100;
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(n);
}

export default async function AccountsPage() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/login');
    throw e;
  }

  const rows = await getAccountsWithBalance(userId);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Accounts</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No accounts yet. Upload a statement to create one.</p>
      ) : (
        <div className="divide-y border rounded-lg">
          {rows.map(acc => (
            <div key={acc.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <RenameAccount id={acc.id} name={acc.name} />
                <p className="text-xs text-zinc-500 mt-0.5">{acc.institution} · {acc.type}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatCents(acc.balanceCents, acc.currency)}</p>
                <Link
                  href={`/accounts/${acc.id}/transactions`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Transactions
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
