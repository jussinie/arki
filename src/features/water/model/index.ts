export type WaterEntry = {
  id: string;
  amountMl: number;
  localDate: string;
};

export const ML_PER_DL = 100;

export const QUICK_ADD_WATER_DL = [1, 2, 3, 4] as const;

export type QuickAddWaterDl = (typeof QUICK_ADD_WATER_DL)[number];

export function waterMlFromDl(decilitres: QuickAddWaterDl): number {
  return decilitres * ML_PER_DL;
}

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
