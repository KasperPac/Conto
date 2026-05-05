import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getBillsCalendar } from '@/lib/db/queries/bills-calendar';
import MonthGrid from './_components/MonthGrid';

interface Props { searchParams: Promise<Record<string, string>>; }

function lastDayOfMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

export default async function CalendarPage({ searchParams }: Props) {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const sp = await searchParams;
  const month = sp.month ?? new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;
  const end   = lastDayOfMonth(month);
  const days  = await getBillsCalendar(userId, start, end);

  return (
    <div className="p-6">
      <header className="flex items-center gap-4 mb-4">
        <h1 className="text-xl font-semibold">Bills calendar</h1>
        <a href={prevMonth(month)} className="text-sm text-zinc-600 hover:text-zinc-900">&#8249; Prev</a>
        <span className="text-sm font-mono">{month}</span>
        <a href={nextMonth(month)} className="text-sm text-zinc-600 hover:text-zinc-900">Next &#8250;</a>
      </header>
      <MonthGrid month={month} days={days} />
    </div>
  );
}

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y!, mo! - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `/runway/calendar?month=${d.toISOString().slice(0, 7)}`;
}
function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y!, mo! - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `/runway/calendar?month=${d.toISOString().slice(0, 7)}`;
}
