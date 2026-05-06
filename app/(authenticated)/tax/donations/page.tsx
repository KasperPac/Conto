import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server'
import { getDonationData } from '@/lib/db/queries/tax'
import { currentFY, fyLabel } from '@/lib/utils/fy'

function fmt(cents: bigint): string {
  return '$' + (cents / 100n).toString() + '.' + String(cents % 100n).padStart(2, '0')
}

export default async function DonationsPage() {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in')
    throw e
  }

  const fy = currentFY()
  const data = await getDonationData(userId, fy.start, fy.end)
  const label = fyLabel(fy.start)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Donations</h1>
        <span className="text-sm text-muted-foreground">FY {label}</span>
      </div>

      {/* FY total */}
      <div className="space-y-1">
        <div className="text-4xl font-bold">{fmt(data.totalCents)}</div>
        <div className="text-sm text-muted-foreground">
          {data.rows.length} {data.rows.length === 1 ? 'transaction' : 'transactions'} · DGR-registered only · FY {label}
        </div>
      </div>

      {/* Transaction list */}
      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No donations categorised this FY. Transactions categorised as &ldquo;Donations — DGR-registered&rdquo; will appear here automatically.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {data.rows.map((row, i) => (
            <div
              key={row.id}
              className={`flex items-center justify-between px-4 py-3 text-sm ${i < data.rows.length - 1 ? 'border-b' : ''}`}
            >
              <div className="space-y-0.5">
                <div className="font-medium">{row.merchantName ?? row.description}</div>
                <div className="text-xs text-muted-foreground">{row.date}</div>
              </div>
              <div className="font-medium">{fmt(row.amountCents)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
