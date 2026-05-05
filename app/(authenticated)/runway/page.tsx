import { redirect } from 'next/navigation';
import { getLiquidityPreview } from '@/lib/db/queries/liquidity-preview';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import RunwayChart from './_components/RunwayChart';
import UpcomingEventsList from './_components/UpcomingEventsList';
import { setCashflowBuffer } from './actions/set-buffer';

interface Props { searchParams: Promise<Record<string, string>>; }

export default async function RunwayPage({ searchParams }: Props) {
  let userId: string;
  try { userId = await getCurrentUserId(); }
  catch (e) { if (e instanceof UnauthenticatedError) redirect('/sign-in'); throw e; }

  const sp = await searchParams;
  const horizon = ([30, 60, 90] as const).find(n => String(n) === sp.horizon) ?? 30;
  const preview = await getLiquidityPreview(userId, horizon);

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Runway</h1>
        <nav className="flex gap-2 text-sm">
          {([30, 60, 90] as const).map(h => (
            <a key={h} href={`/runway?horizon=${h}`}
               className={`px-3 py-1 rounded border ${h === horizon ? 'bg-zinc-800 text-white border-zinc-800' : 'border-zinc-300'}`}>
              {h}d
            </a>
          ))}
        </nav>
      </header>

      <RunwayChart preview={preview} />

      <form action={setCashflowBuffer} className="text-sm flex items-center gap-2">
        <label htmlFor="buffer" className="text-zinc-600">Buffer</label>
        <input id="buffer" name="bufferCents" type="number"
               defaultValue={String(preview.bufferCents)}
               className="border rounded px-2 py-1 w-32 text-sm" />
        <button type="submit" className="px-3 py-1 border rounded text-sm">Save</button>
      </form>

      <UpcomingEventsList points={preview.points} />
    </div>
  );
}
