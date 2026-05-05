import type { Cents } from '@/lib/types/money';
import type { ExpectedEvent, RunwayPoint } from '@/lib/types/cashflow';
import { addDaysISO } from './_stats';

export function projectRunway(
  startBalanceCents: Cents,
  events: ExpectedEvent[],
  horizonDays: number,
  today: string = new Date().toISOString().slice(0, 10),
): RunwayPoint[] {
  let runningMid  = BigInt(startBalanceCents as unknown as bigint);
  let runningLow  = runningMid;
  let runningHigh = runningMid;

  const byDate = new Map<string, ExpectedEvent[]>();
  for (const e of events) {
    const d = e.expectedDate as unknown as string;
    const arr = byDate.get(d) ?? [];
    arr.push(e);
    byDate.set(d, arr);
  }

  const out: RunwayPoint[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDaysISO(today, i);
    const todays = byDate.get(date) ?? [];
    for (const ev of todays) {
      runningMid  += BigInt(ev.expectedAmountCents     as unknown as bigint);
      runningLow  += BigInt(ev.expectedAmountLowCents  as unknown as bigint);
      runningHigh += BigInt(ev.expectedAmountHighCents as unknown as bigint);
    }
    out.push({
      date,
      projectedBalanceCents: runningMid  as unknown as Cents,
      lowCents:              runningLow  as unknown as Cents,
      highCents:             runningHigh as unknown as Cents,
      events: todays,
    });
  }
  return out;
}
