import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server'
import { currentFyYear, fyBounds } from '@/lib/domain/fy'
import { getPayslipSummaryForFy, getDeductibleTotalsForFy } from '@/lib/db/queries/tax'
import { estimateTax } from '@/lib/domain/tax'

function fmt(cents: bigint): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100)
}

const DEDUCTION_LABELS: Record<string, string> = {
  wfh: 'Working from home',
  donation: 'Donations (DGR)',
  work_tools: 'Work tools & equipment',
  motor_vehicle: 'Motor vehicle',
  professional_sub: 'Professional subscriptions',
  other: 'Other deductions',
}

function deductionLabel(kind: string): string {
  return DEDUCTION_LABELS[kind] ?? kind.replace(/_/g, ' ')
}

export default async function TaxEstimatePage() {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in')
    throw e
  }

  const fyYear = currentFyYear()
  const { start: fyStart, end: fyEnd } = fyBounds(fyYear)

  const [payslipSummary, deductibleTotals] = await Promise.all([
    getPayslipSummaryForFy(userId, fyStart, fyEnd),
    getDeductibleTotalsForFy(userId, fyStart, fyEnd),
  ])

  const today = new Date()
  const fyStartDate = new Date(fyStart)
  const daysSinceFyStart = Math.floor((today.getTime() - fyStartDate.getTime()) / (1000 * 60 * 60 * 24))
  const weeksElapsed = Math.max(1, Math.floor(daysSinceFyStart / 7))
  const totalFyWeeks = 52

  const fyShortLabel = `${fyYear - 1}–${String(fyYear).slice(2)}`

  const estimate = payslipSummary.payslipCount > 0
    ? estimateTax({
        fyGrossCents: payslipSummary.fyGrossCents,
        fyPaygCents: payslipSummary.fyPaygCents,
        fyDeductionsCents: deductibleTotals.grandTotalCents,
        weeksElapsed,
        totalFyWeeks,
      })
    : null

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Tax Estimate — FY {fyShortLabel}</h1>

      {estimate === null ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-zinc-500">
          <p>No payslips found for FY {fyShortLabel}.</p>
          <p className="mt-1 text-sm">
            Upload payslips on the{' '}
            <Link href="/income/payslips" className="underline">Income page</Link>.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Income panel */}
          <div className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Income</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-zinc-500">Projected annual gross</dt>
              <dd className="text-right font-medium">{fmt(estimate.projectedGrossCents)}</dd>
              <dt className="text-zinc-500">Projected PAYG withheld</dt>
              <dd className="text-right font-medium">{fmt(estimate.projectedPaygCents)}</dd>
            </dl>
            <p className="mt-3 text-xs text-zinc-500">
              Based on {payslipSummary.payslipCount} payslip{payslipSummary.payslipCount !== 1 ? 's' : ''},{' '}
              {weeksElapsed} weeks into FY {fyShortLabel}.
            </p>
          </div>

          {/* Deductions panel */}
          <div className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Deductions</h2>
            {deductibleTotals.byKind.length === 0 ? (
              <p className="text-sm text-zinc-500">No deductible expenses categorised yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="pb-2 font-normal">Category</th>
                    <th className="pb-2 font-normal text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {deductibleTotals.byKind.map(k => (
                    <tr key={k.deductionKind} className="border-t">
                      <td className="py-2">{deductionLabel(k.deductionKind)}</td>
                      <td className="py-2 text-right">{fmt(k.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium">
                    <td className="pt-3">Total deductions</td>
                    <td className="pt-3 text-right">{fmt(deductibleTotals.grandTotalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Outcome panel */}
          <div className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Estimated outcome</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-zinc-500">Taxable income</dt>
              <dd className="text-right">{fmt(estimate.projectedTaxableIncomeCents)}</dd>
              <dt className="text-zinc-500">Estimated tax liability</dt>
              <dd className="text-right">{fmt(estimate.estimatedTaxLiabilityCents)}</dd>
              <dt className="text-zinc-500">PAYG already withheld</dt>
              <dd className="text-right">{fmt(estimate.projectedPaygCents)}</dd>
            </dl>
            <div className={`mt-4 rounded-lg p-4 ${estimate.isRefund ? 'bg-green-50' : 'bg-amber-50'}`}>
              <p className={`text-lg font-semibold ${estimate.isRefund ? 'text-green-700' : 'text-amber-700'}`}>
                ~{fmt(estimate.estimatedOutcomeCents)}{' '}
                {estimate.isRefund ? 'estimated refund' : 'estimated liability'}
              </p>
            </div>
          </div>

          {/* Low-data caveat */}
          {weeksElapsed < 26 && (
            <p className="mt-4 text-sm text-amber-700 bg-amber-50 rounded p-3">
              Based on fewer than 26 weeks of payslips — estimate will be more accurate later in the FY.
            </p>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-zinc-400 mt-6">
        Estimated based on your data. General information only — not tax advice. Consult a registered tax professional.
      </p>
    </div>
  )
}
