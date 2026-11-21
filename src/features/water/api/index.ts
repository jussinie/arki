import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, type Database } from '../../../shared/supabase';
import type { WaterEntry } from '../model';

type WaterSupabaseClient = Pick<SupabaseClient<Database>, 'from'>;

type WaterEntryRow = Pick<
  Database['public']['Tables']['water_entries']['Row'],
  'id' | 'amount_ml' | 'local_date'
>;

const waterEntriesKey = (localDate: string) =>
  ['water-entries', localDate] as const;

function toWaterEntry(row: WaterEntryRow): WaterEntry {
  return {
    id: row.id,
    amountMl: row.amount_ml,
    localDate: row.local_date,
  };
}

export async function listWaterEntries(
  localDate: string,
  client: WaterSupabaseClient = supabase
): Promise<WaterEntry[]> {
  const { data, error } = await client
    .from('water_entries')
    .select('id, amount_ml, local_date')
    .eq('local_date', localDate)
    .order('logged_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(toWaterEntry);
}

export async function addWaterEntry(
  entry: WaterEntry,
  client: WaterSupabaseClient = supabase
): Promise<WaterEntry> {
  const { data: inserted, error: insertError } = await client
    .from('water_entries')
    .upsert(
      {
        id: entry.id,
        amount_ml: entry.amountMl,
        local_date: entry.localDate,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    .select('id, amount_ml, local_date')
    .maybeSingle();

  if (insertError) {
    throw insertError;
  }
  if (inserted) {
    return toWaterEntry(inserted);
  }

  const { data: existing, error: selectError } = await client
    .from('water_entries')
    .select('id, amount_ml, local_date')
    .eq('id', entry.id)
    .single();

  if (selectError) {
    throw selectError;
  }

  return toWaterEntry(existing);
}

export function useWaterDay(localDate: string) {
  return useQuery({
    queryKey: waterEntriesKey(localDate),
    queryFn: () => listWaterEntries(localDate),
  });
}

export function useAddWater() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: WaterEntry) => addWaterEntry(entry),
    onSuccess: (savedEntry) => {
      queryClient.setQueryData<readonly WaterEntry[]>(
        waterEntriesKey(savedEntry.localDate),
        (current = []) =>
          current.some((item) => item.id === savedEntry.id)
            ? current
            : [...current, savedEntry]
      );
    },
  });
}
