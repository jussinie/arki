/**
 * Explicit local date handling (ADR 7).
 * local_date format: YYYY-MM-DD
 */

export function getTodayLocalDate(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Validates a Gregorian calendar date in YYYY-MM-DD format (years 0001–9999). */
export function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.length !== 10) return false;

  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= (daysInMonth[month - 1] ?? 0);
}

function localNoon(value: string, deltaDays = 0): Date {
  if (!isValidLocalDate(value)) {
    throw new RangeError('Expected a valid YYYY-MM-DD local date');
  }

  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  // Date maps years 0–99 to 1900–1999. A full Gregorian cycle preserves leap days.
  const yearOffset = year < 100 ? 400 : 0;
  const date = new Date(
    year + yearOffset,
    month - 1,
    day + deltaDays,
    12,
    0,
    0
  );
  if (yearOffset) date.setFullYear(date.getFullYear() - yearOffset);
  return date;
}

/**
 * Shifts calendar days at local noon to avoid DST midnight/hour drift (ADR 7).
 * Throws RangeError for invalid inputs or results outside years 0001–9999.
 */
export function shiftLocalDate(value: string, deltaDays: number): string {
  if (!Number.isSafeInteger(deltaDays)) {
    throw new RangeError('Expected a safe integer day offset');
  }

  const date = localNoon(value, deltaDays);
  const result = getTodayLocalDate(date);
  if (!isValidLocalDate(result)) {
    throw new RangeError('Shifted date is outside years 0001–9999');
  }
  return result;
}

/** Formats a valid local date as e.g. "Fri, 20 Nov 2026", without UTC parsing. */
export function formatDisplayDate(value: string): string {
  return localNoon(value).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
