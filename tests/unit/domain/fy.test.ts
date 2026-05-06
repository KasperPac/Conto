import { describe, it, expect } from 'vitest';
import { fyBounds, fyYear, currentFyYear, calYearBounds } from '@/lib/domain/fy';

describe('fyBounds', () => {
  it('returns Jul-Jun range for given FY year', () => {
    expect(fyBounds(2026)).toEqual({ start: '2025-07-01', end: '2026-06-30' });
    expect(fyBounds(2025)).toEqual({ start: '2024-07-01', end: '2025-06-30' });
  });
});

describe('fyYear', () => {
  it('returns next calendar year for dates Jul-Dec', () => {
    expect(fyYear(new Date('2025-07-01'))).toBe(2026);
    expect(fyYear(new Date('2025-12-31'))).toBe(2026);
  });
  it('returns same calendar year for dates Jan-Jun', () => {
    expect(fyYear(new Date('2026-01-01'))).toBe(2026);
    expect(fyYear(new Date('2026-06-30'))).toBe(2026);
  });
});

describe('calYearBounds', () => {
  it('returns Jan-Dec range', () => {
    expect(calYearBounds(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });
});
