import { supabase } from '../../../shared/supabase';
import type { FoodLogEntry } from '../model';

export async function fetchFoodLogEntries(
  _localDate: string
): Promise<FoodLogEntry[]> {
  void supabase;
  return [];
}
