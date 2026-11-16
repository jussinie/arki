import { supabase } from '../../../shared/supabase';
import type { WaterEntry } from '../model';

export async function fetchWaterEntries(
  _localDate: string
): Promise<WaterEntry[]> {
  // Skeleton placeholder: returns empty array until W-1 schema is connected
  void supabase;
  return [];
}
