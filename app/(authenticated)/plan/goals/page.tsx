import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getGoals } from '@/lib/db/queries/goals';
import type { Goal } from '@/lib/db/queries/goals';

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
    .format(Number(cents) / 100);
}

function goalStatus(g: Goal): { label: string; className: string } {
  const current = BigInt(g.currentAmountCents);
  const target = BigInt(g.targetAmountCents);

  if (current >= target) {
    return { label: 'Achieved', className: 'bg-green-100 text-green-700' };
  }

  if (!g.targetDate) {
    return { label: 'Active', className: 'bg-zinc-100 text-zinc-600' };
  }

  const now = new Date();
  const targetDate = new Date(g.targetDate);
  const createdAt = g.createdAt;

  const monthsLeft = Math.max(
    0,
    (targetDate.getFullYear() - now.getFullYear()) * 12 +
      (targetDate.getMonth() - now.getMonth()),
  );

  const monthsElapsed = Math.max(
    1,
    (now.getFullYear() - createdAt.getFullYear()) * 12 +
      (now.getMonth() - createdAt.getMonth()),
  );

  const currentPace = current / BigInt(monthsElapsed);
  const remaining = target - current;
  const requiredPace = monthsLeft > 0 ? remaining / BigInt(monthsLeft) : remaining;

  if (currentPace >= requiredPace) {
    return { label: 'On track', className: 'bg-green-100 text-green-700' };
  }
  return { label: 'Behind', className: 'bg-amber-100 text-amber-700' };
}

function monthsLeft(targetDate: string): number {
  const now = new Date();
  const target = new Date(targetDate);
  return Math.max(
    0,
    (target.getFullYear() - now.getFullYear()) * 12 +
      (target.getMonth() - now.getMonth()),
  );
}

export default async function GoalsPage() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in');
    throw e;
  }

  const allGoals = await getGoals(userId);
  const savingsGoals = allGoals.filter(g => g.goalType === 'savings');
  const spendingGoals = allGoals.filter(g => g.goalType !== 'savings');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Goals</h1>
        <Link
          href="/plan/goals/new"
          className="text-sm bg-zinc-900 text-white px-3 py-1.5 rounded hover:bg-zinc-700"
        >
          + Add goal
        </Link>
      </div>

      {/* Savings goals */}
      <section className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-zinc-500 uppercase mb-3">
          Savings Goals
        </p>
        {savingsGoals.length === 0 ? (
          <p className="text-zinc-500 text-sm">No savings goals yet.</p>
        ) : (
          <ul className="divide-y border rounded-lg overflow-hidden">
            {savingsGoals.map(g => {
              const current = BigInt(g.currentAmountCents);
              const target = BigInt(g.targetAmountCents);
              const pct = target > 0n
                ? Math.min(100, Math.round(Number(current * 100n / target)))
                : 0;
              const status = goalStatus(g);
              const mo = g.targetDate ? monthsLeft(g.targetDate) : null;

              return (
                <li key={g.id}>
                  <Link
                    href={`/plan/goals/${g.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50 transition-colors"
                  >
                    {/* Left: name + subtitle */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{g.name}</p>
                      <p className="text-xs text-zinc-500">
                        {g.targetDate
                          ? `Target: ${g.targetDate}`
                          : g.linkedAccountId
                            ? 'Linked account'
                            : 'Manual'}
                      </p>
                    </div>

                    {/* Center: amounts + progress */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-700 mb-1">
                        {fmt(current)} / {fmt(target)}
                      </p>
                      <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden mb-1">
                        <div
                          className="h-full bg-zinc-900 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-500">
                        {pct}%{mo !== null ? ` · ~${mo} mo left` : ''}
                      </p>
                    </div>

                    {/* Right: status badge */}
                    <div className="shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Spending change goals */}
      <section>
        <p className="text-xs font-semibold tracking-widest text-zinc-500 uppercase mb-3">
          Spending Change Goals
        </p>
        {spendingGoals.length === 0 ? (
          <p className="text-zinc-500 text-sm">No spending change goals yet.</p>
        ) : (
          <ul className="divide-y border rounded-lg overflow-hidden">
            {spendingGoals.map(g => {
              const isApplied = g.status === 'applied';
              const badgeClass = isApplied
                ? 'bg-zinc-100 text-zinc-600'
                : 'bg-blue-100 text-blue-700';
              const badgeLabel = isApplied ? 'Applied' : 'Plan ready';

              return (
                <li key={g.id}>
                  <Link
                    href={`/plan/goals/${g.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{g.name}</p>
                      {g.weeklyCostCents != null && (
                        <p className="text-xs text-zinc-500">
                          +{fmt(BigInt(g.weeklyCostCents))}/wk
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${badgeClass}`}>
                      {badgeLabel}
                    </span>
                    <span className="text-zinc-400 shrink-0">&rarr;</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
