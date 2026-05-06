import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getIncomeSummary, getIncomeByMonth, getIncomeByEmployer } from '@/lib/db/queries/income-summary';
import { fyBounds, calYearBounds, currentFyYear } from '@/lib/domain/fy';
import { IncomeSummaryCards } from '@/components/income-summary-cards';
import { IncomeChart } from '@/components/income-chart';

interface Props {
  searchParams: Promise<Record<string, string>>;
}

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

export default async function IncomePage({ searchParams }: Props) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in');
    throw e;
  }

  const sp = await searchParams;
  const period = sp['period'] === 'cal' ? 'cal' : 'fy';
  const year = parseInt(sp['year'] ?? String(currentFyYear()), 10);
  const bounds = period === 'fy' ? fyBounds(year) : calYearBounds(year);
  const label = period === 'fy' ? `FY ${year - 1}–${String(year).slice(2)}` : String(year);

  const [summary, monthly, byEmployer] = await Promise.all([
    getIncomeSummary(userId, bounds.start, bounds.end),
    getIncomeByMonth(userId, bounds.start, bounds.end),
    getIncomeByEmployer(userId, bounds.start, bounds.end),
  ]);

  const chartData = monthly.map(m => ({
    month: m.month,
    gross: Number(m.grossCents),
    tax: Number(m.taxCents),
    super: Number(m.superCents),
    net: Number(m.netCents),
  }));

  const otherPeriod = period === 'fy' ? 'cal' : 'fy';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Income — {label}</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/income?period=${otherPeriod}&year=${year}`}
            className="text-zinc-500 hover:text-zinc-800"
          >
            {period === 'fy' ? 'Switch to calendar year' : 'Switch to financial year'}
          </Link>
          <div className="flex gap-1">
            <Link href={`/income?period=${period}&year=${year - 1}`} className="px-2 py-1 border rounded text-xs">
              ←
            </Link>
            <Link href={`/income?period=${period}&year=${year + 1}`} className="px-2 py-1 border rounded text-xs">
              →
            </Link>
          </div>
        </div>
      </div>

      <IncomeSummaryCards
        grossCents={summary.grossCents}
        taxCents={summary.taxCents}
        superCents={summary.superCents}
        netCents={summary.netCents}
        count={summary.count}
      />

      <div className="mb-8">
        <IncomeChart data={chartData} />
      </div>

      {byEmployer.length >= 2 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-zinc-700 mb-3">By employer</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b">
                <th className="pb-2 pr-4">Employer</th>
                <th className="pb-2 pr-4 text-right">Gross</th>
                <th className="pb-2 pr-4 text-right">Tax</th>
                <th className="pb-2 pr-4 text-right">Super</th>
                <th className="pb-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byEmployer.map(e => (
                <tr key={e.employer}>
                  <td className="py-2 pr-4">{e.employer}</td>
                  <td className="py-2 pr-4 text-right">{fmt(e.grossCents)}</td>
                  <td className="py-2 pr-4 text-right">{fmt(e.taxCents)}</td>
                  <td className="py-2 pr-4 text-right">{fmt(e.superCents)}</td>
                  <td className="py-2 text-right">{fmt(e.netCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
