export interface FYRange {
  start: string  // 'YYYY-MM-DD'
  end: string    // 'YYYY-MM-DD'
}

export function currentFY(date?: Date): FYRange {
  const d = date ?? new Date()
  const month = d.getMonth() + 1  // 1-based
  const year = d.getFullYear()
  const fyYear = month < 7 ? year - 1 : year
  return {
    start: `${fyYear}-07-01`,
    end: `${fyYear + 1}-06-30`,
  }
}

// Formats FY start date as "2025–26" (en-dash U+2013)
export function fyLabel(fyStart: string): string {
  const year = parseInt(fyStart.slice(0, 4), 10)
  return `${year}–${String(year + 1).slice(2)}`
}
