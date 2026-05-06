import type { Cents } from '@/lib/types/money';
import type { PayCadenceCandidate } from '@/lib/types/cashflow';
import { pairwiseDays, median, stddev, clamp01, addDaysISO } from './_stats';

interface InputCredit {
  id: string;
  accountId: string;
  postedDate: string;
  amountCents: number;
  descriptionClean: string;
}

interface Options { minOccurrences: number; maxAmountStddevPct: number; minAmountCents?: number; }

export function detectPayCadence(txs: InputCredit[], opts: Options): PayCadenceCandidate[] {
  const minAmount = opts.minAmountCents ?? 10000;
  const credits = txs.filter(t => t.amountCents >= minAmount);

  const buckets = new Map<string, InputCredit[]>();
  for (const tx of credits) {
    const employer = extractEmployer(tx.descriptionClean);
    const key = `${tx.accountId}|${employer}`;
    const arr = buckets.get(key) ?? [];
    arr.push(tx);
    buckets.set(key, arr);
  }

  const out: PayCadenceCandidate[] = [];
  for (const [key, group] of buckets) {
    if (group.length < opts.minOccurrences) continue;
    const sorted = [...group].sort((a, b) => a.postedDate.localeCompare(b.postedDate));
    const intervals = pairwiseDays(sorted.map(t => t.postedDate));
    if (intervals.length === 0) continue;

    const amounts = sorted.map(t => t.amountCents);
    const meanAmt = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const sdAmt = stddev(amounts);
    if (meanAmt > 0 && sdAmt / meanAmt > opts.maxAmountStddevPct) continue;

    const medianInterval = median(intervals);
    const cadence = payCadenceFromInterval(medianInterval);
    if (!cadence) continue;

    const [, employer = ''] = key.split('|');
    out.push({
      accountId: sorted[0]!.accountId,
      employer,
      cadence,
      expectedNetCents: BigInt(Math.round(meanAmt)) as unknown as Cents,
      nextPayDate: addDaysISO(sorted[sorted.length - 1]!.postedDate, Math.round(medianInterval)),
      confidence: clamp01(1 - sdAmt / Math.max(meanAmt, 1)),
      memberTransactionIds: sorted.map(t => t.id),
    });
  }
  return out;
}

function extractEmployer(desc: string): string {
  return desc.replace(/\s+(PAYROLL|SALARY|WAGES|PAY)\b.*$/i, '').split(/\s+/).slice(0, 3).join(' ').trim();
}

function payCadenceFromInterval(d: number): 'weekly' | 'fortnightly' | 'monthly' | null {
  if (d >= 6 && d <= 8)   return 'weekly';
  if (d >= 13 && d <= 15) return 'fortnightly';
  if (d >= 27 && d <= 32) return 'monthly';
  return null;
}
