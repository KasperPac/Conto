import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getReceiptsByFY } from '@/lib/db/queries/receipts';
import { getReceiptSignedUrl } from '@/lib/storage/get-signed-url';
import { fyBounds, currentFyYear } from '@/lib/domain/fy';

interface Props { searchParams: Promise<Record<string, string>> }

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

export default async function ReceiptsPage({ searchParams }: Props) {
  const CURRENT_FY = currentFyYear();
  const FY_RANGE = [CURRENT_FY, CURRENT_FY - 1, CURRENT_FY - 2];

  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const sp = await searchParams;
  const fy = parseInt(sp['fy'] ?? String(CURRENT_FY), 10);
  const { start, end } = fyBounds(fy);
  const fyLabel = (y: number) => `FY ${y - 1}–${String(y).slice(2)}`;

  const receipts = await getReceiptsByFY(userId, start, end);
  const withUrls = await Promise.all(
    receipts.map(async r => ({
      ...r,
      signedUrl: await getReceiptSignedUrl(r.receiptObjectKey).catch(() => null),
    })),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Receipts</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {FY_RANGE.map(y => (
          <Link
            key={y}
            href={`/income/receipts?fy=${y}`}
            className={`px-3 py-1 rounded text-sm border ${fy === y ? 'bg-zinc-900 text-white border-zinc-900' : 'text-zinc-600 hover:border-zinc-400'}`}
          >
            {fyLabel(y)}
          </Link>
        ))}
      </div>

      {withUrls.length === 0 && (
        <p className="text-zinc-400 text-sm">No receipts for {fyLabel(fy)}. Attach receipts from the transaction list.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {withUrls.map(r => (
          <div key={r.id} className="border rounded p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <span className="text-sm font-medium truncate">{r.receiptFilename}</span>
              <span className="text-xs text-zinc-400 ml-2 shrink-0">
                {r.receiptContentType === 'application/pdf' ? '📄' : '🖼️'}
              </span>
            </div>
            <p className="text-xs text-zinc-500">{r.postedDate} · {r.descriptionRaw}</p>
            <p className="text-xs text-zinc-500">{fmt(r.amountCents)}</p>
            {r.signedUrl && (
              <a href={r.signedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                View receipt →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
