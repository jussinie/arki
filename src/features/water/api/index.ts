import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCurrentSession } from '../../session';
import { supabase, type Database } from '../../../shared/supabase';
import {
  DEFAULT_WATER_GOAL_ML,
  assertWaterGoalMl,
  type WaterEntry,
} from '../model';

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
    onSuccess: (savedEntry) =>
      queryClient.invalidateQueries({
        queryKey: waterEntriesKey(savedEntry.localDate),
      }),
  });
}

function waterGoalQueryKey(userId: string) {
  return ['water-goal', userId] as const;
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  const userId = data.session?.user.id;
  if (!userId) {
    throw new Error('Not signed in');
  }
  return userId;
}

export async function readWaterGoalMl(
  client: WaterSupabaseClient = supabase
): Promise<number> {
  const { data, error } = await client
    .from('water_goals')
    .select('goal_ml')
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data?.goal_ml ?? DEFAULT_WATER_GOAL_ML;
}

export async function saveWaterGoalMl(
  goalMl: number,
  userId: string,
  client: WaterSupabaseClient = supabase
): Promise<number> {
  const validGoalMl = assertWaterGoalMl(goalMl);
  const { data, error } = await client
    .from('water_goals')
    .upsert(
      { user_id: userId, goal_ml: validGoalMl },
      { onConflict: 'user_id' }
    )
    .select('goal_ml')
    .single();

  if (error) {
    throw error;
  }
  return data.goal_ml;
}

export function useWaterGoal() {
  const session = useCurrentSession();
  const userId = session.data?.userId ?? null;
  return useQuery({
    queryKey: ['water-goal', userId],
    enabled: userId !== null,
    queryFn: () => readWaterGoalMl(),
  });
}

export function useSetWaterGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: 'water-goal' },
    mutationFn: async (goalMl: number) => {
      const userId = await requireUserId();
      const savedGoalMl = await saveWaterGoalMl(goalMl, userId);
      return { userId, goalMl: savedGoalMl };
    },
    onMutate: async (goalMl) => {
      const userId = await requireUserId();
      const queryKey = waterGoalQueryKey(userId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<number>(queryKey);
      queryClient.setQueryData(queryKey, assertWaterGoalMl(goalMl));
      return { previous, userId };
    },
    onError: (_error, _goalMl, context) => {
      if (!context) {
        return;
      }
      const queryKey = waterGoalQueryKey(context.userId);
      if (context.previous === undefined) {
        queryClient.removeQueries({ queryKey });
        return;
      }
      queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: ({ userId, goalMl }) => {
      queryClient.setQueryData(waterGoalQueryKey(userId), goalMl);
    },
  });
}
