'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createGoalAction } from '@/app/actions/goals';

function dollarsToCents(s: string): number {
  const [intPart = '0', fracPart = ''] = s.trim().split('.');
  const cents = fracPart.padEnd(2, '0').slice(0, 2);
  return parseInt(intPart) * 100 + parseInt(cents || '0');
}

interface Account {
  id: string;
  name: string;
  institution: string;
}

interface AddGoalModalProps {
  accounts: Account[];
}

export function AddGoalModal({ accounts }: AddGoalModalProps) {
  const router = useRouter();
  const [goalType, setGoalType] = useState<'savings' | 'spending_change'>('savings');
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [weeklyAmount, setWeeklyAmount] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError('');
    const fd = new FormData();
    fd.append('goalType', goalType);
    fd.append('name', name);
    if (goalType === 'savings') {
      fd.append('targetAmountCents', String(dollarsToCents(targetAmount || '0')));
      if (targetDate) fd.append('targetDate', targetDate);
      if (linkedAccountId) fd.append('linkedAccountId', linkedAccountId);
    } else {
      fd.append('weeklyCostCents', String(dollarsToCents(weeklyAmount || '0')));
    }
    try {
      await createGoalAction(fd);
      router.push('/plan/goals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setPending(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add goal</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Type selector */}
        <div>
          <p className="text-sm font-medium text-zinc-700 mb-2">Goal type</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setGoalType('savings')}
              className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                goalType === 'savings'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-400'
              }`}
            >
              Savings
            </button>
            <button
              type="button"
              onClick={() => setGoalType('spending_change')}
              className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                goalType === 'spending_change'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-400'
              }`}
            >
              Spending Change
            </button>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="goal-name">
            Name
          </label>
          <input
            id="goal-name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={goalType === 'savings' ? 'e.g. Emergency fund' : 'e.g. Cancel gym membership'}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>

        {/* Savings fields */}
        {goalType === 'savings' && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="target-amount">
                Target amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                <input
                  id="target-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={targetAmount}
                  onChange={e => setTargetAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border rounded-md pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="target-date">
                Target date <span className="text-zinc-400 font-normal">(optional)</span>
              </label>
              <input
                id="target-date"
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="linked-account">
                Linked account <span className="text-zinc-400 font-normal">(optional)</span>
              </label>
              <select
                id="linked-account"
                value={linkedAccountId}
                onChange={e => setLinkedAccountId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
              >
                <option value="">— manual tracking —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Spending change fields */}
        {goalType === 'spending_change' && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="weekly-cost">
              Weekly cost
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$/wk</span>
              <input
                id="weekly-cost"
                type="number"
                min="0"
                step="0.01"
                value={weeklyAmount}
                onChange={e => setWeeklyAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border rounded-md pl-12 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-zinc-900 text-white text-sm px-4 py-2 rounded-md hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Saving…' : 'Save goal'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/plan/goals')}
            className="text-sm px-4 py-2 rounded-md border border-zinc-300 text-zinc-700 hover:border-zinc-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
