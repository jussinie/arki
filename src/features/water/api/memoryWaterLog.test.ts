import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { createMemoryWaterLog } from './memoryWaterLog';

describe('memory water log', () => {
  it('keeps the first row when the same operation id is inserted again', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.constantFrom('2026-11-19', '2026-11-20'),
        async (id, amountMl, otherAmount, localDate) => {
          const store = createMemoryWaterLog();
          const entry = { id, amountMl, localDate };
          await store.insert(entry);
          await store.insert({ ...entry, amountMl: otherAmount });

          expect(await store.list(localDate)).toEqual([entry]);
          const otherDate =
            localDate === '2026-11-20' ? '2026-11-19' : '2026-11-20';
          expect(await store.list(otherDate)).toEqual([]);
        }
      )
    );
  });
});
