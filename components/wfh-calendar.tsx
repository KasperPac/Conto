'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { upsertWfhEntry, deleteWfhEntry } from '@/app/actions/wfh';

interface Entry { date: string; hours: string }

interface Props {
  year: number;
  month: number; // 1-12
  entries: Entry[];
  prevHref: string;
  nextHref: string;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildGrid(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  // Monday-indexed: getDay() returns 0=Sun,1=Mon..6=Sat → remap
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ date: string; dow: number } | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (new Date(year, month - 1, d).getDay() + 6) % 7;
    cells.push({ date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, dow });
  }
  return cells;
}

export function WfhCalendar({ year, month, entries, prevHref, nextHref }: Props) {
  const entryMap = new Map(entries.map(e => [e.date, e.hours]));
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [inputHours, setInputHours] = useState('8');
  const [pending, startTransition] = useTransition();

  const cells = buildGrid(year, month);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  function open(date: string) {
    setActiveDate(date);
    setInputHours(entryMap.get(date) ?? '8');
  }

  function save() {
    if (!activeDate) return;
    const h = parseFloat(inputHours);
    if (isNaN(h) || h <= 0) return;
    startTransition(async () => { await upsertWfhEntry(activeDate, h); setActiveDate(null); });
  }

  function clear() {
    if (!activeDate) return;
    startTransition(async () => { await deleteWfhEntry(activeDate); setActiveDate(null); });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Link href={prevHref} className="px-3 py-1 border rounded text-sm">←</Link>
        <span className="font-medium">{monthLabel}</span>
        <Link href={nextHref} className="px-3 py-1 border rounded text-sm">→</Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-400 mb-1">
        {DOW.map(d => <div key={d}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const isWeekend = cell.dow >= 5;
          const hours = entryMap.get(cell.date);
          const isActive = activeDate === cell.date;
          const day = parseInt(cell.date.slice(8), 10);

          return (
            <div key={cell.date} className="relative">
              <button
                disabled={isWeekend || pending}
                onClick={() => open(cell.date)}
                className={`w-full aspect-square rounded text-xs flex flex-col items-center justify-center gap-0.5
                  ${isWeekend ? 'text-zinc-300 cursor-default' : 'hover:bg-zinc-100 cursor-pointer'}
                  ${hours ? 'bg-green-100 text-green-800 font-medium' : ''}
                  ${isActive ? 'ring-2 ring-zinc-800' : ''}
                `}
              >
                <span>{day}</span>
                {hours && <span className="text-[10px]">{parseFloat(hours).toFixed(hours.endsWith('.00') ? 0 : 1)}h</span>}
              </button>

              {isActive && (
                <div className="absolute z-10 top-full mt-1 left-0 bg-white border rounded shadow-lg p-3 w-36 text-sm">
                  <input
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={inputHours}
                    onChange={e => setInputHours(e.target.value)}
                    className="w-full border rounded px-2 py-1 mb-2 text-sm"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button onClick={save} disabled={pending} className="flex-1 bg-zinc-900 text-white rounded px-2 py-1 text-xs">Save</button>
                    {hours && <button onClick={clear} disabled={pending} className="flex-1 border rounded px-2 py-1 text-xs">Clear</button>}
                    <button onClick={() => setActiveDate(null)} className="border rounded px-2 py-1 text-xs">✕</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
