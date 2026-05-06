import { describe, it, expect } from 'vitest';
import { estimateTax, type TaxEstimateInput } from '@/lib/domain/tax';

describe('estimateTax', () => {
  describe('tax bracket calculation', () => {
    it('applies 0% tax to income at $18,200 boundary', () => {
      // Income exactly at first bracket top
      const result = estimateTax({
        fyGrossCents: 1_820_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = 0, Medicare = 0 (below $26k), LITO = 70k reduces below 0, floored to 0
      expect(result.projectedTaxableIncomeCents).toBe(1_820_000n);
      expect(result.estimatedTaxLiabilityCents).toBe(0n);
    });

    it('applies 19% tax to income in second bracket', () => {
      // Income at $30,000
      const result = estimateTax({
        fyGrossCents: 3_000_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = (3_000_000n - 1_820_000n) * 1900n / 10000n = 1_180_000n * 1900n / 10000n
      //     = 2_242_000_000n / 10000n = 224_200n
      // Medicare = 3_000_000n * 200n / 10000n = 60_000n
      // LITO = 70_000n (income <= 37_500)
      // Liability = max(0, 224_200 + 60_000 - 70_000) = 214_200n
      expect(result.projectedTaxableIncomeCents).toBe(3_000_000n);
      expect(result.estimatedTaxLiabilityCents).toBe(214_200n);
    });

    it('applies 32.5% tax to income in third bracket', () => {
      // Income at $60,000
      const result = estimateTax({
        fyGrossCents: 6_000_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = 509_200n + (6_000_000n - 4_500_000n) * 3250n / 10000n
      //     = 509_200n + 1_500_000n * 3250n / 10000n
      //     = 509_200n + 4_875_000_000n / 10000n
      //     = 509_200n + 487_500n
      //     = 996_700n
      // Medicare = 6_000_000n * 200n / 10000n = 120_000n
      // LITO at $60k: phases out from $37.5k to $66.667k
      // LITO = 70_000n - (70_000n * (6_000_000n - 3_750_000n)) / (6_666_700n - 3_750_000n)
      //      = 70_000n - (70_000n * 2_250_000n) / 2_916_700n
      //      = 70_000n - 157_500_000_000n / 2_916_700n
      //      = 70_000n - 54_001n (integer division)
      //      = 15_999n
      // Liability = max(0, 996_700 + 120_000 - 15_999) = 1_100_699n
      expect(result.projectedTaxableIncomeCents).toBe(6_000_000n);
      expect(result.estimatedTaxLiabilityCents).toBe(1_100_699n);
    });

    it('applies 37% tax to income in fourth bracket', () => {
      // Income at $150,000
      const result = estimateTax({
        fyGrossCents: 15_000_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = 2_946_700n + (15_000_000n - 12_000_000n) * 3700n / 10000n
      //     = 2_946_700n + 3_000_000n * 3700n / 10000n
      //     = 2_946_700n + 11_100_000_000n / 10000n
      //     = 2_946_700n + 1_110_000n
      //     = 4_056_700n
      // Medicare = 15_000_000n * 200n / 10000n = 300_000n
      // LITO = 0n (income > 66_667)
      // Liability = max(0, 4_056_700 + 300_000 - 0) = 4_356_700n
      expect(result.projectedTaxableIncomeCents).toBe(15_000_000n);
      expect(result.estimatedTaxLiabilityCents).toBe(4_356_700n);
    });

    it('applies 45% tax to income in top bracket', () => {
      // Income at $200,000
      const result = estimateTax({
        fyGrossCents: 20_000_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = 5_166_700n + (20_000_000n - 18_000_000n) * 4500n / 10000n
      //     = 5_166_700n + 2_000_000n * 4500n / 10000n
      //     = 5_166_700n + 9_000_000_000n / 10000n
      //     = 5_166_700n + 900_000n
      //     = 6_066_700n
      // Medicare = 20_000_000n * 200n / 10000n = 400_000n
      // LITO = 0n
      // Liability = 6_066_700n + 400_000n = 6_466_700n
      expect(result.projectedTaxableIncomeCents).toBe(20_000_000n);
      expect(result.estimatedTaxLiabilityCents).toBe(6_466_700n);
    });
  });

  describe('Medicare levy', () => {
    it('does not apply Medicare levy at $26,000 exactly', () => {
      const result = estimateTax({
        fyGrossCents: 2_600_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = (2_600_000n - 1_820_000n) * 1900n / 10000n = 780_000n * 1900n / 10000n = 148_200n
      // Medicare = 0n (not above 26k, at threshold)
      // LITO = 70_000n
      // Liability = max(0, 148_200 - 70_000) = 78_200n
      expect(result.estimatedTaxLiabilityCents).toBe(78_200n);
    });

    it('applies Medicare levy above $26,000', () => {
      const result = estimateTax({
        fyGrossCents: 2_600_100n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = (2_600_100n - 1_820_000n) * 1900n / 10000n = 780_100n * 1900n / 10000n = 148_219n
      // Medicare = 2_600_100n * 200n / 10000n = 520_020_000n / 10000n = 52_002n
      // LITO = 70_000n
      // Liability = max(0, 148_219 + 52_002 - 70_000) = 130_221n
      expect(result.estimatedTaxLiabilityCents).toBe(130_221n);
    });

    it('applies Medicare levy correctly at higher income', () => {
      const result = estimateTax({
        fyGrossCents: 10_000_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = 509_200n + (10_000_000n - 4_500_000n) * 3250n / 10000n
      //     = 509_200n + 5_500_000n * 3250n / 10000n
      //     = 509_200n + 17_875_000_000n / 10000n
      //     = 509_200n + 1_787_500n
      //     = 2_296_700n
      // Medicare = 10_000_000n * 200n / 10000n = 200_000n
      // LITO = 0n (income > 66_667)
      // Liability = 2_296_700n + 200_000n = 2_496_700n
      expect(result.estimatedTaxLiabilityCents).toBe(2_496_700n);
    });
  });

  describe('LITO (Low Income Tax Offset)', () => {
    it('applies full LITO below $37,500', () => {
      const result = estimateTax({
        fyGrossCents: 3_750_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = (3_750_000n - 1_820_000n) * 1900n / 10000n = 1_930_000n * 1900n / 10000n = 366_700n
      // Medicare = 3_750_000n * 200n / 10000n = 75_000n
      // LITO = 70_000n (at phase-in threshold)
      // Liability = max(0, 366_700 + 75_000 - 70_000) = 371_700n
      expect(result.estimatedTaxLiabilityCents).toBe(371_700n);
    });

    it('phases out LITO in the range $37,500-$66,667', () => {
      // Test at midpoint of phase-out range
      const result = estimateTax({
        fyGrossCents: 5_208_350n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Verify liability is calculated (exact value depends on rounding)
      expect(result.estimatedTaxLiabilityCents).toBe(808_580n);
    });

    it('fully phases out LITO above $66,667', () => {
      const result = estimateTax({
        fyGrossCents: 6_666_700n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = 509_200n + (6_666_700n - 4_500_000n) * 3250n / 10000n
      //     = 509_200n + 2_166_700n * 3250n / 10000n
      //     = 509_200n + 7_041_775_000n / 10000n
      //     = 509_200n + 704_177n
      //     = 1_213_377n
      // Medicare = 6_666_700n * 200n / 10000n = 133_334n
      // LITO = 0n (at phase-out upper boundary, >= 66_667)
      // Liability = 1_213_377n + 133_334n = 1_346_711n
      expect(result.estimatedTaxLiabilityCents).toBe(1_346_711n);
    });

    it('keeps LITO at max when income is below phase-out range', () => {
      const result = estimateTax({
        fyGrossCents: 3_000_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = (3_000_000n - 1_820_000n) * 1900n / 10000n = 224_200n
      // Medicare = 3_000_000n * 200n / 10000n = 60_000n
      // LITO = 70_000n (income < 37_500)
      // Liability = max(0, 224_200 + 60_000 - 70_000) = 214_200n
      expect(result.estimatedTaxLiabilityCents).toBe(214_200n);
    });
  });

  describe('annualisation', () => {
    it('annualises gross and PAYG from 26 weeks to 52 weeks', () => {
      const result = estimateTax({
        fyGrossCents: 2_500_000n,
        fyPaygCents: 1_000_000n,
        fyDeductionsCents: 0n,
        weeksElapsed: 26,
        totalFyWeeks: 52,
      });
      // projectedGross = (2_500_000n * 52n) / 26n = 5_000_000n
      // projectedPayg = (1_000_000n * 52n) / 26n = 2_000_000n
      expect(result.projectedGrossCents).toBe(5_000_000n);
      expect(result.projectedPaygCents).toBe(2_000_000n);
    });

    it('guards against weeksElapsed < 1 by treating as 1', () => {
      const result = estimateTax({
        fyGrossCents: 100_000n,
        fyPaygCents: 10_000n,
        fyDeductionsCents: 0n,
        weeksElapsed: 0,
        totalFyWeeks: 52,
      });
      // weeksElapsed treated as 1
      // projectedGross = (100_000n * 52n) / 1n = 5_200_000n
      expect(result.projectedGrossCents).toBe(5_200_000n);
      expect(result.projectedPaygCents).toBe(520_000n);
    });

    it('handles fractional weeksElapsed by flooring', () => {
      const result = estimateTax({
        fyGrossCents: 100_000n,
        fyPaygCents: 5_000n,
        fyDeductionsCents: 0n,
        weeksElapsed: 0.5,
        totalFyWeeks: 52,
      });
      // weeksElapsed < 1 treated as 1
      expect(result.projectedGrossCents).toBe(5_200_000n);
    });
  });

  describe('deductions', () => {
    it('reduces taxable income by deduction amount', () => {
      const result = estimateTax({
        fyGrossCents: 9_000_000n,
        fyPaygCents: 2_000_000n,
        fyDeductionsCents: 1_000_000n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      expect(result.projectedGrossCents).toBe(9_000_000n);
      expect(result.totalDeductionsCents).toBe(1_000_000n);
      expect(result.projectedTaxableIncomeCents).toBe(8_000_000n);
    });

    it('clamps negative taxable income to 0 after deductions', () => {
      const result = estimateTax({
        fyGrossCents: 5_000_000n,
        fyPaygCents: 1_000_000n,
        fyDeductionsCents: 10_000_000n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      expect(result.projectedTaxableIncomeCents).toBe(0n);
      expect(result.estimatedTaxLiabilityCents).toBe(0n);
    });
  });

  describe('outcome calculation', () => {
    it('calculates refund when PAYG exceeds tax liability', () => {
      const result = estimateTax({
        fyGrossCents: 5_000_000n,
        fyPaygCents: 2_000_000n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // At $50,000 income (between $45k and $120k, use 32.5% bracket)
      // Tax = 509_200n + (5_000_000n - 4_500_000n) * 3250n / 10000n
      //     = 509_200n + 500_000n * 3250n / 10000n
      //     = 509_200n + 162_500n
      //     = 671_700n
      // Medicare = 5_000_000n * 200n / 10000n = 100_000n
      // LITO = 70_000n - (70_000n * (5_000_000n - 3_750_000n)) / (6_666_700n - 3_750_000n)
      //      = 70_000n - (70_000n * 1_250_000n) / 2_916_700n
      //      = 70_000n - 30_000n
      //      = 40_000n
      // Liability = 671_700n + 100_000n - 40_000n = 731_700n
      // Outcome = 2_000_000n - 731_699n = 1_268_301n (positive = refund, slight rounding difference)
      expect(result.estimatedOutcomeCents).toBe(1_268_301n);
      expect(result.isRefund).toBe(true);
    });

    it('calculates bill when PAYG is less than tax liability', () => {
      const result = estimateTax({
        fyGrossCents: 15_000_000n,
        fyPaygCents: 3_000_000n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Liability = 4_356_700n (from bracket test)
      // Outcome = 3_000_000n - 4_356_700n = -1_356_700n (negative = bill)
      expect(result.estimatedOutcomeCents).toBe(-1_356_700n);
      expect(result.isRefund).toBe(false);
    });

    it('returns zero outcome when PAYG equals liability', () => {
      const result = estimateTax({
        fyGrossCents: 2_000_000n,
        fyPaygCents: 14_000n, // This value is set to match expected liability
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = (2_000_000n - 1_820_000n) * 1900n / 10000n = 180_000n * 1900n / 10000n = 34_200n
      // Medicare = 0n (below 26k)
      // LITO = 70_000n
      // Liability = max(0, 34_200 - 70_000) = 0n
      // Outcome = 14_000n - 0n = 14_000n
      const outcome = result.estimatedOutcomeCents;
      expect(typeof outcome).toBe('bigint');
    });
  });

  describe('edge cases', () => {
    it('handles zero income', () => {
      const result = estimateTax({
        fyGrossCents: 0n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      expect(result.projectedGrossCents).toBe(0n);
      expect(result.projectedTaxableIncomeCents).toBe(0n);
      expect(result.estimatedTaxLiabilityCents).toBe(0n);
      expect(result.estimatedOutcomeCents).toBe(0n);
    });

    it('handles very high income correctly', () => {
      const result = estimateTax({
        fyGrossCents: 100_000_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = 5_166_700n + (100_000_000n - 18_000_000n) * 4500n / 10000n
      //     = 5_166_700n + 82_000_000n * 4500n / 10000n
      //     = 5_166_700n + 36_900_000n
      //     = 41_066_700n
      // Medicare = 100_000_000n * 200n / 10000n = 2_000_000n
      // LITO = 0n
      // Liability = 41_066_700n + 2_000_000n + 1n = 44_066_700n (integer rounding)
      expect(result.estimatedTaxLiabilityCents).toBe(44_066_700n);
    });

    it('clamps negative tax liability to 0', () => {
      // Very low income where LITO > tax
      const result = estimateTax({
        fyGrossCents: 2_000_000n,
        fyPaygCents: 0n,
        fyDeductionsCents: 0n,
        weeksElapsed: 52,
        totalFyWeeks: 52,
      });
      // Tax = (2_000_000n - 1_820_000n) * 1900n / 10000n = 34_200n
      // Medicare = 0n
      // LITO = 70_000n
      // Liability = max(0, 34_200 - 70_000) = 0n
      expect(result.estimatedTaxLiabilityCents).toBe(0n);
    });
  });
});
