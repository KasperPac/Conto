import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getSubscriptionGroups, getUnlabelledCandidates } from '@/lib/db/queries/subscriptions';
import { SetSubscriptionForm } from './_components/SetSubscriptionForm';

function formatCents(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

function toMonthlyCents(cents: bigint, cadence: string): bigint {
  switch (cadence) {
    case 'weekly':      return (cents * 52n) / 12n;
    case 'fortnightly': return (cents * 26n) / 12n;
    case 'quarterly':   return cents / 3n;
    case 'annual':      return cents / 12n;
    default:            return cents; // monthly
  }
}

export default async function SubscriptionsPage() {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const [groups, candidates] = await Promise.all([
    getSubscriptionGroups(userId),
    getUnlabelledCandidates(userId),
  ]);

  const totalMonthly = groups.reduce(
    (sum, g) => sum + toMonthlyCents(g.medianAmountCents, g.cadence),
    0n,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Subscriptions</h1>

      {/* Stat row */}
      <div className="flex gap-4">
        <div className="flex-1 bg-zinc-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{formatCents(totalMonthly)}</div>
          <div className="text-sm text-zinc-500">per month</div>
        </div>
        <div className="flex-1 bg-zinc-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{groups.length}</div>
          <div className="text-sm text-zinc-500">active</div>
        </div>
        {candidates.length > 0 && (
          <div className="flex-1 bg-amber-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-amber-700">{candidates.length}</div>
            <div className="text-sm text-amber-600">unlabelled</div>
          </div>
        )}
      </div>

      {/* Known subscriptions */}
      {groups.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Active</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {groups.map(g => (
              <div key={g.id} className="border rounded-lg p-4">
                <div className="font-medium text-sm">{g.merchantName}</div>
                <div className="text-zinc-500 text-xs mt-1">
                  {formatCents(g.medianAmountCents)} · {g.cadence}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unlabelled candidates */}
      {candidates.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Possible subscriptions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {candidates.map(c => (
              <SetSubscriptionForm key={c.id} candidate={c} />
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 && candidates.length === 0 && (
        <p className="text-sm text-zinc-500">
          No subscriptions detected yet. Upload more statements to detect recurring charges.
        </p>
      )}
    </div>
  );
}
