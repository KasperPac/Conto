'use client';
import { useTransition } from 'react';
import { setSubscription } from '../actions/set-subscription';
import type { UnlabelledCandidate } from '@/lib/db/queries/subscriptions';

function formatCents(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

export function SetSubscriptionForm({ candidate }: { candidate: UnlabelledCandidate }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-4">
      <div className="font-medium text-sm text-amber-900 truncate">{candidate.descriptionPattern}</div>
      <div className="text-amber-700 text-xs mt-1">
        {formatCents(candidate.medianAmountCents)} · {candidate.cadence}
      </div>
      <button
        disabled={pending}
        onClick={() => startTransition(() => setSubscription(candidate.merchantId, true))}
        className="mt-3 text-xs text-amber-800 border border-amber-400 rounded px-2 py-1 hover:bg-amber-100 disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add to subscriptions'}
      </button>
    </div>
  );
}
