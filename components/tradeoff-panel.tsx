'use client';
import { useState } from 'react';
import Link from 'next/link';
import { applyScenarioAction } from '@/app/actions/tradeoff';
import type { Scenario } from '@/lib/domain/tradeoff';
import type { Cents } from '@/lib/types/money';

interface Props {
  goalId: string;
  weeklyCostCents: Cents;
  historicalSurplusCents: Cents;
  projectionSurplusCents: Cents;
  scenarios: Scenario[];
}

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
    .format(Number(cents) / 100);
}

export function TradeoffPanel({
  goalId,
  weeklyCostCents,
  historicalSurplusCents,
  projectionSurplusCents,
  scenarios,
}: Props) {
  const [mode, setMode] = useState<'historical' | 'projection'>('historical');
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const surplusCents = mode === 'historical' ? historicalSurplusCents : projectionSurplusCents;
  const surplusRaw = surplusCents as unknown as bigint;
  const costRaw = weeklyCostCents as unknown as bigint;
  const gap = costRaw - surplusRaw;
  const covered = gap <= 0n;

  async function handleApply(scenario: Scenario) {
    setApplying(scenario.label);
    try {
      await applyScenarioAction(goalId, scenario);
      setApplied(scenario.label);
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Surplus panel */}
      <div className="bg-zinc-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-600">Current weekly surplus</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMode('historical')}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                mode === 'historical'
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white border border-zinc-300 text-zinc-600 hover:border-zinc-400'
              }`}
            >
              Historical
            </button>
            <button
              type="button"
              onClick={() => setMode('projection')}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                mode === 'projection'
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white border border-zinc-300 text-zinc-600 hover:border-zinc-400'
              }`}
            >
              Projection
            </button>
          </div>
        </div>

        <p className={`text-3xl font-bold ${surplusRaw >= 0n ? 'text-green-600' : 'text-red-600'}`}>
          {surplusRaw >= 0n ? '+' : ''}{fmt(surplusRaw < 0n ? -surplusRaw : surplusRaw)}/wk
          {surplusRaw < 0n && <span className="text-red-600"> (−)</span>}
        </p>

        {mode === 'historical' && (
          <p className="text-xs text-zinc-500 mt-1">
            avg income − spending, last 3 months ÷ 4.33
          </p>
        )}
      </div>

      {/* Gap / covered state */}
      {covered ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            Your current surplus covers this. You can absorb the cost without any changes.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              Based on your spending, you need {fmt(gap)}/wk more headroom to absorb this.
            </p>
          </div>

          {/* Scenarios */}
          <div>
            <p className="text-xs font-semibold tracking-widest text-zinc-500 uppercase mb-3">
              Cut-back Scenarios
            </p>

            {scenarios.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Not enough spending data to generate scenarios.
              </p>
            ) : (
              <div className="space-y-3">
                {scenarios.map(scenario => {
                  const isApplied = applied === scenario.label;
                  const isApplying = applying === scenario.label;
                  const gainRaw = scenario.totalWeeklyGainCents as unknown as bigint;

                  return (
                    <div key={scenario.label} className="border rounded-lg p-4">
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-zinc-800">
                          {scenario.label}
                        </span>
                        <span className="text-sm font-semibold text-green-600">
                          +{fmt(gainRaw)}/wk
                        </span>
                      </div>

                      {/* Items list */}
                      <ul className="space-y-1.5 mb-4">
                        {scenario.items.map(item => (
                          <li key={item.id} className="text-sm text-zinc-600">
                            {item.kind === 'subscription' ? (
                              <>
                                Based on your spending, you could free up{' '}
                                {fmt(item.weeklyGainCents as unknown as bigint)}/wk by cancelling{' '}
                                {item.name} &rarr;{' '}
                                <Link
                                  href="/subscriptions"
                                  className="text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
                                >
                                  Subscriptions
                                </Link>
                              </>
                            ) : (
                              <>
                                Reduce {item.name} budget to{' '}
                                {item.newWeeklyBudgetCents !== undefined
                                  ? fmt(item.newWeeklyBudgetCents as unknown as bigint)
                                  : '—'}
                                /wk (saves {fmt(item.weeklyGainCents as unknown as bigint)}/wk)
                              </>
                            )}
                          </li>
                        ))}
                      </ul>

                      {/* Apply button */}
                      {isApplied ? (
                        <p className="text-sm text-green-600 font-medium">Applied ✓</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleApply(scenario)}
                          disabled={isApplying || applying !== null}
                          className="text-sm bg-zinc-900 text-white px-3 py-1.5 rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isApplying ? 'Applying…' : 'Apply'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
