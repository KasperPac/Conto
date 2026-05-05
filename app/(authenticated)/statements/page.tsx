import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getStatements } from '@/lib/db/queries/statements';
import { Badge } from '@/components/ui/badge';

function statusBadge(status: string) {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'secondary',
    parsing: 'outline',
    parsed: 'default',
    failed: 'destructive',
  };
  return <Badge variant={map[status] ?? 'secondary'}>{status}</Badge>;
}

function formatDate(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function StatementsPage() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/login');
    throw e;
  }

  const rows = await getStatements(userId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Statements</h1>
        <Link href="/upload" className="text-sm underline underline-offset-2">Upload new</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No statements yet.{' '}
          <Link href="/upload" className="underline">Upload one.</Link>
        </p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="py-2 pr-4 font-medium">File</th>
              <th className="py-2 pr-4 font-medium">Period</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Uploaded</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-zinc-50">
                <td className="py-2 pr-4 font-mono text-xs truncate max-w-48">{row.sourceFilename}</td>
                <td className="py-2 pr-4">
                  {row.periodStart && row.periodEnd
                    ? `${formatDate(row.periodStart)} – ${formatDate(row.periodEnd)}`
                    : '—'}
                </td>
                <td className="py-2 pr-4">{statusBadge(row.status)}</td>
                <td className="py-2 pr-4 text-zinc-500">{formatDate(row.uploadedAt)}</td>
                <td className="py-2">
                  {row.status === 'parsed' && row.accountId ? (
                    <Link
                      href={`/accounts/${row.accountId}/transactions`}
                      className="text-blue-600 hover:underline"
                    >
                      View transactions
                    </Link>
                  ) : row.status === 'failed' ? (
                    <span className="text-red-500 text-xs">{row.parseError ?? 'error'}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
