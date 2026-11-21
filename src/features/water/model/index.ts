import { z } from 'zod';

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

const waterGoalMlSchema = z
  .number()
  .int()
  .min(MIN_WATER_GOAL_ML)
  .max(MAX_WATER_GOAL_ML);

const waterGoalInputSchema = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,3})?$/)
  .transform((value) => value.replace(',', '.'))
  .transform((value) => Math.round(Number(value) * 1000))
  .pipe(waterGoalMlSchema);

export function assertWaterGoalMl(goalMl: number): number {
  const parsed = waterGoalMlSchema.safeParse(goalMl);
  if (!parsed.success) {
    throw new Error(WATER_GOAL_RANGE_MESSAGE);
  }
  return parsed.data;
}

export function parseWaterGoalInput(raw: string): number {
  const parsed = waterGoalInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(WATER_GOAL_RANGE_MESSAGE);
  }
  return parsed.data;
}

export function formatWaterGoalLiters(goalMl: number): string {
  const whole = Math.trunc(goalMl / 1000);
  const fraction = Math.abs(goalMl % 1000);
  if (fraction === 0) {
    return String(whole);
  }
  const digits = String(fraction).padStart(3, '0').replace(/0+$/, '');
  return `${whole}.${digits}`;
}

export function waterGoalFillRatio(consumedMl: number, goalMl: number): number {
  if (
    !Number.isFinite(consumedMl) ||
    !Number.isFinite(goalMl) ||
    goalMl <= 0 ||
    consumedMl <= 0
  ) {
    return 0;
  }
  return Math.min(1, consumedMl / goalMl);
}

export function waterGoalFillPercent(
  consumedMl: number,
  goalMl: number
): number {
  const ratio = waterGoalFillRatio(consumedMl, goalMl);
  if (ratio >= 1) {
    return 100;
  }
  if (ratio <= 0) {
    return 0;
  }
  const percent = Math.round(ratio * 1000) / 10;
  return percent >= 100 ? 99.9 : percent;
}

export function isWaterGoalReached(
  consumedMl: number,
  goalMl: number
): boolean {
  return (
    Number.isFinite(consumedMl) &&
    Number.isFinite(goalMl) &&
    goalMl > 0 &&
    consumedMl >= goalMl
  );
}
