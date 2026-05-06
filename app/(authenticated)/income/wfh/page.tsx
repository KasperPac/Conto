import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getWfhEntriesByMonth, getWfhSummaryByFY } from '@/lib/db/queries/wfh-entries';
import { fyBounds, currentFyYear } from '@/lib/domain/fy';
import { WfhCalendar } from '@/components/wfh-calendar';
import { WfhSummaryPanel } from '@/components/wfh-summary-panel';

interface Props { searchParams: Promise<Record<string, string>> }

export default async function WfhPage({ searchParams }: Props) {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const sp = await searchParams;
  const now = new Date();
  const year  = parseInt(sp['year']  ?? String(now.getFullYear()), 10);
  const month = parseInt(sp['month'] ?? String(now.getMonth() + 1), 10);
  const fyYear = parseInt(sp['fy'] ?? String(currentFyYear()), 10);
  const { start: fyStart, end: fyEnd } = fyBounds(fyYear);
  const fyLabel = `FY ${fyYear - 1}–${String(fyYear).slice(2)}`;

  const prevMonth = month === 1  ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextMonth = month === 12 ? { year: year + 1, month: 1  } : { year, month: month + 1 };

  const [entries, summary] = await Promise.all([
    getWfhEntriesByMonth(userId, year, month),
    getWfhSummaryByFY(userId, fyStart, fyEnd),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">WFH Hours Tracker</h1>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-8">
        <WfhCalendar
          year={year}
          month={month}
          entries={entries.map(e => ({ date: e.date, hours: e.hours }))}
          prevHref={`/income/wfh?year=${prevMonth.year}&month=${prevMonth.month}&fy=${fyYear}`}
          nextHref={`/income/wfh?year=${nextMonth.year}&month=${nextMonth.month}&fy=${fyYear}`}
        />
        <WfhSummaryPanel
          totalHours={summary.totalHours}
          byMonth={summary.byMonth}
          fyLabel={fyLabel}
        />
      </div>
    </div>
  );
}
