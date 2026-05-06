export function fyYear(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear();
}

export function currentFyYear(): number {
  return fyYear(new Date());
}

export function fyBounds(year: number): { start: string; end: string } {
  return { start: `${year - 1}-07-01`, end: `${year}-06-30` };
}

export function calYearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}
