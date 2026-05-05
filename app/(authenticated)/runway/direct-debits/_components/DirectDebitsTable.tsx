'use client';
import { useState, useMemo } from 'react';
import type { DirectDebit } from '@/lib/types/cashflow';

type SortKey = 'merchantName' | 'kind' | 'cadence' | 'lastSeenDate' | 'nextExpectedDate' | 'status';

export default function DirectDebitsTable({ rows }: { rows: DirectDebit[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('nextExpectedDate');
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = String(a[sortKey] ?? '');
    const bv = String(b[sortKey] ?? '');
    return asc ? av.localeCompare(bv) : bv.localeCompare(av);
  }), [rows, sortKey, asc]);

  function handleSort(k: SortKey) {
    if (sortKey === k) setAsc(a => !a);
    else { setSortKey(k); setAsc(true); }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No direct debits or recurring pulls detected yet. Upload bank statements to see them here.</p>;
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: 'merchantName', label: 'Merchant' },
    { key: 'kind', label: 'Kind' },
    { key: 'cadence', label: 'Cadence' },
    { key: 'lastSeenDate', label: 'Last seen' },
    { key: 'nextExpectedDate', label: 'Next expected' },
    { key: 'status', label: 'Status' },
  ];

  return (
    <table className="w-full text-sm">
      <thead className="border-b">
        <tr>
          {headers.map(h => (
            <th key={h.key} onClick={() => handleSort(h.key)}
                className="text-left p-2 cursor-pointer select-none hover:bg-zinc-50">
              {h.label} {sortKey === h.key ? (asc ? '↑' : '↓') : ''}
            </th>
          ))}
          <th className="text-left p-2">Amount range</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={String(r.groupId)} className="border-b hover:bg-zinc-50">
            <td className="p-2 font-medium">{r.merchantName}</td>
            <td className="p-2 text-zinc-600">{r.kind}</td>
            <td className="p-2 text-zinc-600">{r.cadence}</td>
            <td className="p-2 font-mono text-xs">{String(r.lastSeenDate)}</td>
            <td className="p-2 font-mono text-xs">{String(r.nextExpectedDate)}</td>
            <td className="p-2">
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
                {r.status}
              </span>
            </td>
            <td className="p-2 tabular-nums text-xs text-zinc-600">
              {(Number(r.observedAmountLowCents) / 100).toFixed(2)} &ndash; {(Number(r.observedAmountHighCents) / 100).toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
