'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DataPoint {
  month: string;
  gross: number;
  tax: number;
  super: number;
  net: number;
}

interface Props {
  data: DataPoint[];
}

export function IncomeChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-zinc-400 text-sm">No data for this period</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={v => `$${(Number(v) / 100).toFixed(0)}`} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: unknown) =>
          new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(v) / 100)
        } />
        <Legend />
        <Bar dataKey="gross" name="Gross" fill="#6366f1" />
        <Bar dataKey="tax" name="Tax withheld" fill="#f87171" />
        <Bar dataKey="super" name="Super" fill="#34d399" />
        <Bar dataKey="net" name="Net" fill="#60a5fa" />
      </BarChart>
    </ResponsiveContainer>
  );
}
