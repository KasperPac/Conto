'use client';
import { useState } from 'react';
import type { CalendarDay } from '@/lib/types/cashflow';
import EventDetailPanel from './EventDetailPanel';

export default function MonthGrid({ month, days }: { month: string; days: CalendarDay[] }) {
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const cells = buildGrid(month, days);

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4">
      <div>
        <div className="grid grid-cols-7 gap-px text-xs text-center text-zinc-500 mb-1">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-zinc-200">
          {cells.map((cell, i) => (
            <button
              key={i}
              onClick={() => cell?.events?.length ? setSelected(cell) : undefined}
              className={`bg-white p-1 text-left text-xs min-h-[64px] ${!cell ? 'opacity-30' : ''} ${cell?.events?.length ? 'hover:bg-zinc-50 cursor-pointer' : 'cursor-default'}`}
            >
              {cell && (
                <>
                  <div className="font-mono text-zinc-600">{cell.date.slice(8)}</div>
                  <ul>
                    {cell.events.slice(0, 2).map(e => (
                      <li key={String(e.id)} className="truncate flex items-center gap-1">
                        <ConfDot c={e.confidence} /> {e.description}
                      </li>
                    ))}
                    {cell.events.length > 2 && <li className="text-zinc-400">+{cell.events.length - 2}</li>}
                  </ul>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
      {selected && <EventDetailPanel day={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ConfDot({ c }: { c: number }) {
  const color = c > 0.85 ? 'bg-emerald-500' : c > 0.6 ? 'bg-amber-400' : 'bg-zinc-400';
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function buildGrid(month: string, days: CalendarDay[]): (CalendarDay | null)[] {
  const [y, m] = month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay();
  const lastDate = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const byDate = new Map(days.map(d => [d.date, d]));
  const cells: (CalendarDay | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= lastDate; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    cells.push(byDate.get(iso) ?? { date: iso, events: [] });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
