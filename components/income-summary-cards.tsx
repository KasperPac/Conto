import type { Cents } from '@/lib/types/money';

function fmt(cents: Cents): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
}

interface Props {
  grossCents: Cents;
  taxCents: Cents;
  superCents: Cents;
  netCents: Cents;
  count: number;
}

export function IncomeSummaryCards({ grossCents, taxCents, superCents, netCents, count }: Props) {
  const cards = [
    { label: 'Gross income', value: grossCents },
    { label: 'Tax withheld', value: taxCents },
    { label: 'Super', value: superCents },
    { label: 'Net pay', value: netCents },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map(c => (
        <div key={c.label} className="rounded border p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">{c.label}</p>
          <p className="text-2xl font-semibold mt-1">{fmt(c.value)}</p>
        </div>
      ))}
      <p className="col-span-full text-xs text-zinc-400">{count} payslip{count !== 1 ? 's' : ''} in period</p>
    </div>
  );
}
