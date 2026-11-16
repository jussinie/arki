import { supabase } from '../../../shared/supabase';
import type { FoodItem } from '../model';

export async function searchLibraryItems(_query: string): Promise<FoodItem[]> {
  void supabase;
  return [];
}
