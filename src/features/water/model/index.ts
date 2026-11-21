export type WaterEntry = {
  id: string;
  amountMl: number;
  localDate: string;
};

/** First quick-add size. Amount limits are enforced with the rest of W-2. */
export const QUICK_ADD_WATER_ML = 250;

export function waterTotalMl(
  entries: readonly WaterEntry[],
  localDate: string
): number {
  return entries.reduce((total, entry) => {
    if (entry.localDate !== localDate) {
      return total;
    }
    return total + entry.amountMl;
  }, 0);
}

/** ADR 8: call when the user acts, then pass the id into the write. */
export function createClientOpId(
  generateId: () => string = () => crypto.randomUUID()
): string {
  return generateId();
}
