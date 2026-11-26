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

const auth = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  error: null as Error | null,
}));

const db = vi.hoisted(() => {
  const goals: GoalRow[] = [];
  let readError: Error | null = null;
  let writeError: Error | null = null;
  let writeGate: Promise<void> = Promise.resolve();
  let releaseWrites: (() => void) | null = null;
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
              await writeGate;
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
    holdWrites() {
      writeGate = new Promise<void>((resolve) => {
        releaseWrites = resolve;
      });
      return () => {
        writeGate = Promise.resolve();
        releaseWrites?.();
        releaseWrites = null;
      };
    },
    reset() {
      goals.length = 0;
      upserts.length = 0;
      readError = null;
      writeError = null;
      writeGate = Promise.resolve();
      releaseWrites = null;
      from.mockClear();
    },
  };
});

vi.mock('../../../shared/supabase', () => ({
  supabase: {
    from: db.from,
    auth: {
      getSession: async () => {
        if (auth.error) {
          return { data: { session: null }, error: auth.error };
        }
        if (!auth.userId) {
          return { data: { session: null }, error: null };
        }
        return {
          data: {
            session: {
              user: { id: auth.userId, email: `${auth.userId}@example.com` },
            },
          },
          error: null,
        };
      },
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

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, wrapper: Wrapper };
}

beforeEach(() => {
  auth.userId = 'user-1';
  auth.error = null;
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
      { wrapper: createWrapper().wrapper }
    );

    await waitFor(() => expect(result.current.goal.isSuccess).toBe(true));
    expect(result.current.goal.data).toBe(2000);

    await act(async () => {
      await result.current.save.mutateAsync(2500);
    });

    await waitFor(() => expect(result.current.goal.data).toBe(2500));
    expect(db.goals).toEqual([{ user_id: 'user-1', goal_ml: 2500 }]);
  });

  it('does not keep another signed-in user goal in the cache', async () => {
    db.goals.push({ user_id: 'user-1', goal_ml: 2500 });
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useWaterGoal(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBe(2500));

    auth.userId = 'user-2';
    db.goals[0] = { user_id: 'user-2', goal_ml: 3000 };
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    });

    await waitFor(() => expect(result.current.data).toBe(3000));
    expect(queryClient.getQueryData(['water-goal', 'user-1'])).toBe(2500);
    expect(queryClient.getQueryData(['water-goal', 'user-2'])).toBe(3000);
  });

  it('does not fetch a goal when there is no signed-in user', async () => {
    auth.userId = null;
    const { result } = renderHook(() => useWaterGoal(), {
      wrapper: createWrapper().wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('useSetWaterGoal', () => {
  it('rejects a save when the user is signed out before writing', async () => {
    auth.userId = null;
    const { result } = renderHook(() => useSetWaterGoal(), {
      wrapper: createWrapper().wrapper,
    });

    await act(async () => {
      await expect(result.current.mutateAsync(2500)).rejects.toThrow(
        'Not signed in'
      );
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(db.upserts).toEqual([]);
  });

  it('rejects a save when reading the session fails', async () => {
    const sessionError = new Error('session store unreadable');
    auth.error = sessionError;
    const { result } = renderHook(() => useSetWaterGoal(), {
      wrapper: createWrapper().wrapper,
    });

    await act(async () => {
      await expect(result.current.mutateAsync(2500)).rejects.toBe(sessionError);
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('shows the new goal immediately, then restores the previous goal when the write fails', async () => {
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        goal: useWaterGoal(),
        save: useSetWaterGoal(),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.goal.data).toBe(2000));
    db.setWriteError(new Error('permission denied'));
    const releaseWrites = db.holdWrites();

    let saveResult: Promise<unknown> | undefined;
    act(() => {
      saveResult = result.current.save
        .mutateAsync(2500)
        .catch((error) => error);
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(['water-goal', 'user-1'])).toBe(2500)
    );

    releaseWrites();
    await act(async () => {
      await saveResult;
    });

    await waitFor(() => expect(result.current.save.isError).toBe(true));
    expect(queryClient.getQueryData(['water-goal', 'user-1'])).toBe(2000);
    expect(db.goals).toEqual([]);
  });

  it('rejects a goal outside 100..10000 ml before writing', async () => {
    const { result } = renderHook(() => useSetWaterGoal(), {
      wrapper: createWrapper().wrapper,
    });

    await act(async () => {
      await expect(result.current.mutateAsync(99)).rejects.toThrow(
        'Enter a goal between 0.1 and 10 L'
      );
      await expect(result.current.mutateAsync(10001)).rejects.toThrow(
        'Enter a goal between 0.1 and 10 L'
      );
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(db.upserts).toEqual([]);
  });

  it('does not write an optimistic cache value when the goal is out of range', async () => {
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(() => useSetWaterGoal(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(99)).rejects.toThrow(
        'Enter a goal between 0.1 and 10 L'
      );
    });

    expect(queryClient.getQueryData(['water-goal', 'user-1'])).toBeUndefined();
    expect(db.from).not.toHaveBeenCalled();
    expect(db.upserts).toEqual([]);
  });

  it('queues a second goal save until the first write finishes', async () => {
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        goal: useWaterGoal(),
        save: useSetWaterGoal(),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.goal.data).toBe(2000));
    const releaseWrites = db.holdWrites();

    let first: Promise<unknown> | undefined;
    act(() => {
      first = result.current.save.mutateAsync(2500);
    });
    await waitFor(() =>
      expect(db.upserts).toEqual([{ user_id: 'user-1', goal_ml: 2500 }])
    );
    expect(queryClient.getQueryData(['water-goal', 'user-1'])).toBe(2500);

    let second: Promise<unknown> | undefined;
    act(() => {
      second = result.current.save.mutateAsync(1800);
    });

    expect(db.upserts).toEqual([{ user_id: 'user-1', goal_ml: 2500 }]);
    expect(queryClient.getQueryData(['water-goal', 'user-1'])).toBe(2500);

    releaseWrites();
    await act(async () => {
      await first;
      await second;
    });

    await waitFor(() => expect(result.current.goal.data).toBe(1800));
    expect(db.goals).toEqual([{ user_id: 'user-1', goal_ml: 1800 }]);
    expect(db.upserts).toEqual([
      { user_id: 'user-1', goal_ml: 2500 },
      { user_id: 'user-1', goal_ml: 1800 },
    ]);
  });

  it('drops the optimistic goal when the write fails and no previous goal was cached', async () => {
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(() => useSetWaterGoal(), { wrapper });

    db.setWriteError(new Error('permission denied'));
    const releaseWrites = db.holdWrites();

    let saveResult: Promise<unknown> | undefined;
    act(() => {
      saveResult = result.current.mutateAsync(2500).catch((error) => error);
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(['water-goal', 'user-1'])).toBe(2500)
    );

    releaseWrites();
    await act(async () => {
      await saveResult;
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(['water-goal', 'user-1'])).toBeUndefined();
    expect(db.goals).toEqual([]);
  });
});
