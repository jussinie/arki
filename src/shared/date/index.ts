/**
 * Explicit local date handling (ADR 7).
 * local_date format: YYYY-MM-DD
 */

export function getTodayLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
