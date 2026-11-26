import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  QUICK_ADD_WATER_DL,
  assertWaterGoalMl,
  createClientOpId,
  formatWaterGoalLiters,
  isWaterGoalReached,
  parseWaterGoalInput,
  resolveWaterGoalMl,
  waterGoalFillPercent,
  waterGoalFillRatio,
  waterMlFromDl,
  waterTotalMl,
  type WaterGoal,
} from './index';

const today = '2026-11-20';

describe('waterTotalMl', () => {
  it('sums 250 ml logged on 2026-11-20', () => {
    expect(
      waterTotalMl([{ id: 'op-1', amountMl: 250, localDate: today }], today)
    ).toBe(250);
  });

  it('ignores entries from other local dates', () => {
    expect(
      waterTotalMl(
        [
          { id: 'yesterday', amountMl: 500, localDate: '2026-11-19' },
          { id: 'today', amountMl: 250, localDate: today },
        ],
        today
      )
    ).toBe(250);
  });

  it('is zero when that local date has no entries', () => {
    expect(waterTotalMl([], today)).toBe(0);
  });

  it('matches the sum of matching entries in any order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            amountMl: fc.integer({ min: 1, max: 5000 }),
            localDate: fc.constantFrom('2026-11-19', today),
          })
        ),
        (entries) => {
          const expected = entries
            .filter((entry) => entry.localDate === today)
            .reduce((total, entry) => total + entry.amountMl, 0);
          expect(waterTotalMl(entries, today)).toBe(expected);
          expect(waterTotalMl([...entries].reverse(), today)).toBe(expected);
        }
      )
    );
  });
});

describe('waterMlFromDl', () => {
  it('converts 1, 2, 3, and 4 dl into 100, 200, 300, and 400 ml', () => {
    expect(QUICK_ADD_WATER_DL).toEqual([1, 2, 3, 4]);
    expect(waterMlFromDl(1)).toBe(100);
    expect(waterMlFromDl(2)).toBe(200);
    expect(waterMlFromDl(3)).toBe(300);
    expect(waterMlFromDl(4)).toBe(400);
  });
});

describe('water goal', () => {
  it('parses liter amounts inside 0.1 L and 10 L into millilitres', () => {
    expect(parseWaterGoalInput('0.1')).toBe(100);
    expect(parseWaterGoalInput('0,1')).toBe(100);
    expect(parseWaterGoalInput('2')).toBe(2000);
    expect(parseWaterGoalInput('2.5')).toBe(2500);
    expect(parseWaterGoalInput('2,5')).toBe(2500);
    expect(parseWaterGoalInput(' 2.5 ')).toBe(2500);
    expect(parseWaterGoalInput('2.001')).toBe(2001);
    expect(parseWaterGoalInput('10')).toBe(10000);
    expect(parseWaterGoalInput('02')).toBe(2000);
  });

  it('rejects blank, zero, and out-of-range liter amounts', () => {
    for (const invalid of [
      '',
      '   ',
      '0',
      '0.0',
      '0.099',
      '10.001',
      '10.1',
      '-1',
      'abc',
      '2 L',
      '2.5.1',
      '.',
      '2.',
      '.5',
      'NaN',
      'Infinity',
      '1e1',
      '2.0001',
      '0.1000',
    ]) {
      expect(() => parseWaterGoalInput(invalid)).toThrow(
        'Enter a goal between 0.1 and 10 L'
      );
    }
  });

  it('accepts whole millilitre goals at the 100..10000 bounds and rejects non-integers', () => {
    expect(assertWaterGoalMl(100)).toBe(100);
    expect(assertWaterGoalMl(10000)).toBe(10000);
    for (const invalid of [99, 10001, 2000.5, NaN, Infinity, -Infinity, 0]) {
      expect(() => assertWaterGoalMl(invalid)).toThrow(
        'Enter a goal between 0.1 and 10 L'
      );
    }
  });

  it('formats a stored millilitre goal as liters', () => {
    expect(formatWaterGoalLiters(2000)).toBe('2');
    expect(formatWaterGoalLiters(2500)).toBe('2.5');
    expect(formatWaterGoalLiters(2250)).toBe('2.25');
    expect(formatWaterGoalLiters(2001)).toBe('2.001');
    expect(formatWaterGoalLiters(100)).toBe('0.1');
    expect(formatWaterGoalLiters(10000)).toBe('10');
  });

  it('round-trips every whole millilitre goal from 0.1 L through 10 L', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 10000 }), (goalMl) => {
        expect(parseWaterGoalInput(formatWaterGoalLiters(goalMl))).toBe(goalMl);
      })
    );
  });

  it('fills the bar up to the goal and no further', () => {
    expect(waterGoalFillRatio(0, 2000)).toBe(0);
    expect(waterGoalFillPercent(0, 2000)).toBe(0);
    expect(isWaterGoalReached(0, 2000)).toBe(false);

    expect(waterGoalFillRatio(2000, 2000)).toBe(1);
    expect(waterGoalFillPercent(2000, 2000)).toBe(100);
    expect(isWaterGoalReached(2000, 2000)).toBe(true);

    expect(waterGoalFillRatio(2500, 2000)).toBe(1);
    expect(waterGoalFillPercent(2500, 2000)).toBe(100);
    expect(isWaterGoalReached(2500, 2000)).toBe(true);

    expect(waterGoalFillRatio(1999, 2000)).toBeLessThan(1);
    expect(waterGoalFillPercent(1999, 2000)).toBe(99.9);
    expect(isWaterGoalReached(1999, 2000)).toBe(false);
    expect(waterGoalFillPercent(9995, 10000)).toBe(99.9);
    expect(isWaterGoalReached(9995, 10000)).toBe(false);
  });

  it('does not fill or mark the goal reached when the goal is not positive', () => {
    expect(waterGoalFillRatio(500, 0)).toBe(0);
    expect(waterGoalFillPercent(500, 0)).toBe(0);
    expect(isWaterGoalReached(500, 0)).toBe(false);
    expect(waterGoalFillRatio(500, -100)).toBe(0);
    expect(isWaterGoalReached(-10, 2000)).toBe(false);
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(waterGoalFillRatio(invalid, 2000)).toBe(0);
      expect(waterGoalFillPercent(invalid, 2000)).toBe(0);
      expect(isWaterGoalReached(invalid, 2000)).toBe(false);
      expect(waterGoalFillRatio(500, invalid)).toBe(0);
      expect(waterGoalFillPercent(500, invalid)).toBe(0);
      expect(isWaterGoalReached(500, invalid)).toBe(false);
    }
  });

  it('keeps the fill between empty and full for any consumed amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20_000 }),
        fc.integer({ min: 100, max: 10_000 }),
        (consumedMl, goalMl) => {
          const ratio = waterGoalFillRatio(consumedMl, goalMl);
          const percent = waterGoalFillPercent(consumedMl, goalMl);
          expect(ratio).toBeGreaterThanOrEqual(0);
          expect(ratio).toBeLessThanOrEqual(1);
          expect(percent).toBeGreaterThanOrEqual(0);
          expect(percent).toBeLessThanOrEqual(100);
          expect(isWaterGoalReached(consumedMl, goalMl)).toBe(
            consumedMl >= goalMl
          );
          if (consumedMl >= goalMl) {
            expect(ratio).toBe(1);
            expect(percent).toBe(100);
          } else {
            expect(ratio).toBeLessThan(1);
            expect(percent).toBeLessThan(100);
          }
          if (consumedMl === 0) {
            expect(ratio).toBe(0);
            expect(percent).toBe(0);
          }
        }
      )
    );
  });
});

describe('resolveWaterGoalMl (per-day goals)', () => {
  const change = (localDate: string, goalMl: number): WaterGoal => ({
    localDate,
    goalMl,
    singleDay: false,
  });
  const exception = (localDate: string, goalMl: number): WaterGoal => ({
    localDate,
    goalMl,
    singleDay: true,
  });

  it('returns null on a day with no goal rows', () => {
    expect(resolveWaterGoalMl([], '2026-11-26')).toBeNull();
  });

  it('applies a goal starting on a day from that day onward until it changes', () => {
    const goals = [change('2026-11-26', 2500)];

    expect(resolveWaterGoalMl(goals, '2026-11-25')).toBeNull();
    expect(resolveWaterGoalMl(goals, '2026-11-26')).toBe(2500);
    expect(resolveWaterGoalMl(goals, '2026-11-27')).toBe(2500);
    expect(resolveWaterGoalMl(goals, '2027-01-01')).toBe(2500);
  });

  it('uses the latest goal change on or before the day', () => {
    const goals = [change('2026-11-26', 2500), change('2026-12-01', 3000)];

    expect(resolveWaterGoalMl(goals, '2026-11-30')).toBe(2500);
    expect(resolveWaterGoalMl(goals, '2026-12-01')).toBe(3000);
    expect(resolveWaterGoalMl(goals, '2026-12-02')).toBe(3000);
  });

  it('preserves earlier days goals after a later change', () => {
    const goals = [change('2026-11-01', 2000), change('2026-11-26', 2500)];

    expect(resolveWaterGoalMl(goals, '2026-11-20')).toBe(2000);
    expect(resolveWaterGoalMl(goals, '2026-11-26')).toBe(2500);
  });

  it('applies a single-day exception only on its own date', () => {
    const goals = [change('2026-11-20', 2000), exception('2026-11-23', 3000)];

    expect(resolveWaterGoalMl(goals, '2026-11-22')).toBe(2000);
    expect(resolveWaterGoalMl(goals, '2026-11-23')).toBe(3000);
    expect(resolveWaterGoalMl(goals, '2026-11-24')).toBe(2000);
  });

  it('lets a single-day exception share a date with a change point', () => {
    const goals = [change('2026-11-20', 2000), exception('2026-11-20', 1500)];

    expect(resolveWaterGoalMl(goals, '2026-11-20')).toBe(1500);
    expect(resolveWaterGoalMl(goals, '2026-11-21')).toBe(2000);
  });

  it('ignores goal rows that start after the day', () => {
    const goals = [change('2026-11-26', 2500), exception('2026-11-27', 3000)];

    expect(resolveWaterGoalMl(goals, '2026-11-25')).toBeNull();
  });

  it('matches the day-keyed rule for any change points, exceptions, and day', () => {
    const days = [
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ];
    const goalForOffset = (offset: number, values: number[]) =>
      values[offset % values.length];

    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 9 }), {
          minLength: 0,
          maxLength: 10,
        }),
        fc.uniqueArray(fc.integer({ min: 0, max: 9 }), {
          minLength: 0,
          maxLength: 10,
        }),
        fc.array(fc.integer({ min: 100, max: 10000 }), {
          minLength: 1,
          maxLength: 10,
        }),
        fc.integer({ min: 0, max: 12 }),
        (changeDays, exceptionDays, values, dayOffset) => {
          const rows: WaterGoal[] = [
            ...changeDays.map((offset) =>
              change(days[offset], goalForOffset(offset, values))
            ),
            ...exceptionDays.map((offset) =>
              exception(days[offset], goalForOffset(offset, values))
            ),
          ];

          const inEffect = changeDays.filter((offset) => offset <= dayOffset);
          const expected = exceptionDays.includes(dayOffset)
            ? goalForOffset(dayOffset, values)
            : inEffect.length === 0
              ? null
              : goalForOffset(Math.max(...inEffect), values);

          expect(resolveWaterGoalMl(rows, days[dayOffset])).toBe(expected);
          expect(resolveWaterGoalMl([...rows].reverse(), days[dayOffset])).toBe(
            expected
          );
        }
      ),
      { numRuns: 300 }
    );
  });
});

describe('createClientOpId', () => {
  it('returns the id from the generator supplied by the caller', () => {
    const generateId = vi.fn(() => 'op-from-the-click');
    expect(createClientOpId(generateId)).toBe('op-from-the-click');
    expect(generateId).toHaveBeenCalledOnce();
  });

  it('uses crypto.randomUUID when the caller does not inject a generator', () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID');
    const id = createClientOpId();
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(id).toBe(randomUUID.mock.results[0]?.value);
    randomUUID.mockRestore();
  });
});
