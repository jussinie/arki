import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { createClientOpId, waterTotalMl } from './index';

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
