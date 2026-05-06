import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getPayslipsByUser } from '@/lib/db/queries/payslips';
import { PayslipLinkPanel } from '@/components/payslip-link-panel';

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

const statusBadge: Record<string, string> = {
  linked:    'bg-green-100 text-green-700',
  suggested: 'bg-amber-100 text-amber-700',
  unlinked:  'bg-zinc-100 text-zinc-600',
};

const statusLabel: Record<string, string> = {
  linked: 'Linked', suggested: 'Review', unlinked: 'Unlinked',
};

export default async function PayslipsPage() {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const payslips = await getPayslipsByUser(userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Payslips</h1>
      {payslips.length === 0 && (
        <p className="text-zinc-500">No payslips yet. Add one via the manual entry form.</p>
      )}
      <ul className="divide-y">
        {payslips.map(p => (
          <li key={p.id} className="py-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{p.employer}</p>
                <p className="text-sm text-zinc-500">{p.payDate} · {p.periodStart} – {p.periodEnd}</p>
                <div className="flex gap-4 text-sm mt-1">
                  <span>Gross {fmt(p.grossCents)}</span>
                  <span>Tax {fmt(p.taxWithheldCents)}</span>
                  <span>Super {fmt(p.superCents)}</span>
                  <span className="font-medium">Net {fmt(p.netCents)}</span>
                </div>
                {p.linkStatus === 'linked' && p.linkedDepositDate && (
                  <p className="text-xs text-green-700 mt-1">
                    Deposit matched: {p.linkedDepositDate} · {p.linkedAccountName}
                  </p>
                )}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge[p.linkStatus]}`}>
                {statusLabel[p.linkStatus]}
              </span>
            </div>
            {p.linkStatus === 'suggested' && p.linkId && (
              <PayslipLinkPanel
                linkId={p.linkId}
                depositDate={p.linkedDepositDate ?? ''}
                depositDesc=""
                depositAmountFormatted={fmt(p.netCents)}
                confidence={0.70}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
