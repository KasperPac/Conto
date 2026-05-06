import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server'
import { getSuperCapData } from '@/lib/db/queries/tax'
import { currentFY, fyLabel } from '@/lib/utils/fy'

const CAP_CENTS = 2_750_000n  // $27,500 concessional cap

function fmt(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents
  const dollars = abs / 100n
  const c = abs % 100n
  return (cents < 0n ? '-$' : '$') + dollars.toString() + '.' + String(c).padStart(2, '0')
}

export default async function SuperPage() {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in')
    throw e
  }

  const fy = currentFY()
  const data = await getSuperCapData(userId, fy.start, fy.end)
  const label = fyLabel(fy.start)

  const totalContributed = data.totalSuperCents + data.totalSalarySacrificeCents
  const headroom = CAP_CENTS - totalContributed
  const pct = totalContributed >= CAP_CENTS
    ? 100
    : Number((totalContributed * 100n) / CAP_CENTS)

  // Projection: weeks elapsed from FY start to today, project to 30 June
  const fyStart = new Date(fy.start)
  const fyEnd = new Date(fy.end)
  const today = new Date()
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  // Math.max(1, ...) prevents division by zero; projection may over-extrapolate in the first few weeks of a FY
  const weeksElapsed = Math.max(1, Math.floor((today.getTime() - fyStart.getTime()) / msPerWeek))
  const totalWeeks = Math.ceil((fyEnd.getTime() - fyStart.getTime()) / msPerWeek)
  const weeklyAvg = totalContributed / BigInt(weeksElapsed)
  const projected = weeklyAvg * BigInt(totalWeeks)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Super contributions</h1>
        <span className="text-sm text-muted-foreground">FY {label}</span>
      </div>

      {/* Cap meter */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">{fmt(totalContributed)} contributed</span>
          <span className="text-muted-foreground">
            {headroom > 0n ? fmt(headroom) + ' remaining' : 'Cap reached'}
          </span>
        </div>
        <div className="h-3 rounded-full bg-zinc-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${totalContributed >= CAP_CENTS ? 'bg-amber-500' : 'bg-zinc-900'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {pct}% of $27,500 concessional cap
        </div>
      </div>

      {/* Projection */}
      {totalContributed > 0n && (
        <>
          {projected > CAP_CENTS ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              At current pace you&apos;re on track to exceed the concessional cap (~{fmt(projected)} by 30 June).
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              At current pace you&apos;ll contribute ~{fmt(projected)} by 30 June.
            </p>
          )}
        </>
      )}

      {/* Payslip breakdown */}
      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No payslips found for FY {label}. Upload payslips on the{' '}
          <Link href="/income" className="underline">Income page</Link> to track your super contributions.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Employer super</th>
                <th className="px-4 py-3 text-right">Salary sacrifice</th>
                <th className="px-4 py-3 text-right">Running total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rows.map(row => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.payDate}</td>
                  <td className="px-4 py-3 text-right">{fmt(row.superCents)}</td>
                  <td className="px-4 py-3 text-right">
                    {row.salarySacrificeCents > 0n ? fmt(row.salarySacrificeCents) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(row.runningTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
