import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getTransactions } from '@/lib/db/queries/transactions';
import { getAccountsWithBalance } from '@/lib/db/queries/accounts';
import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ReclassifyButton } from '@/components/reclassify-modal';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}

function formatCents(cents: bigint): string {
  const n = Number(cents) / 100;
  const sign = n >= 0 ? '+' : '';
  return sign + new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n);
}

function formatBalance(cents: bigint | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

export default async function TransactionsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;

  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/login');
    throw e;
  }

  const filter = {
    from: sp['from'],
    to: sp['to'],
    categoryId: sp['category'],
    search: sp['search'],
    direction: sp['dir'] as 'debit' | 'credit' | undefined,
    limit: 50,
  };

  const [rows, allAccounts, allCategories] = await Promise.all([
    getTransactions(userId, id, filter),
    getAccountsWithBalance(userId),
    db.select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId)),
  ]);

  const account = allAccounts.find(a => a.id === id);
  const hasNextPage = rows.length > 50;
  const displayRows = hasNextPage ? rows.slice(0, 50) : rows;

  const buildUrl = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ ...sp, ...overrides });
    return `/accounts/${id}/transactions?${p.toString()}`;
  };

  const lastRow = displayRows[displayRows.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/accounts" className="text-zinc-500 text-sm hover:underline">Accounts</Link>
        <span className="text-zinc-300">/</span>
        <h1 className="text-xl font-semibold">{account?.name ?? id}</h1>
      </div>

      <form className="flex flex-wrap gap-2 text-sm" method="GET">
        <input name="from" type="date" defaultValue={sp['from']} className="border rounded px-2 py-1" />
        <input name="to" type="date" defaultValue={sp['to']} className="border rounded px-2 py-1" />
        <input name="search" defaultValue={sp['search']} className="border rounded px-2 py-1" placeholder="Search description" />
        <select name="dir" defaultValue={sp['dir']} className="border rounded px-2 py-1">
          <option value="">All</option>
          <option value="debit">Debits</option>
          <option value="credit">Credits</option>
        </select>
        <select name="category" defaultValue={sp['category']} className="border rounded px-2 py-1">
          <option value="">All categories</option>
          {allCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="submit" className="border rounded px-3 py-1 bg-zinc-100 hover:bg-zinc-200">Filter</button>
        <Link href={`/accounts/${id}/transactions`} className="border rounded px-3 py-1 text-zinc-500 hover:bg-zinc-50">Clear</Link>
      </form>

      {displayRows.length === 0 ? (
        <p className="text-sm text-zinc-500">No transactions match your filters.</p>
      ) : (
        <>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium text-right">Amount</th>
                <th className="py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(row => (
                <tr key={row.id} className={`border-b last:border-0 hover:bg-zinc-50 ${row.isExcludedFromSpending ? 'opacity-50' : ''}`}>
                  <td className="py-2 pr-4 whitespace-nowrap text-zinc-500">
                    {new Date(row.postedDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-2 pr-4 max-w-xs truncate">{row.descriptionRaw}</td>
                  <td className="py-2 pr-4">
                    {row.isExcludedFromSpending ? (
                      row.linkType === 'cc_payment'
                        ? <span className="text-xs border border-purple-300 text-purple-700 rounded px-1.5 py-0.5">CC pmt</span>
                        : <span className="text-xs border border-blue-300 text-blue-700 rounded px-1.5 py-0.5">Transfer</span>
                    ) : (
                      <ReclassifyButton
                        transactionId={row.id}
                        description={row.descriptionRaw}
                        currentCategoryId={row.categoryId ?? null}
                        currentCategoryName={row.categoryName ?? null}
                        categories={allCategories}
                      />
                    )}
                  </td>
                  <td className={`py-2 pr-4 text-right tabular-nums font-medium ${Number(row.amountCents) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {formatCents(row.amountCents)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-500">
                    {formatBalance(row.balanceAfterCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasNextPage && lastRow && (
            <Link
              href={buildUrl({ cursor: lastRow.id })}
              className="text-sm text-blue-600 hover:underline"
            >
              Next page →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
