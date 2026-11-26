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

/**
 * A stored water goal (ARK-49, ADR 11): `singleDay: false` rows are change
 * points applying from `localDate` until the next change; `singleDay: true`
 * rows apply to exactly `localDate`.
 */
export type WaterGoal = {
  localDate: string;
  goalMl: number;
  singleDay: boolean;
};

/**
 * Resolves the water goal in effect on a day: a single-day exception on that
 * date wins, otherwise the latest change point on or before the date applies,
 * otherwise the day has no goal.
 */
export function resolveWaterGoalMl(
  goals: readonly WaterGoal[],
  localDate: string
): number | null {
  let inEffectMl: number | null = null;
  let inEffectDate = '';

  for (const goal of goals) {
    if (goal.singleDay) {
      if (goal.localDate === localDate) {
        return goal.goalMl;
      }
      continue;
    }
    if (goal.localDate <= localDate && goal.localDate >= inEffectDate) {
      inEffectMl = goal.goalMl;
      inEffectDate = goal.localDate;
    }
  }

  return inEffectMl;
}

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
