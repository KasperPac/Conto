import { fyBounds, fyYear } from '@/lib/domain/fy'

export interface FYRange {
  start: string  // 'YYYY-MM-DD'
  end: string    // 'YYYY-MM-DD'
}

export function currentFY(date?: Date): FYRange {
  const d = date ?? new Date()
  return fyBounds(fyYear(d))
}

// Formats FY start date as "2025–26" (en-dash U+2013)
export function fyLabel(fyStart: string): string {
  const year = parseInt(fyStart.slice(0, 4), 10)
  return `${year}–${String(year + 1).slice(2)}`
}
