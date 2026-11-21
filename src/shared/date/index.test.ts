import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { getTodayLocalDate } from './index';

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
