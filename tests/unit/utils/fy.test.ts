import { describe, it, expect } from 'vitest'
import { currentFY, fyLabel } from '@/lib/utils/fy'

describe('currentFY', () => {
  it('returns correct FY for a date in August (first half of FY)', () => {
    const fy = currentFY(new Date('2025-08-15'))
    expect(fy.start).toBe('2025-07-01')
    expect(fy.end).toBe('2026-06-30')
  })

  it('returns correct FY for a date in March (second half of FY)', () => {
    const fy = currentFY(new Date('2026-03-10'))
    expect(fy.start).toBe('2025-07-01')
    expect(fy.end).toBe('2026-06-30')
  })

  it('returns current FY for 1 July (FY start boundary)', () => {
    const fy = currentFY(new Date('2025-07-01'))
    expect(fy.start).toBe('2025-07-01')
    expect(fy.end).toBe('2026-06-30')
  })

  it('returns previous FY for 30 June (FY end boundary)', () => {
    const fy = currentFY(new Date('2026-06-30'))
    expect(fy.start).toBe('2025-07-01')
    expect(fy.end).toBe('2026-06-30')
  })

  it('uses today when no date provided', () => {
    const fy = currentFY()
    expect(fy.start).toMatch(/^\d{4}-07-01$/)
    expect(fy.end).toMatch(/^\d{4}-06-30$/)
  })
})

describe('fyLabel', () => {
  it('formats FY start year correctly', () => {
    expect(fyLabel('2025-07-01')).toBe('2025–26')
    expect(fyLabel('2024-07-01')).toBe('2024–25')
  })
})
