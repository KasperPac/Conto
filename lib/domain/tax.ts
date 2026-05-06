/**
 * Tax estimation for Australian FY 2025-26
 * Applies ATO tax brackets, Medicare levy, and Low Income Tax Offset (LITO)
 */

export interface TaxEstimateInput {
  fyGrossCents: bigint;
  fyPaygCents: bigint;
  fyDeductionsCents: bigint;
  weeksElapsed: number;
  totalFyWeeks: number;
}

export interface TaxEstimate {
  projectedGrossCents: bigint;
  totalDeductionsCents: bigint;
  projectedTaxableIncomeCents: bigint;
  estimatedTaxLiabilityCents: bigint;
  projectedPaygCents: bigint;
  estimatedOutcomeCents: bigint;
  isRefund: boolean;
}

/**
 * ATO Tax brackets for FY 2025-26
 * Rates stored as per 10,000 to handle 32.5% bracket with integer arithmetic
 */
interface TaxBracket {
  threshold: bigint | null;
  ratePer10000: bigint;
  base: bigint;
}

const BRACKETS: TaxBracket[] = [
  { threshold: 0n, ratePer10000: 0n, base: 0n }, // $0–$18,200: 0%
  { threshold: 1_820_000n, ratePer10000: 1900n, base: 0n }, // $18,201–$45,000: 19%
  { threshold: 4_500_000n, ratePer10000: 3250n, base: 509_200n }, // $45,001–$120,000: 32.5%
  { threshold: 12_000_000n, ratePer10000: 3700n, base: 2_946_700n }, // $120,001–$180,000: 37%
  { threshold: 18_000_000n, ratePer10000: 4500n, base: 5_166_700n }, // $180,001+: 45%
];

const MEDICARE_THRESHOLD_CENTS = 2_600_000n; // $26,000
const MEDICARE_RATE_PER_10000 = 200n; // 2%

const LITO_MAX_CENTS = 70_000n; // $700
const LITO_PHASE_START_CENTS = 3_750_000n; // $37,500
const LITO_PHASE_END_CENTS = 6_666_700n; // $66,667

/**
 * Calculate tax liability for a given taxable income
 * Returns: bracket tax + Medicare levy - LITO (floored at 0)
 */
function calculateTaxLiability(taxableIncomeCents: bigint): bigint {
  if (taxableIncomeCents <= 0n) {
    return 0n;
  }

  // Find applicable bracket by finding the highest threshold that income exceeds
  let applicableBracket = BRACKETS[0];
  let incomeAboveThreshold = taxableIncomeCents;

  for (const bracket of BRACKETS) {
    if (taxableIncomeCents > bracket.threshold) {
      applicableBracket = bracket;
      incomeAboveThreshold = taxableIncomeCents - bracket.threshold;
    }
  }

  // Calculate bracket tax
  const bracketTax = applicableBracket.base + (incomeAboveThreshold * applicableBracket.ratePer10000) / 10000n;

  // Calculate Medicare levy (2% above $26,000)
  const medicareLevi =
    taxableIncomeCents > MEDICARE_THRESHOLD_CENTS
      ? (taxableIncomeCents * MEDICARE_RATE_PER_10000) / 10000n
      : 0n;

  // Calculate LITO
  let lito: bigint;
  if (taxableIncomeCents <= LITO_PHASE_START_CENTS) {
    lito = LITO_MAX_CENTS;
  } else if (taxableIncomeCents >= LITO_PHASE_END_CENTS) {
    lito = 0n;
  } else {
    // Phase out linearly
    const phaseRange = LITO_PHASE_END_CENTS - LITO_PHASE_START_CENTS;
    const incomeIntoPhase = taxableIncomeCents - LITO_PHASE_START_CENTS;
    lito = LITO_MAX_CENTS - (LITO_MAX_CENTS * incomeIntoPhase) / phaseRange;
  }

  // Tax liability = tax + medicare - LITO, floored at 0
  const liability = bracketTax + medicareLevi - lito;
  return liability < 0n ? 0n : liability;
}

export function estimateTax(input: TaxEstimateInput): TaxEstimate {
  // Guard against weeksElapsed < 1
  const weeksElapsed = Math.max(1, input.weeksElapsed);

  // Annualise gross and PAYG
  // Formula: projected = (fy / weeksElapsed) * totalFyWeeks
  // Using integer arithmetic: (fy * totalFyWeeks) / weeksElapsed
  const weeksElapsedBigInt = BigInt(Math.floor(weeksElapsed));
  const totalFyWeeksBigInt = BigInt(input.totalFyWeeks);

  const projectedGrossCents = (input.fyGrossCents * totalFyWeeksBigInt) / weeksElapsedBigInt;
  const projectedPaygCents = (input.fyPaygCents * totalFyWeeksBigInt) / weeksElapsedBigInt;

  // Calculate taxable income (clamped to 0)
  const projectedTaxableIncomeCents = projectedGrossCents - input.fyDeductionsCents;
  const clampedTaxableIncome = projectedTaxableIncomeCents < 0n ? 0n : projectedTaxableIncomeCents;

  // Calculate tax liability
  const estimatedTaxLiabilityCents = calculateTaxLiability(clampedTaxableIncome);

  // Calculate outcome: positive = refund, negative = bill
  const estimatedOutcomeCents = projectedPaygCents - estimatedTaxLiabilityCents;

  return {
    projectedGrossCents,
    totalDeductionsCents: input.fyDeductionsCents,
    projectedTaxableIncomeCents: clampedTaxableIncome,
    estimatedTaxLiabilityCents,
    projectedPaygCents,
    estimatedOutcomeCents,
    isRefund: estimatedOutcomeCents >= 0n,
  };
}
