import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readWaterGoalMl,
  saveWaterGoalMl,
  useSetWaterGoal,
  useWaterGoal,
} from './index';

type GoalRow = { user_id: string; goal_ml: number };

const db = vi.hoisted(() => {
  const goals: GoalRow[] = [];
  let readError: Error | null = null;
  let writeError: Error | null = null;
  const upserts: Array<{ user_id: string; goal_ml: number }> = [];

  const from = vi.fn((table: string) => {
    if (table !== 'water_goals') {
      throw new Error(`Unexpected table ${table}`);
    }
    return {
      select: (columns: string) => {
        if (columns !== 'goal_ml') {
          throw new Error(`Unexpected columns ${columns}`);
        }
        return {
          maybeSingle: async () => {
            if (readError) return { data: null, error: readError };
            const row = goals[0];
            return { data: row ? { goal_ml: row.goal_ml } : null, error: null };
          },
          single: async () => {
            if (writeError) return { data: null, error: writeError };
            const row = goals[0];
            if (!row) {
              return { data: null, error: new Error('Row not found') };
            }
            return { data: { goal_ml: row.goal_ml }, error: null };
          },
        };
      },
      upsert: (
        payload: { user_id: string; goal_ml: number },
        options?: { onConflict?: string }
      ) => {
        upserts.push(payload);
        if (options?.onConflict !== 'user_id') {
          throw new Error('Goal writes conflict on user_id');
        }
        if ('local_date' in payload) {
          throw new Error('A water goal is not stored per day');
        }
        return {
          select: () => ({
            single: async () => {
              if (writeError) return { data: null, error: writeError };
              const existing = goals.find(
                (row) => row.user_id === payload.user_id
              );
              if (existing) {
                existing.goal_ml = payload.goal_ml;
              } else {
                goals.push({ ...payload });
              }
              return { data: { goal_ml: payload.goal_ml }, error: null };
            },
          }),
        };
      },
    };
  });

  return {
    from,
    goals,
    upserts,
    setReadError(error: Error | null) {
      readError = error;
    },
    setWriteError(error: Error | null) {
      writeError = error;
    },
    reset() {
      goals.length = 0;
      upserts.length = 0;
      readError = null;
      writeError = null;
      from.mockClear();
    },
  };
});

vi.mock('../../../shared/supabase', () => ({
  supabase: {
    from: db.from,
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  db.reset();
});

describe('readWaterGoalMl', () => {
  it('uses 2000 ml when the user has not set a goal', async () => {
    await expect(readWaterGoalMl()).resolves.toBe(2000);
    expect(db.from).toHaveBeenCalledWith('water_goals');
    expect(db.goals).toEqual([]);
  });

  it('returns the saved goal without a local date', async () => {
    db.goals.push({ user_id: 'user-1', goal_ml: 1500 });
    await expect(readWaterGoalMl()).resolves.toBe(1500);
  });

  it('propagates read errors', async () => {
    const readError = new Error('permission denied');
    db.setReadError(readError);
    await expect(readWaterGoalMl()).rejects.toBe(readError);
  });
});

describe('saveWaterGoalMl', () => {
  it('stores one goal for the user and replaces it on the next save', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID');
    await expect(saveWaterGoalMl(2500, 'user-1')).resolves.toBe(2500);
    await expect(saveWaterGoalMl(1800, 'user-1')).resolves.toBe(1800);

    expect(db.goals).toEqual([{ user_id: 'user-1', goal_ml: 1800 }]);
    expect(db.upserts).toEqual([
      { user_id: 'user-1', goal_ml: 2500 },
      { user_id: 'user-1', goal_ml: 1800 },
    ]);
    expect(randomUUID).not.toHaveBeenCalled();
    randomUUID.mockRestore();
  });

  it('rejects a goal outside 100..10000 ml before writing', async () => {
    await expect(saveWaterGoalMl(99, 'user-1')).rejects.toThrow(
      'Enter a goal between 0.1 and 10 L'
    );
    await expect(saveWaterGoalMl(10001, 'user-1')).rejects.toThrow(
      'Enter a goal between 0.1 and 10 L'
    );
    expect(db.from).not.toHaveBeenCalled();
  });

  it('propagates write errors', async () => {
    const writeError = new Error('check constraint violated');
    db.setWriteError(writeError);
    await expect(saveWaterGoalMl(2000, 'user-1')).rejects.toBe(writeError);
  });
});

describe('useWaterGoal', () => {
  it('keeps the saved goal in the cache, independent of the day', async () => {
    const { result } = renderHook(
      () => ({
        goal: useWaterGoal(),
        save: useSetWaterGoal(),
      }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.goal.isSuccess).toBe(true));
    expect(result.current.goal.data).toBe(2000);

    await act(async () => {
      await result.current.save.mutateAsync(2500);
    });

    await waitFor(() => expect(result.current.goal.data).toBe(2500));
    expect(db.goals).toEqual([{ user_id: 'user-1', goal_ml: 2500 }]);
  });
});
