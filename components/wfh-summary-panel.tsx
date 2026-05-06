interface MonthRow { month: string; hours: string }

interface Props {
  totalHours: string;
  byMonth: MonthRow[];
  fyLabel: string;
}

const WFH_RATE = 0.67;

function fmtDeduction(hours: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
    .format(parseFloat(hours) * WFH_RATE);
}

export function WfhSummaryPanel({ totalHours, byMonth, fyLabel }: Props) {
  const deduction = fmtDeduction(totalHours);
  return (
    <div className="rounded border p-4 flex flex-col gap-4">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">{fyLabel} total</p>
        <p className="text-3xl font-semibold mt-1">{parseFloat(totalHours).toFixed(1)}h</p>
        <p className="text-sm text-zinc-500 mt-1">Estimated deduction: <span className="font-medium text-zinc-800">{deduction}</span></p>
      </div>
      {byMonth.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-400 text-xs">
              <th className="pb-1">Month</th>
              <th className="pb-1 text-right">Hours</th>
              <th className="pb-1 text-right">Deduction</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {byMonth.map(m => (
              <tr key={m.month}>
                <td className="py-1">{m.month}</td>
                <td className="py-1 text-right">{parseFloat(m.hours).toFixed(1)}</td>
                <td className="py-1 text-right text-green-700">{fmtDeduction(m.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-zinc-400">
        Estimated deduction under PCG 2023/1 fixed-rate method (67¢/hr). Maintain these records; consult a registered tax professional for your return.
      </p>
    </div>
  );
}
