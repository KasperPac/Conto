import type { RunwayPoint } from '@/lib/types/cashflow';

export default function UpcomingEventsList({ points }: { points: RunwayPoint[] }) {
  const upcoming = points.flatMap(p => p.events).slice(0, 10);
  if (upcoming.length === 0) return <p className="text-sm text-zinc-500">No upcoming events projected.</p>;
  return (
    <section>
      <h2 className="text-sm font-semibold mb-2">Upcoming events</h2>
      <ul className="space-y-1">
        {upcoming.map(e => (
          <li key={String(e.id)} className="flex justify-between text-sm">
            <span className="text-zinc-500">{String(e.expectedDate)}</span>
            <span className="flex-1 mx-3 truncate">{e.description}</span>
            <span className={`tabular-nums ${Number(e.expectedAmountCents) < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {(Number(e.expectedAmountCents) / 100).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
