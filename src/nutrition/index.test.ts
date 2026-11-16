import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { scaleAmount } from './index';

describe('scaleAmount (pure nutrition contract)', () => {
  it('satisfies linearity: scaleAmount(v, 2) === scaleAmount(v, 1) + scaleAmount(v, 1)', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (value) => {
        const scaledBy2 = scaleAmount(value, 2);
        const scaledTwice = scaleAmount(value, 1) + scaleAmount(value, 1);
        expect(Math.abs(scaledBy2 - scaledTwice)).toBeLessThanOrEqual(1e-9);
      })
    );
  });
});
