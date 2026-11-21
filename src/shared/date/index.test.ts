import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { getTodayLocalDate } from './index';
import * as localDates from './index';

describe('getTodayLocalDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats local calendar components as zero-padded YYYY-MM-DD', () => {
    expect(getTodayLocalDate(new Date(2026, 0, 5, 15, 0, 0))).toBe(
      '2026-01-05'
    );
    expect(getTodayLocalDate(new Date(2026, 8, 9, 0, 0, 0))).toBe('2026-09-09');
    expect(getTodayLocalDate(new Date(2026, 11, 31, 23, 59, 59))).toBe(
      '2026-12-31'
    );
    expect(getTodayLocalDate(new Date(2024, 1, 29, 12, 0, 0))).toBe(
      '2024-02-29'
    );
  });

  it('uses the current local date when the caller does not pass one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 4, 8, 30, 0));
    expect(getTodayLocalDate()).toBe('2026-07-04');
  });

  it('reads local getters and does not use the UTC calendar day', () => {
    const date = new Date(2026, 0, 5, 0, 30, 0);
    const toIsoString = vi.spyOn(date, 'toISOString');
    const getUtcFullYear = vi.spyOn(date, 'getUTCFullYear');
    const getUtcMonth = vi.spyOn(date, 'getUTCMonth');
    const getUtcDate = vi.spyOn(date, 'getUTCDate');

    expect(getTodayLocalDate(date)).toBe('2026-01-05');
    expect(toIsoString).not.toHaveBeenCalled();
    expect(getUtcFullYear).not.toHaveBeenCalled();
    expect(getUtcMonth).not.toHaveBeenCalled();
    expect(getUtcDate).not.toHaveBeenCalled();
  });

  it('always matches the local year, month, and day of the given Date', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date(Date.UTC(1970, 0, 1)),
          max: new Date(Date.UTC(2100, 11, 31)),
          noInvalidDate: true,
        }),
        (date) => {
          const actual = getTodayLocalDate(date);
          expect(actual).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          const [year, month, day] = actual.split('-').map(Number);
          expect(year).toBe(date.getFullYear());
          expect(month).toBe(date.getMonth() + 1);
          expect(day).toBe(date.getDate());
        }
      )
    );
  });
});

const calendarDate = fc
  .record({
    year: fc.integer({ min: 2, max: 9998 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(
    ({ year, month, day }) =>
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  );

describe('local-date helpers', () => {
  // Namespace lookup lets RED fail on missing behavior rather than a missing export.
  const helpers = localDates as typeof localDates & {
    isValidLocalDate: (value: string) => boolean;
    shiftLocalDate: (value: string, deltaDays: number) => string;
    formatDisplayDate: (value: string) => string;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    '0001-01-01',
    '0096-02-29',
    '0100-01-01',
    '2000-02-29',
    '2024-02-29',
    '2026-11-20',
    '9999-12-31',
  ])('accepts the calendar date %s', (value) => {
    expect(helpers.isValidLocalDate(value)).toBe(true);
  });

  it.each([
    '',
    'not-a-date',
    '2026-02-30',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-04-31',
    '2026-01-32',
    '2026-03-32',
    '2026-05-32',
    '2026-06-31',
    '2026-07-32',
    '2026-08-32',
    '2026-09-31',
    '2026-10-32',
    '2026-11-31',
    '2026-12-32',
    '2026-02-29',
    '1900-02-29',
    '0100-02-29',
    '0000-01-01',
    '10000-01-01',
    '2026-1-01',
    '2026-01-1',
    ' 2026-11-20',
    '2026-11-20\n',
    '2026-11-20T12:00:00',
  ])('rejects malformed or nonexistent date %j', (value) => {
    expect(helpers.isValidLocalDate(value)).toBe(false);
    expect(() => helpers.shiftLocalDate(value, 1)).toThrow(RangeError);
    expect(() => helpers.formatDisplayDate(value)).toThrow(RangeError);
  });

  it.each([
    ['2026-11-20', -1, '2026-11-19'],
    ['2026-11-20', 1, '2026-11-21'],
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2024-03-01', -1, '2024-02-29'],
    ['1900-02-28', 1, '1900-03-01'],
    ['2000-02-28', 1, '2000-02-29'],
    ['0099-12-31', 1, '0100-01-01'],
    ['0100-01-01', -1, '0099-12-31'],
    ['0004-02-28', 1, '0004-02-29'],
    ['2026-03-07', 1, '2026-03-08'],
    ['2026-03-08', 1, '2026-03-09'],
    ['2026-03-28', 1, '2026-03-29'],
    ['2026-03-29', 1, '2026-03-30'],
    ['2026-10-24', 1, '2026-10-25'],
    ['2026-10-25', 1, '2026-10-26'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-11-01', 1, '2026-11-02'],
    ['2026-11-20', 0, '2026-11-20'],
    ['2024-01-01', 366, '2025-01-01'],
  ])('shifts %s by %i days to %s', (value, delta, expected) => {
    expect(helpers.shiftLocalDate(value, delta)).toBe(expected);
  });

  it.each([0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid day offsets: %s',
    (delta) => {
      expect(() => helpers.shiftLocalDate('2026-11-20', delta)).toThrow(
        RangeError
      );
    }
  );

  it.each([
    ['0001-01-01', -1],
    ['9999-12-31', 1],
    ['2026-11-20', Number.MAX_SAFE_INTEGER],
  ])('rejects shifts outside four-digit calendar years', (value, delta) => {
    expect(() => helpers.shiftLocalDate(value, delta)).toThrow(RangeError);
  });

  it.each([
    ['2026-11-20', 'Fri, 20 Nov 2026'],
    ['2024-02-29', 'Thu, 29 Feb 2024'],
    ['2026-01-01', 'Thu, 1 Jan 2026'],
    ['0099-01-01', 'Thu, 1 Jan 99'],
  ])('formats %s using its local calendar components', (value, expected) => {
    expect(helpers.formatDisplayDate(value)).toBe(expected);
  });

  it('preserves dates after a shift and its inverse, with valid output', () => {
    fc.assert(
      fc.property(calendarDate, fc.integer({ min: -365, max: 365 }), (d, n) => {
        const shifted = helpers.shiftLocalDate(d, n);
        expect(shifted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(helpers.isValidLocalDate(shifted)).toBe(true);
        expect(helpers.shiftLocalDate(shifted, -n)).toBe(d);
      }),
      { numRuns: 1000, seed: 34 }
    );
  });

  it('validates arbitrary strings without throwing or accepting malformed input', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const valid = helpers.isValidLocalDate(value);
        expect(typeof valid).toBe('boolean');
        if (valid) expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
      { numRuns: 1000, seed: 34 }
    );
  });

  it('never reads UTC components or serializes local dates as UTC', () => {
    const spies = [
      vi.spyOn(Date.prototype, 'getUTCFullYear'),
      vi.spyOn(Date.prototype, 'getUTCMonth'),
      vi.spyOn(Date.prototype, 'getUTCDate'),
      vi.spyOn(Date.prototype, 'getUTCDay'),
      vi.spyOn(Date.prototype, 'getUTCHours'),
      vi.spyOn(Date.prototype, 'getUTCMinutes'),
      vi.spyOn(Date.prototype, 'getUTCSeconds'),
      vi.spyOn(Date.prototype, 'getUTCMilliseconds'),
      vi.spyOn(Date.prototype, 'toISOString'),
    ];
    fc.assert(
      fc.property(calendarDate, (value) => {
        helpers.isValidLocalDate(value);
        helpers.shiftLocalDate(value, 1);
        helpers.formatDisplayDate(value);
      }),
      { seed: 34 }
    );
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
