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

export const DEFAULT_WATER_GOAL_ML = 2000;
export const MIN_WATER_GOAL_ML = 100;
export const MAX_WATER_GOAL_ML = 10000;
export const WATER_GOAL_RANGE_MESSAGE = 'Enter a goal between 0.1 and 10 L';

export function parseWaterGoalInput(_raw: string): number {
  throw new Error('Not implemented');
}

export function formatWaterGoalLiters(_goalMl: number): string {
  throw new Error('Not implemented');
}

export function waterGoalFillRatio(
  _consumedMl: number,
  _goalMl: number
): number {
  throw new Error('Not implemented');
}

export function waterGoalFillPercent(
  _consumedMl: number,
  _goalMl: number
): number {
  throw new Error('Not implemented');
}

export function isWaterGoalReached(
  _consumedMl: number,
  _goalMl: number
): boolean {
  throw new Error('Not implemented');
}
