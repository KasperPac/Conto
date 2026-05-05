'use client';
import type { CalendarDay } from '@/lib/types/cashflow';
import { snoozeEvent } from '../actions/snooze';
import { dismissEvent } from '../actions/dismiss';
import { cancelAtSource } from '../actions/cancel-at-source';

export default function EventDetailPanel({ day, onClose }: { day: CalendarDay; onClose: () => void }) {
  return (
    <aside className="border rounded p-4 bg-white self-start">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold text-sm">{day.date}</h2>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-lg leading-none">&times;</button>
      </div>
      <ul className="space-y-4">
        {day.events.map(e => (
          <li key={String(e.id)} className="text-sm space-y-1">
            <div className="font-medium">{e.description}</div>
            <div className="text-xs text-zinc-500">
              {(Number(e.expectedAmountCents) / 100).toFixed(2)} &middot; {e.effectiveStatus}
            </div>
            <div className="flex gap-2 flex-wrap">
              <form action={snoozeEvent}>
                <input type="hidden" name="eventId" value={String(e.id)} />
                <button className="text-xs px-2 py-0.5 border rounded hover:bg-zinc-50">Snooze 30d</button>
              </form>
              <form action={dismissEvent}>
                <input type="hidden" name="eventId" value={String(e.id)} />
                <button className="text-xs px-2 py-0.5 border rounded hover:bg-zinc-50">Dismiss</button>
              </form>
              {e.source === 'recurrence_group' && (
                <form action={cancelAtSource}>
                  <input type="hidden" name="eventId" value={String(e.id)} />
                  <button className="text-xs px-2 py-0.5 border rounded text-red-600 hover:bg-red-50">Cancel at source</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
