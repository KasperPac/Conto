'use client';
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { LiquidityPreview } from '@/lib/types/cashflow';

export default function RunwayChart({ preview }: { preview: LiquidityPreview }) {
  const buffer = Number(preview.bufferCents);
  const data = preview.points.map(p => ({
    date: (p.date as string).slice(5), // MM-DD
    mid:  Number(p.projectedBalanceCents),
    low:  Number(p.lowCents),
    high: Number(p.highCents),
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 48 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={v => `$${(v/100).toFixed(0)}`} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: unknown) => `$${(Number(v)/100).toFixed(2)}`} />
        <Area type="monotone" dataKey="high" stroke="#93c5fd" fill="#eff6ff" fillOpacity={0.6} />
        <Area type="monotone" dataKey="low"  stroke="#93c5fd" fill="#ffffff" fillOpacity={1} />
        <Line type="monotone" dataKey="mid"  stroke="#2563eb" dot={false} strokeWidth={2} />
        <ReferenceLine y={buffer} stroke="#f59e0b" strokeDasharray="4 2"
                       label={{ value: 'Buffer', position: 'insideTopLeft', fontSize: 11 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
