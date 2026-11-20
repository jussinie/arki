export type WaterEntry = {
  id: string;
  amountMl: number;
  localDate: string;
};

/** First quick-add size. Amount limits are enforced with the rest of W-2. */
export const QUICK_ADD_WATER_ML = 250;

export function waterTotalMl(
  _entries: readonly WaterEntry[],
  _localDate: string
): number {
  throw new Error('not implemented');
}

/** ADR 8: call when the user acts, then pass the id into the write. */
export function createClientOpId(_generateId?: () => string): string {
  throw new Error('not implemented');
}
