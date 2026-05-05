import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getSuggestedLinks, getConfirmedLinks } from '@/lib/db/queries/transaction-links';
import { getTransactions } from '@/lib/db/queries/transactions';
import { getAccountsWithBalance } from '@/lib/db/queries/accounts';
import {
  confirmTransferLink,
  dismissTransferLink,
  createManualTransferLink,
  unlinkTransferTransactions,
} from '@/app/actions/transfers';

interface Props {
  searchParams: Promise<Record<string, string>>;
}

function fmtAmount(cents: bigint) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
    .format(Number(cents) / 100);
}

function TypeBadge({ type }: { type: string }) {
  return type === 'cc_payment'
    ? <span className="text-xs border border-purple-300 text-purple-700 rounded px-1.5 py-0.5">CC pmt</span>
    : <span className="text-xs border border-blue-300 text-blue-700 rounded px-1.5 py-0.5">Transfer</span>;
}

function SourceBadge({ source }: { source: string }) {
  return source === 'user'
    ? <span className="text-xs border border-green-300 text-green-700 rounded px-1.5 py-0.5">User</span>
    : <span className="text-xs border border-zinc-300 text-zinc-500 rounded px-1.5 py-0.5">Auto</span>;
}

export default async function TransfersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const tab = sp['tab'] ?? 'suggested';

  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in');
    throw e;
  }

  const suggested = tab === 'suggested' ? await getSuggestedLinks(userId) : [];
  const confirmed = tab === 'linked'    ? await getConfirmedLinks(userId)  : [];

  const search   = sp['search']   ?? '';
  const fromTxId = sp['fromTxId'] ?? '';
  const toTxId   = sp['toTxId']   ?? '';

  let searchResults: Awaited<ReturnType<typeof getTransactions>> = [];
  if (tab === 'manual' && search) {
    const allAccounts = await getAccountsWithBalance(userId);
    const perAccount = await Promise.all(
      allAccounts.map(a => getTransactions(userId, a.id, { search, limit: 10 }))
    );
    searchResults = perAccount.flat().slice(0, 20);
  }

  const tabs = [
    { key: 'suggested', label: 'Suggested' },
    { key: 'linked',    label: 'Linked' },
    { key: 'manual',    label: '+ Manual' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transfers &amp; CC payments</h1>

      {/* Tab bar */}
      <div className="flex border-b">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={`/transfers?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            {t.label}
            {t.key === 'suggested' && suggested.length > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">
                {suggested.length}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Suggested tab */}
      {tab === 'suggested' && (
        suggested.length === 0 ? (
          <p className="text-sm text-zinc-500">No pending suggestions.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="py-2 pr-4 font-medium">From</th>
                <th className="py-2 pr-4 font-medium">To</th>
                <th className="py-2 pr-4 font-medium text-right">Amount</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Match</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {suggested.map(row => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium truncate max-w-[160px]">{row.fromAccountName}</div>
                    <div className="text-xs text-zinc-500">{row.fromDate} · {row.fromDesc.slice(0, 30)}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="font-medium truncate max-w-[160px]">{row.toAccountName ?? '—'}</div>
                    <div className="text-xs text-zinc-500">{row.toDate ?? '—'} · {(row.toDesc ?? '').slice(0, 30)}</div>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {fmtAmount(row.fromAmountCents < 0n ? -row.fromAmountCents : row.fromAmountCents)}
                  </td>
                  <td className="py-2 pr-4"><TypeBadge type={row.linkType} /></td>
                  <td className="py-2 pr-4">
                    <span className="text-xs bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">
                      {row.confidence ? `${Math.round(Number(row.confidence) * 100)}%` : '—'}
                    </span>
                  </td>
                  <td className="py-2 flex gap-2 justify-end">
                    <form action={confirmTransferLink.bind(null, row.id)}>
                      <button className="text-xs border rounded px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100">
                        Confirm
                      </button>
                    </form>
                    <form action={dismissTransferLink.bind(null, row.id)}>
                      <button className="text-xs border rounded px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100">
                        Dismiss
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* Linked tab */}
      {tab === 'linked' && (
        confirmed.length === 0 ? (
          <p className="text-sm text-zinc-500">No confirmed links yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="py-2 pr-4 font-medium">From</th>
                <th className="py-2 pr-4 font-medium">To</th>
                <th className="py-2 pr-4 font-medium text-right">Amount</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {confirmed.map(row => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium truncate max-w-[160px]">{row.fromAccountName}</div>
                    <div className="text-xs text-zinc-500">{row.fromDate} · {row.fromDesc.slice(0, 30)}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="font-medium truncate max-w-[160px]">{row.toAccountName ?? '—'}</div>
                    <div className="text-xs text-zinc-500">{row.toDate ?? '—'} · {(row.toDesc ?? '').slice(0, 30)}</div>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {fmtAmount(row.fromAmountCents < 0n ? -row.fromAmountCents : row.fromAmountCents)}
                  </td>
                  <td className="py-2 pr-4"><TypeBadge type={row.linkType} /></td>
                  <td className="py-2 pr-4"><SourceBadge source={row.source} /></td>
                  <td className="py-2 text-right">
                    <form action={unlinkTransferTransactions.bind(null, row.id)}>
                      <button className="text-xs border rounded px-2 py-1 text-zinc-500 hover:bg-zinc-50">
                        Unlink
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* Manual tab */}
      {tab === 'manual' && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-500">
            Search for a transaction, select it as the &quot;From&quot; leg, then search for the counterpart.
          </p>

          {/* Step 1: select From */}
          {!fromTxId && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Step 1 — Select &quot;From&quot; transaction</h3>
              <form className="flex gap-2" method="GET">
                <input type="hidden" name="tab" value="manual" />
                <input name="search" defaultValue={search} className="border rounded px-2 py-1 text-sm flex-1" placeholder="Search description or amount" />
                <button type="submit" className="border rounded px-3 py-1 text-sm bg-zinc-100 hover:bg-zinc-200">Search</button>
              </form>
              {searchResults.length > 0 && (
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {searchResults.map(r => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-zinc-50">
                        <td className="py-1.5 pr-4 text-zinc-500 whitespace-nowrap">{r.postedDate}</td>
                        <td className="py-1.5 pr-4 max-w-xs truncate">{r.descriptionRaw}</td>
                        <td className={`py-1.5 pr-4 tabular-nums text-right ${Number(r.amountCents) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {fmtAmount(r.amountCents)}
                        </td>
                        <td className="py-1.5 text-right">
                          <Link
                            href={`/transfers?tab=manual&fromTxId=${r.id}&search=${encodeURIComponent(search)}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Select →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Step 2: select To */}
          {fromTxId && !toTxId && (
            <div className="space-y-3">
              <div className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">
                From transaction selected. Now search for the counterpart.
              </div>
              <h3 className="text-sm font-medium">Step 2 — Select &quot;To&quot; transaction</h3>
              <form className="flex gap-2" method="GET">
                <input type="hidden" name="tab" value="manual" />
                <input type="hidden" name="fromTxId" value={fromTxId} />
                <input name="search" defaultValue={search} className="border rounded px-2 py-1 text-sm flex-1" placeholder="Search description or amount" />
                <button type="submit" className="border rounded px-3 py-1 text-sm bg-zinc-100 hover:bg-zinc-200">Search</button>
              </form>
              {searchResults.length > 0 && (
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {searchResults.map(r => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-zinc-50">
                        <td className="py-1.5 pr-4 text-zinc-500 whitespace-nowrap">{r.postedDate}</td>
                        <td className="py-1.5 pr-4 max-w-xs truncate">{r.descriptionRaw}</td>
                        <td className={`py-1.5 pr-4 tabular-nums text-right ${Number(r.amountCents) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {fmtAmount(r.amountCents)}
                        </td>
                        <td className="py-1.5 text-right">
                          <Link
                            href={`/transfers?tab=manual&fromTxId=${fromTxId}&toTxId=${r.id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Select →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Step 3: confirm */}
          {fromTxId && toTxId && (
            <div className="space-y-3">
              <div className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">
                Both transactions selected. Choose link type and confirm.
              </div>
              <form className="flex items-center gap-3" action={async (fd: FormData) => {
                'use server';
                const lt = (fd.get('linkType') ?? 'transfer') as 'transfer' | 'cc_payment';
                await createManualTransferLink(fromTxId, toTxId, lt);
              }}>
                <select name="linkType" className="border rounded px-2 py-1 text-sm" defaultValue="transfer">
                  <option value="transfer">Transfer</option>
                  <option value="cc_payment">CC payment</option>
                </select>
                <button type="submit" className="border rounded px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700">
                  Create link
                </button>
                <Link href="/transfers?tab=manual" className="text-sm text-zinc-500 hover:underline">Cancel</Link>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
