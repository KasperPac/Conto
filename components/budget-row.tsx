'use client';

import { useState, startTransition } from 'react';
import { upsertBudgetAction, deactivateBudgetAction } from '@/app/actions/budgets';
import type { Cents } from '@/lib/types/money';

interface BudgetRowProps {
  id: string;
  categoryId: string;
  categoryName: string;
  period: 'monthly' | 'weekly';
  amountCents: Cents;
  spentCents: Cents;
  fromGoalId: string | null;
  daysElapsed: number;
  daysInPeriod: number;
}

function fmt(cents: bigint): string {
  return '$' + (cents / 100n).toString() + '.' + String(cents % 100n).padStart(2, '0');
}

function dollarsToCents(s: string): bigint {
  const [intPart = '0', fracPart = ''] = s.trim().split('.');
  const cents = fracPart.padEnd(2, '0').slice(0, 2);
  return BigInt(intPart) * 100n + BigInt(cents || '0');
}

function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

type BadgeStatus = 'Over' | 'Watch' | 'OK';

function computeStatus(
  spentCents: bigint,
  amountCents: bigint,
  daysElapsed: number,
  daysInPeriod: number,
): BadgeStatus {
  if (spentCents > amountCents) return 'Over';
  if (daysElapsed === 0) return 'OK';
  const projectedSpend = (spentCents * BigInt(daysInPeriod)) / BigInt(daysElapsed);
  if (projectedSpend > amountCents) return 'Watch';
  return 'OK';
}

export function BudgetRow({
  id,
  categoryId,
  categoryName,
  period,
  amountCents,
  spentCents,
  fromGoalId,
  daysElapsed,
  daysInPeriod,
}: BudgetRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [amountInput, setAmountInput] = useState(
    (amountCents / 100n).toString() + '.' + String(amountCents % 100n).padStart(2, '0'),
  );
  const [pending, setPending] = useState(false);

  const status = computeStatus(spentCents, amountCents, daysElapsed, daysInPeriod);

  const pct = amountCents > 0n
    ? Math.min(100, Math.round(Number((spentCents * 100n) / amountCents)))
    : 0;

  const barColor =
    status === 'Over' ? 'bg-red-500' :
    status === 'Watch' ? 'bg-amber-400' :
    'bg-zinc-900';

  const badgeClass =
    status === 'Over' ? 'bg-red-100 text-red-700' :
    status === 'Watch' ? 'bg-amber-100 text-amber-700' :
    'bg-green-100 text-green-700';

  function handleUpdate() {
    setPending(true);
    startTransition(async () => {
      try {
        await upsertBudgetAction({
          categoryId,
          period,
          amountCents: dollarsToCents(amountInput),
          effectiveFrom: todayYMD(),
        });
      } finally {
        setPending(false);
        setIsEditing(false);
      }
    });
  }

  function handleDeactivate() {
    if (!window.confirm(`Deactivate budget for "${categoryName}"?`)) return;
    setPending(true);
    startTransition(async () => {
      try {
        await deactivateBudgetAction(id);
      } finally {
        setPending(false);
        setIsEditing(false);
      }
    });
  }

  if (isEditing) {
    return (
      <div className="px-4 py-4 bg-zinc-50">
        <p className="font-medium text-sm mb-3">
          {categoryName}
          {fromGoalId !== null && <span className="ml-1 text-xs text-zinc-400">✦</span>}
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Amount ($)</label>
            <input
              type="text"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              disabled={pending}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Period</label>
            <span className="text-sm text-zinc-700 capitalize">{period}</span>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleUpdate}
            disabled={pending}
            className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded hover:bg-zinc-700 disabled:opacity-50"
          >
            Update
          </button>
          <button
            onClick={handleDeactivate}
            disabled={pending}
            className="text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded hover:bg-red-100 disabled:opacity-50"
          >
            Deactivate
          </button>
          <button
            onClick={() => setIsEditing(false)}
            disabled={pending}
            className="text-xs text-zinc-500 px-3 py-1.5 rounded hover:text-zinc-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors focus:outline-none focus:bg-zinc-50"
      onClick={() => setIsEditing(true)}
    >
      <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-4 items-center">
        {/* Column 1: Category name + period limit */}
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">
            {categoryName}
            {fromGoalId !== null && <span className="ml-1 text-xs text-zinc-400">✦</span>}
          </p>
          <p className="text-xs text-zinc-500 capitalize">{period} · {fmt(amountCents)}</p>
        </div>

        {/* Column 2: Progress bar */}
        <div>
          <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Column 3: Spent / Budget */}
        <div className="text-right shrink-0">
          <p className="text-sm tabular-nums">{fmt(spentCents)}</p>
          <p className="text-xs text-zinc-500 tabular-nums">/ {fmt(amountCents)}</p>
        </div>

        {/* Column 4: Status badge */}
        <div className="shrink-0">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${badgeClass}`}>
            {status}
          </span>
        </div>
      </div>
    </button>
  );
}
