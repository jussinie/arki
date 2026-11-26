import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCurrentSession } from '../../session';
import { supabase, type Database } from '../../../shared/supabase';
import { assertWaterGoalMl, type WaterEntry, type WaterGoal } from '../model';

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

type WaterGoalRow = Pick<
  Database['public']['Tables']['water_goals']['Row'],
  'local_date' | 'goal_ml' | 'single_day'
>;

function toWaterGoal(row: WaterGoalRow): WaterGoal {
  return {
    localDate: row.local_date,
    goalMl: row.goal_ml,
    singleDay: row.single_day,
  };
}

const waterGoalsKey = (userId: string | null) =>
  ['water-goals', userId] as const;

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

/** Replaces or adds one goal row, keeping the list ordered by local date. */
function upsertWaterGoalRow(
  rows: readonly WaterGoal[],
  saved: WaterGoal
): WaterGoal[] {
  const withoutRow = rows.filter(
    (row) =>
      !(row.localDate === saved.localDate && row.singleDay === saved.singleDay)
  );
  return [...withoutRow, saved].sort((a, b) =>
    a.localDate.localeCompare(b.localDate)
  );
}

export async function listWaterGoals(
  client: WaterSupabaseClient = supabase
): Promise<WaterGoal[]> {
  const { data, error } = await client
    .from('water_goals')
    .select('local_date, goal_ml, single_day')
    .order('local_date', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(toWaterGoal);
}

export async function saveWaterGoal(
  goal: WaterGoal,
  userId: string,
  client: WaterSupabaseClient = supabase
): Promise<WaterGoal> {
  const goalMl = assertWaterGoalMl(goal.goalMl);
  const { data, error } = await client
    .from('water_goals')
    .upsert(
      {
        user_id: userId,
        local_date: goal.localDate,
        goal_ml: goalMl,
        single_day: goal.singleDay,
      },
      { onConflict: 'user_id,local_date,single_day' }
    )
    .select('local_date, goal_ml, single_day')
    .single();

  if (error) {
    throw error;
  }
  return toWaterGoal(data);
}

export function useWaterGoals() {
  const session = useCurrentSession();
  const userId = session.data?.userId ?? null;
  return useQuery({
    queryKey: waterGoalsKey(userId),
    enabled: userId !== null,
    queryFn: () => listWaterGoals(),
  });
}

export function useSetWaterGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: 'water-goal' },
    mutationFn: async (goal: WaterGoal) => {
      const userId = await requireUserId();
      const saved = await saveWaterGoal(goal, userId);
      return { userId, saved };
    },
    onMutate: async (goal) => {
      const userId = await requireUserId();
      const queryKey = waterGoalsKey(userId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<readonly WaterGoal[]>(queryKey);
      queryClient.setQueryData<readonly WaterGoal[]>(queryKey, (rows = []) =>
        upsertWaterGoalRow(rows, {
          localDate: goal.localDate,
          goalMl: assertWaterGoalMl(goal.goalMl),
          singleDay: goal.singleDay,
        })
      );
      return { previous, userId };
    },
    onError: (_error, _goal, context) => {
      if (!context) {
        return;
      }
      const queryKey = waterGoalsKey(context.userId);
      if (context.previous === undefined) {
        queryClient.removeQueries({ queryKey });
        return;
      }
      queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: ({ userId, saved }) => {
      queryClient.setQueryData<readonly WaterGoal[]>(
        waterGoalsKey(userId),
        (rows = []) => upsertWaterGoalRow(rows, saved)
      );
    },
  });
}
