import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listWaterGoals,
  saveWaterGoal,
  useSetWaterGoal,
  useWaterGoals,
} from './index';

type GoalRow = {
  user_id: string;
  local_date: string;
  goal_ml: number;
  single_day: boolean;
};

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
  const upserts: Array<GoalRow> = [];

  const rowKey = (row: GoalRow) =>
    `${row.user_id}:${row.local_date}:${row.single_day}`;

  const from = vi.fn((table: string) => {
    if (table !== 'water_goals') {
      throw new Error(`Unexpected table ${table}`);
    }
    return {
      select: (columns: string) => {
        if (columns !== 'local_date, goal_ml, single_day') {
          throw new Error(`Unexpected columns ${columns}`);
        }
        return {
          order: async (column: string, options?: { ascending?: boolean }) => {
            if (column !== 'local_date' || options?.ascending !== true) {
              throw new Error('Goal rows are read ordered by local_date asc');
            }
            if (readError) return { data: null, error: readError };
            const rows = [...goals]
              .sort((a, b) => a.local_date.localeCompare(b.local_date))
              .map(({ local_date, goal_ml, single_day }) => ({
                local_date,
                goal_ml,
                single_day,
              }));
            return { data: rows, error: null };
          },
        };
      },
      upsert: (payload: GoalRow, options?: { onConflict?: string }) => {
        upserts.push({ ...payload });
        if (options?.onConflict !== 'user_id,local_date,single_day') {
          throw new Error(
            'Goal writes conflict on user_id, local_date, single_day'
          );
        }
        return {
          select: () => ({
            single: async () => {
              await writeGate;
              if (writeError) return { data: null, error: writeError };
              const existing = goals.find(
                (row) => rowKey(row) === rowKey(payload)
              );
              if (existing) {
                existing.goal_ml = payload.goal_ml;
              } else {
                goals.push({ ...payload });
              }
              return {
                data: {
                  local_date: payload.local_date,
                  goal_ml: payload.goal_ml,
                  single_day: payload.single_day,
                },
                error: null,
              };
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

const changePoint = {
  localDate: '2026-11-26',
  goalMl: 2500,
  singleDay: false,
} as const;

beforeEach(() => {
  auth.userId = 'user-1';
  auth.error = null;
  db.reset();
});

describe('listWaterGoals', () => {
  it('returns the goal rows for the signed-in user ordered by local date', async () => {
    db.goals.push(
      {
        user_id: 'user-1',
        local_date: '2026-12-01',
        goal_ml: 3000,
        single_day: false,
      },
      {
        user_id: 'user-1',
        local_date: '2026-11-19',
        goal_ml: 1500,
        single_day: true,
      },
      {
        user_id: 'user-1',
        local_date: '2026-11-26',
        goal_ml: 2500,
        single_day: false,
      }
    );

    await expect(listWaterGoals()).resolves.toEqual([
      { localDate: '2026-11-19', goalMl: 1500, singleDay: true },
      { localDate: '2026-11-26', goalMl: 2500, singleDay: false },
      { localDate: '2026-12-01', goalMl: 3000, singleDay: false },
    ]);
  });

  it('returns an empty list when no goal is stored yet', async () => {
    await expect(listWaterGoals()).resolves.toEqual([]);
  });

  it('propagates read errors', async () => {
    const readError = new Error('permission denied');
    db.setReadError(readError);
    await expect(listWaterGoals()).rejects.toBe(readError);
  });
});

describe('saveWaterGoal', () => {
  it('upserts a goal change point starting on the given date', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID');

    await expect(saveWaterGoal({ ...changePoint }, 'user-1')).resolves.toEqual({
      localDate: '2026-11-26',
      goalMl: 2500,
      singleDay: false,
    });

    expect(db.goals).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-26',
        goal_ml: 2500,
        single_day: false,
      },
    ]);
    expect(db.upserts).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-26',
        goal_ml: 2500,
        single_day: false,
      },
    ]);
    // ADR 8: a set-value write is naturally idempotent and needs no operation id.
    expect(randomUUID).not.toHaveBeenCalled();
    randomUUID.mockRestore();
  });

  it('upserts a single-day exception for a past date', async () => {
    await saveWaterGoal(
      { localDate: '2026-11-19', goalMl: 1500, singleDay: true },
      'user-1'
    );

    expect(db.upserts).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-19',
        goal_ml: 1500,
        single_day: true,
      },
    ]);
  });

  it('replaces the stored row for the same date and kind without duplicating', async () => {
    db.goals.push({
      user_id: 'user-1',
      local_date: '2026-11-26',
      goal_ml: 2000,
      single_day: false,
    });

    await saveWaterGoal({ ...changePoint, goalMl: 2500 }, 'user-1');

    expect(db.goals).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-26',
        goal_ml: 2500,
        single_day: false,
      },
    ]);
  });

  it('keeps a single-day exception beside a change point on the same date', async () => {
    db.goals.push({
      user_id: 'user-1',
      local_date: '2026-11-20',
      goal_ml: 2000,
      single_day: false,
    });

    await saveWaterGoal(
      { localDate: '2026-11-20', goalMl: 1500, singleDay: true },
      'user-1'
    );

    expect(db.goals).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-20',
        goal_ml: 2000,
        single_day: false,
      },
      {
        user_id: 'user-1',
        local_date: '2026-11-20',
        goal_ml: 1500,
        single_day: true,
      },
    ]);
  });

  it('rejects a goal outside 100..10000 ml before writing', async () => {
    await expect(
      saveWaterGoal({ ...changePoint, goalMl: 99 }, 'user-1')
    ).rejects.toThrow('Enter a goal between 0.1 and 10 L');
    await expect(
      saveWaterGoal({ ...changePoint, goalMl: 10001 }, 'user-1')
    ).rejects.toThrow('Enter a goal between 0.1 and 10 L');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('propagates write errors', async () => {
    const writeError = new Error('check constraint violated');
    db.setWriteError(writeError);
    await expect(saveWaterGoal({ ...changePoint }, 'user-1')).rejects.toBe(
      writeError
    );
  });
});

describe('useWaterGoals', () => {
  it('loads the goal rows once and caches them per user', async () => {
    db.goals.push({
      user_id: 'user-1',
      local_date: '2026-11-20',
      goal_ml: 2500,
      single_day: false,
    });
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(() => useWaterGoals(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { localDate: '2026-11-20', goalMl: 2500, singleDay: false },
    ]);
    expect(db.from).toHaveBeenCalledTimes(1);

    auth.userId = 'user-2';
    db.goals[0] = {
      user_id: 'user-2',
      local_date: '2026-11-21',
      goal_ml: 3000,
      single_day: false,
    };
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    });

    await waitFor(() =>
      expect(result.current.data).toEqual([
        { localDate: '2026-11-21', goalMl: 3000, singleDay: false },
      ])
    );
    expect(queryClient.getQueryData(['water-goals', 'user-1'])).toEqual([
      { localDate: '2026-11-20', goalMl: 2500, singleDay: false },
    ]);
    expect(queryClient.getQueryData(['water-goals', 'user-2'])).toEqual([
      { localDate: '2026-11-21', goalMl: 3000, singleDay: false },
    ]);
  });

  it('does not fetch goals when there is no signed-in user', async () => {
    auth.userId = null;
    const { result } = renderHook(() => useWaterGoals(), {
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
      await expect(
        result.current.mutateAsync({ ...changePoint })
      ).rejects.toThrow('Not signed in');
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
      await expect(result.current.mutateAsync({ ...changePoint })).rejects.toBe(
        sessionError
      );
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('shows the new goal row immediately, then restores the previous rows when the write fails', async () => {
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({ goals: useWaterGoals(), save: useSetWaterGoal() }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.goals.isSuccess).toBe(true));
    db.setWriteError(new Error('permission denied'));
    const releaseWrites = db.holdWrites();

    let saveResult: Promise<unknown> | undefined;
    act(() => {
      saveResult = result.current.save
        .mutateAsync({ ...changePoint })
        .catch((error) => error);
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(['water-goals', 'user-1'])).toEqual([
        { localDate: '2026-11-26', goalMl: 2500, singleDay: false },
      ])
    );

    releaseWrites();
    await act(async () => {
      await saveResult;
    });

    await waitFor(() => expect(result.current.save.isError).toBe(true));
    expect(queryClient.getQueryData(['water-goals', 'user-1'])).toEqual([]);
    expect(db.goals).toEqual([]);
  });

  it('drops the optimistic goal row when the write fails and no rows were cached', async () => {
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(() => useSetWaterGoal(), { wrapper });

    db.setWriteError(new Error('permission denied'));
    const releaseWrites = db.holdWrites();

    let saveResult: Promise<unknown> | undefined;
    act(() => {
      saveResult = result.current
        .mutateAsync({ ...changePoint })
        .catch((error) => error);
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(['water-goals', 'user-1'])).toEqual([
        { localDate: '2026-11-26', goalMl: 2500, singleDay: false },
      ])
    );

    releaseWrites();
    await act(async () => {
      await saveResult;
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(['water-goals', 'user-1'])).toBeUndefined();
    expect(db.goals).toEqual([]);
  });

  it('rejects a goal outside 100..10000 ml before writing', async () => {
    const { result } = renderHook(() => useSetWaterGoal(), {
      wrapper: createWrapper().wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ ...changePoint, goalMl: 99 })
      ).rejects.toThrow('Enter a goal between 0.1 and 10 L');
      await expect(
        result.current.mutateAsync({ ...changePoint, goalMl: 10001 })
      ).rejects.toThrow('Enter a goal between 0.1 and 10 L');
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(db.upserts).toEqual([]);
  });

  it('queues a second goal save until the first write finishes', async () => {
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({ goals: useWaterGoals(), save: useSetWaterGoal() }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.goals.isSuccess).toBe(true));
    const releaseWrites = db.holdWrites();

    let first: Promise<unknown> | undefined;
    act(() => {
      first = result.current.save.mutateAsync({ ...changePoint });
    });
    await waitFor(() =>
      expect(db.upserts).toEqual([
        {
          user_id: 'user-1',
          local_date: '2026-11-26',
          goal_ml: 2500,
          single_day: false,
        },
      ])
    );
    expect(queryClient.getQueryData(['water-goals', 'user-1'])).toEqual([
      { localDate: '2026-11-26', goalMl: 2500, singleDay: false },
    ]);

    let second: Promise<unknown> | undefined;
    act(() => {
      second = result.current.save.mutateAsync({
        ...changePoint,
        goalMl: 1800,
      });
    });

    expect(db.upserts).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-26',
        goal_ml: 2500,
        single_day: false,
      },
    ]);
    expect(queryClient.getQueryData(['water-goals', 'user-1'])).toEqual([
      { localDate: '2026-11-26', goalMl: 2500, singleDay: false },
    ]);

    releaseWrites();
    await act(async () => {
      await first;
      await second;
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(['water-goals', 'user-1'])).toEqual([
        { localDate: '2026-11-26', goalMl: 1800, singleDay: false },
      ])
    );
    expect(db.goals).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-26',
        goal_ml: 1800,
        single_day: false,
      },
    ]);
    expect(db.upserts).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-26',
        goal_ml: 2500,
        single_day: false,
      },
      {
        user_id: 'user-1',
        local_date: '2026-11-26',
        goal_ml: 1800,
        single_day: false,
      },
    ]);
  });
});
