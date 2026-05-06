import type { Cents } from '@/lib/types/money';

export interface PayslipInput {
  payDate: string;
  netCents: Cents;
  employer: string;
}

export interface TransactionCandidate {
  id: string;
  postedDate: string;
  amountCents: Cents;
  descriptionRaw: string;
}

export interface PayCadenceInput {
  employer: string;
  cadence: string;
}

export interface LinkCandidate {
  transactionId: string;
  confidence: number;
}

export function matchPayslipToIncome(
  payslip: PayslipInput,
  candidates: TransactionCandidate[],
  payCadences: PayCadenceInput[],
): LinkCandidate[] {
  const results: LinkCandidate[] = [];
  const employerWord = payslip.employer.toLowerCase().split(/\s+/)[0] ?? '';

  for (const tx of candidates) {
    // Exclude transactions with wrong amount
    if (tx.amountCents !== payslip.netCents) continue;

    // Exclude negative (debit) transactions
    if (tx.amountCents <= BigInt(0)) continue;

    // Exclude transactions more than 3 days apart
    if (Math.abs(daysBetween(tx.postedDate, payslip.payDate)) > 3) continue;

    // Base confidence: exact amount + date within ±3 days
    let confidence = 0.70;

    // Add 0.20 when description contains employer word
    if (employerWord && tx.descriptionRaw.toLowerCase().includes(employerWord)) {
      confidence += 0.20;
    }

    // Add 0.10 when pay cadence matches employer
    if (employerWord && payCadences.some(pc => pc.employer.toLowerCase().includes(employerWord))) {
      confidence += 0.10;
    }

    // Cap at 1.0
    results.push({ transactionId: tx.id, confidence: Math.min(confidence, 1.0) });
  }

  // Sort results descending by confidence
  return results.sort((a, b) => b.confidence - a.confidence);
}

function daysBetween(a: string, b: string): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}
