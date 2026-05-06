import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getGoalById } from '@/lib/db/queries/goals';
import { getTradeoffInputs } from '@/lib/db/queries/tradeoff';
import { computeTradeoffScenarios } from '@/lib/domain/tradeoff';
import { TradeoffPanel } from '@/components/tradeoff-panel';
import { markGoalAchievedAction, abandonGoalAction, updateCurrentAmountFormAction } from '@/app/actions/goals';
import { toCents } from '@/lib/types/money';

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
    .format(Number(cents) / 100);
}

function monthsSince(date: Date): number {
  const now = new Date();
  return Math.max(
    1,
    (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth()),
  );
}

function monthsUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.max(
    0,
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()),
  );
}

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in');
    throw e;
  }

  const goal = await getGoalById(userId, id);
  if (!goal) notFound();

  // ─── Savings goal variant ──────────────────────────────────────────────────
  if (goal.goalType === 'savings') {
    const targetRaw = goal.targetAmountCents;
    const currentRaw = goal.currentAmountCents;

    const pct =
      targetRaw === 0n
        ? 0
        : Math.min(100, Math.round(Number((currentRaw * 100n) / targetRaw)));

    const elapsed = monthsSince(goal.createdAt);
    const monthlyPace = (currentRaw + BigInt(elapsed) / 2n) / BigInt(elapsed);
    const remaining = targetRaw - currentRaw;
    const mLeft = goal.targetDate ? monthsUntil(goal.targetDate) : null;
    const requiredPace =
      mLeft !== null && mLeft > 0
        ? (remaining + BigInt(mLeft) / 2n) / BigInt(mLeft)
        : null;
    const projectedMonths =
      monthlyPace > 0n ? Number(remaining / monthlyPace) : null;
    const onTrack =
      requiredPace !== null && monthlyPace >= requiredPace;

    const aheadBehind =
      projectedMonths !== null && mLeft !== null
        ? mLeft - projectedMonths
        : null;

    return (
      <div className="max-w-xl">
        {/* Back link */}
        <Link
          href="/plan/goals"
          className="text-sm text-zinc-500 hover:text-zinc-700 mb-4 inline-block"
        >
          &larr; Goals
        </Link>

        {/* Name + subtitle */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">{goal.name}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Target: {fmt(targetRaw)}
            {goal.targetDate ? ` · Due ${goal.targetDate}` : ''}
          </p>
        </div>

        {/* On track / Behind badge */}
        {requiredPace !== null && (
          <div className="mb-4">
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                onTrack
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {onTrack ? 'On track' : 'Behind'}
            </span>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-zinc-900 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="flex gap-6 text-sm text-zinc-600 mb-6">
          <div>
            <span className="font-medium text-zinc-900">{fmt(currentRaw)}</span> saved
          </div>
          <div>
            <span className="font-medium text-zinc-900">{pct}%</span> complete
          </div>
          <div>
            <span className="font-medium text-zinc-900">{fmt(remaining > 0n ? remaining : 0n)}</span> to go
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 bg-zinc-50 rounded-lg p-4 mb-6">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Monthly pace</p>
            <p className="text-sm font-medium">{fmt(monthlyPace)}/mo</p>
          </div>
          {requiredPace !== null && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Needed/mo</p>
              <p className="text-sm font-medium">{fmt(requiredPace)}/mo</p>
            </div>
          )}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Tracking</p>
            <p className="text-sm font-medium">
              {goal.linkedAccountId ? 'Linked' : 'Manual'}
            </p>
          </div>
        </div>

        {/* Inline edit: current amount (only when not linked to an account) */}
        {goal.linkedAccountId === null && (
          <form
            action={updateCurrentAmountFormAction.bind(null, goal.id)}
            className="flex items-center gap-2 mb-6"
          >
            <label htmlFor="currentAmountDollars" className="text-sm text-zinc-600 shrink-0">
              Update saved amount:
            </label>
            <input
              id="currentAmountDollars"
              name="currentAmountDollars"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(Number(currentRaw) / 100).toFixed(2)}
              className="w-36 text-sm border border-zinc-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            <button
              type="submit"
              className="text-sm bg-zinc-900 text-white px-3 py-1.5 rounded-md hover:bg-zinc-700"
            >
              Update
            </button>
          </form>
        )}

        {/* Projection callout */}
        {projectedMonths !== null && (
          <div
            className={`rounded-lg p-4 mb-6 ${
              onTrack || requiredPace === null
                ? 'bg-green-50 border border-green-200'
                : 'bg-amber-50 border border-amber-200'
            }`}
          >
            <p
              className={`text-sm ${
                onTrack || requiredPace === null ? 'text-green-800' : 'text-amber-800'
              }`}
            >
              {(() => {
                const projectedDate = new Date();
                projectedDate.setMonth(projectedDate.getMonth() + projectedMonths);
                const dateStr = projectedDate.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
                return <>At current pace you&apos;ll reach {fmt(targetRaw)} by {dateStr}</>;
              })()}
              {aheadBehind !== null && aheadBehind !== 0
                ? aheadBehind > 0
                  ? ` — ${Math.round(aheadBehind)} months ahead of target`
                  : ` — ${Math.round(-aheadBehind)} months behind target`
                : ''}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <form action={markGoalAchievedAction.bind(null, goal.id)}>
            <button
              type="submit"
              className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-md hover:bg-zinc-700"
            >
              Mark achieved
            </button>
          </form>
          <form action={abandonGoalAction.bind(null, goal.id)}>
            <button
              type="submit"
              className="text-sm border border-zinc-300 text-zinc-700 px-4 py-2 rounded-md hover:border-zinc-400"
            >
              Abandon
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Spending change variant ───────────────────────────────────────────────
  const tradeoffInputs = await getTradeoffInputs(userId);
  const weeklyCostCents = toCents(goal.weeklyCostCents ?? BigInt(0));
  const scenarios = computeTradeoffScenarios({
    ...tradeoffInputs,
    weeklyTargetCents: weeklyCostCents,
  });
  const historicalSurplus = tradeoffInputs.weeklySurplusCents;

  return (
    <div className="max-w-xl">
      {/* Back link */}
      <Link
        href="/plan/goals"
        className="text-sm text-zinc-500 hover:text-zinc-700 mb-4 inline-block"
      >
        &larr; Goals
      </Link>

      {/* Name + target cost */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{goal.name}</h1>
          {goal.status === 'applied' && (
            <span className="text-xs px-2 py-1 rounded-full font-medium bg-zinc-100 text-zinc-600">
              Applied
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500 mt-1">
          Target cost: +{fmt(weeklyCostCents)}/wk
        </p>
      </div>

      {/* Tradeoff panel */}
      <TradeoffPanel
        goalId={goal.id}
        weeklyCostCents={weeklyCostCents}
        historicalSurplusCents={historicalSurplus}
        projectionSurplusCents={tradeoffInputs.projectionSurplusCents}
        scenarios={scenarios}
      />
    </div>
  );
}
