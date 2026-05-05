import type { Cents } from '@/lib/types/money';
import type { DetectedRecurrence, Cadence } from '@/lib/types/cashflow';
import { pairwiseDays, median, stddev, clamp01, addDaysISO } from './_stats';

interface InputTx {
  id: string;
  postedDate: string;
  amountCents: number;
  descriptionClean: string;
  merchantId: string | null;
}

interface Options { minOccurrences: number; maxStddevPct: number; }

export function detectRecurrence(txs: InputTx[], opts: Options): DetectedRecurrence[] {
  const buckets = new Map<string, InputTx[]>();
  for (const tx of txs) {
    const key = tx.merchantId ?? tx.descriptionClean;
    const arr = buckets.get(key) ?? [];
    arr.push(tx);
    buckets.set(key, arr);
  }

  const out: DetectedRecurrence[] = [];
  for (const [, group] of buckets) {
    if (group.length < opts.minOccurrences) continue;
    const sorted = [...group].sort((a, b) => a.postedDate.localeCompare(b.postedDate));
    const intervals = pairwiseDays(sorted.map(t => t.postedDate));
    if (intervals.length === 0) continue;

    const medianInterval = median(intervals);
    const intervalStddev = stddev(intervals);
    if (medianInterval > 0 && intervalStddev / medianInterval > opts.maxStddevPct) continue;

    const amounts = sorted.map(t => Number(t.amountCents));
    const medianAmount = median(amounts);
    const amountStddev = stddev(amounts);

    out.push({
      descriptionPattern: sorted[0].descriptionClean,
      merchantId: sorted[0].merchantId,
      cadence: cadenceFromIntervalDays(medianInterval),
      medianAmountCents: BigInt(Math.round(medianAmount)) as unknown as Cents,
      amountStddevCents: BigInt(Math.round(amountStddev)) as unknown as Cents,
      medianIntervalDays: Math.round(medianInterval),
      lastSeenDate: sorted[sorted.length - 1].postedDate,
      nextExpectedDate: addDaysISO(sorted[sorted.length - 1].postedDate, Math.round(medianInterval)),
      confidence: clamp01(1 - intervalStddev / Math.max(medianInterval, 1)),
      memberTransactionIds: sorted.map(t => t.id),
    });
  }
  return out;
}

function cadenceFromIntervalDays(d: number): Cadence {
  if (d <= 8)   return 'weekly';
  if (d <= 17)  return 'fortnightly';
  if (d <= 45)  return 'monthly';
  if (d <= 100) return 'quarterly';
  if (d <= 400) return 'annual';
  return 'irregular';
}
