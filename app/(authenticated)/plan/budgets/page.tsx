import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getBudgetWithSpend } from '@/lib/db/queries/budgets';
import type { BudgetWithSpend } from '@/lib/db/queries/budgets';
import { BudgetRow } from '@/components/budget-row';

function fmt(cents: bigint): string {
  return '$' + (cents / 100n).toString() + '.' + String(cents % 100n).padStart(2, '0');
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

interface PeriodInfo {
  period: 'monthly' | 'weekly';
  periodStart: string;
  periodEnd: string;
  daysInPeriod: number;
  daysElapsed: number;
}

function computePeriod(period: 'monthly' | 'weekly'): PeriodInfo {
  const today = new Date();

  if (period === 'monthly') {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInPeriod = lastDay.getDate();
    const daysElapsed = today.getDate();
    return {
      period,
      periodStart: toYMD(firstDay),
      periodEnd: toYMD(lastDay),
      daysInPeriod,
      daysElapsed,
    };
  } else {
    // Weekly: most recent Monday to following Sunday
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysFromMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    // daysElapsed: 0=Mon means at least 1 day elapsed
    const daysElapsed = Math.max(1, daysFromMonday + 1);
    return {
      period,
      periodStart: toYMD(monday),
      periodEnd: toYMD(sunday),
      daysInPeriod: 7,
      daysElapsed,
    };
  }
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in');
    throw e;
  }

  const params = await searchParams;
  const rawPeriod = params.period;
  const period: 'monthly' | 'weekly' =
    rawPeriod === 'weekly' ? 'weekly' : 'monthly';

  const periodInfo = computePeriod(period);
  const budgets: BudgetWithSpend[] = await getBudgetWithSpend(
    userId,
    period,
    periodInfo.periodStart,
    periodInfo.periodEnd,
  );

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.amountCents, 0n);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spentCents, 0n);
  const totalRemaining = totalBudgeted - totalSpent;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Budgets</h1>
        {/* TODO: Add budget form requires getCategories which doesn't exist yet */}
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-6">
        <Link
          href="?period=monthly"
          className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
            period === 'monthly'
              ? 'bg-zinc-900 text-white border-zinc-900'
              : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-500'
          }`}
        >
          Monthly
        </Link>
        <Link
          href="?period=weekly"
          className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
            period === 'weekly'
              ? 'bg-zinc-900 text-white border-zinc-900'
              : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-500'
          }`}
        >
          Weekly
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="border rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total budgeted</p>
          <p className="text-xl font-semibold">{fmt(totalBudgeted)}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Spent so far</p>
          <p className="text-xl font-semibold">{fmt(totalSpent)}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Remaining</p>
          <p className={`text-xl font-semibold ${totalRemaining >= 0n ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(totalRemaining < 0n ? -totalRemaining : totalRemaining)}
            {totalRemaining < 0n ? ' over' : ''}
          </p>
        </div>
      </div>

      {/* Budget rows */}
      {budgets.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-500 text-sm mb-2">No budgets yet.</p>
          <p className="text-zinc-400 text-xs max-w-md mx-auto">
            Apply a trade-off scenario to create your first budgets, or add one manually.
          </p>
        </div>
      ) : (
        <ul className="divide-y border rounded-lg overflow-hidden">
          {budgets.map((b) => (
            <li key={b.id}>
              <BudgetRow
                id={b.id}
                categoryId={b.categoryId}
                categoryName={b.categoryName}
                period={period}
                amountCents={b.amountCents}
                spentCents={b.spentCents}
                fromGoalId={b.fromGoalId}
                daysElapsed={periodInfo.daysElapsed}
                daysInPeriod={periodInfo.daysInPeriod}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
