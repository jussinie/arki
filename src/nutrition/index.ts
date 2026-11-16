/**
 * Pure nutrition calculation contract.
 * Single authority on units, quantities, precision and rounding.
 * Must NOT import React or Supabase.
 */

export function scaleAmount(value: number, factor: number): number {
  return value * factor;
}
