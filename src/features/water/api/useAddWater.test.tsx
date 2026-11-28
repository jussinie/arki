import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addWaterEntry,
  listWaterEntries,
  useAddWater,
  useWaterDay,
} from './index';

type StoredRow = {
  id: string;
  amount_ml: number;
  local_date: string;
  logged_at: string;
};

const db = vi.hoisted(() => {
  const rows: StoredRow[] = [];
  const upserts: Array<{
    id: string;
    amount_ml: number;
    local_date: string;
  }> = [];
  let nextSeq = 0;
  let upsertError: Error | null = null;
  let writeGate: Promise<void> = Promise.resolve();
  let releaseWrites: (() => void) | null = null;

  const from = vi.fn((_table: string) => ({
    select: (_columns?: string) => ({
      eq: (column: 'local_date' | 'id', value: string) => {
        const filtered = rows.filter((row) => row[column] === value);
        return {
          order: async (
            _orderCol: string,
            options?: { ascending?: boolean }
          ) => {
            const sorted = [...filtered].sort((a, b) =>
              options?.ascending === false
                ? b.logged_at.localeCompare(a.logged_at)
                : a.logged_at.localeCompare(b.logged_at)
            );
            return {
              data: sorted.map(({ id, amount_ml, local_date }) => ({
                id,
                amount_ml,
                local_date,
              })),
              error: null,
            };
          },
          single: async () => {
            const found = filtered[0];
            if (!found) {
              return {
                data: null,
                error: new Error(`Row not found for ${column}=${value}`),
              };
            }
            return {
              data: {
                id: found.id,
                amount_ml: found.amount_ml,
                local_date: found.local_date,
              },
              error: null,
            };
          },
        };
      },
    }),
    upsert: (
      payload: { id: string; amount_ml: number; local_date: string },
      options?: { onConflict?: string; ignoreDuplicates?: boolean }
    ) => {
      upserts.push(payload);
      return {
        select: (_columns?: string) => ({
          maybeSingle: async () => {
            await writeGate;
            if (upsertError) {
              return { data: null, error: upsertError };
            }
            const existing = rows.find((row) => row.id === payload.id);
            if (existing) {
              if (options?.ignoreDuplicates) {
                return { data: null, error: null };
              }
              existing.amount_ml = payload.amount_ml;
              existing.local_date = payload.local_date;
              return {
                data: {
                  id: existing.id,
                  amount_ml: existing.amount_ml,
                  local_date: existing.local_date,
                },
                error: null,
              };
            }
            nextSeq += 1;
            const stored: StoredRow = {
              id: payload.id,
              amount_ml: payload.amount_ml,
              local_date: payload.local_date,
              logged_at: String(nextSeq).padStart(8, '0'),
            };
            rows.push(stored);
            return {
              data: {
                id: stored.id,
                amount_ml: stored.amount_ml,
                local_date: stored.local_date,
              },
              error: null,
            };
          },
        }),
      };
    },
  }));

  return {
    rows,
    upserts,
    from,
    setUpsertError(error: Error | null) {
      upsertError = error;
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
      rows.length = 0;
      upserts.length = 0;
      nextSeq = 0;
      upsertError = null;
      writeGate = Promise.resolve();
      releaseWrites = null;
      from.mockClear();
    },
  };
});

vi.mock('../../../shared/supabase', () => ({
  supabase: { from: db.from },
}));

vi.mock('../../../shared/date', () => ({
  getTodayLocalDate: vi.fn(() => {
    throw new Error('local_date must be supplied by the caller');
  }),
}));

const today = '2026-11-20';
const yesterday = '2026-11-19';

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

function renderWater() {
  return renderHook(
    () => ({
      today: useWaterDay(today),
      yesterday: useWaterDay(yesterday),
      add: useAddWater(),
    }),
    { wrapper: createWrapper() }
  );
}

beforeEach(() => {
  db.reset();
});

describe('useAddWater', () => {
  it('records 250 ml on the local date the caller sends', async () => {
    const { result } = renderWater();
    await waitFor(() => expect(result.current.today.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.yesterday.isSuccess).toBe(true));

    await act(async () => {
      await result.current.add.mutateAsync({
        id: 'op-today',
        amountMl: 250,
        localDate: today,
      });
    });

    expect(db.from).toHaveBeenCalledWith('water_entries');
    await waitFor(() =>
      expect(result.current.today.data).toEqual([
        { id: 'op-today', amountMl: 250, localDate: today },
      ])
    );
    expect(result.current.yesterday.data).toEqual([]);
  });

  it('does not generate an operation id when the request runs', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID');
    const { result } = renderWater();
    await waitFor(() => expect(result.current.today.isSuccess).toBe(true));

    await act(async () => {
      await result.current.add.mutateAsync({
        id: 'op-from-the-click',
        amountMl: 250,
        localDate: today,
      });
    });

    expect(randomUUID).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.today.data).toEqual([
        {
          id: 'op-from-the-click',
          amountMl: 250,
          localDate: today,
        },
      ])
    );
    randomUUID.mockRestore();
  });

  it('reloads the local_date list after a write so entries stored outside the cache stay visible', async () => {
    const { result } = renderWater();
    await waitFor(() => expect(result.current.today.isSuccess).toBe(true));
    expect(result.current.today.data).toEqual([]);

    db.rows.push({
      id: 'already-there',
      amount_ml: 200,
      local_date: today,
      logged_at: '00000000',
    });

    await act(async () => {
      await result.current.add.mutateAsync({
        id: 'op-new',
        amountMl: 500,
        localDate: today,
      });
    });

    await waitFor(() =>
      expect(result.current.today.data).toEqual([
        { id: 'already-there', amountMl: 200, localDate: today },
        { id: 'op-new', amountMl: 500, localDate: today },
      ])
    );
    expect(result.current.yesterday.data).toEqual([]);
  });

  it('does not reload the day when adding water fails', async () => {
    const { result } = renderWater();
    await waitFor(() => expect(result.current.today.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.yesterday.isSuccess).toBe(true));

    db.setUpsertError(new Error('insert failed'));
    db.rows.push({
      id: 'hidden',
      amount_ml: 200,
      local_date: today,
      logged_at: '00000000',
    });

    await act(async () => {
      await expect(
        result.current.add.mutateAsync({
          id: 'op-fail',
          amountMl: 100,
          localDate: today,
        })
      ).rejects.toThrow('insert failed');
    });

    expect(result.current.today.data).toEqual([]);
    expect(result.current.yesterday.data).toEqual([]);
  });

  it('keeps both overlapping writes after they finish', async () => {
    const { result } = renderWater();
    await waitFor(() => expect(result.current.today.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.yesterday.isSuccess).toBe(true));

    const releaseWrites = db.holdWrites();
    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    act(() => {
      first = result.current.add.mutateAsync({
        id: 'op-1',
        amountMl: 100,
        localDate: today,
      });
    });
    act(() => {
      second = result.current.add.mutateAsync({
        id: 'op-2',
        amountMl: 200,
        localDate: today,
      });
    });

    await waitFor(() => expect(db.upserts).toHaveLength(2));
    expect(result.current.today.data).toEqual([]);

    releaseWrites();
    await act(async () => {
      await first;
      await second;
    });

    await waitFor(() =>
      expect(result.current.today.data).toEqual([
        { id: 'op-1', amountMl: 100, localDate: today },
        { id: 'op-2', amountMl: 200, localDate: today },
      ])
    );
    expect(result.current.yesterday.data).toEqual([]);
  });

  it('stores one row when the same operation id is sent twice', async () => {
    const { result } = renderWater();
    await waitFor(() => expect(result.current.today.isSuccess).toBe(true));
    const first = {
      id: 'op-retry',
      amountMl: 250,
      localDate: today,
    };

    await act(async () => {
      await result.current.add.mutateAsync(first);
      await result.current.add.mutateAsync({
        ...first,
        amountMl: 500,
      });
    });

    await waitFor(() => expect(result.current.today.data).toEqual([first]));
  });
});

describe('water Supabase API', () => {
  it('asks Postgres to return water entries in logged_at order', async () => {
    const calls: Array<{
      column: string;
      options?: { ascending?: boolean };
    }> = [];
    const recordingClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async (
              column: string,
              options?: { ascending?: boolean }
            ) => {
              if (options === undefined) {
                calls.push({ column });
              } else {
                calls.push({ column, options });
              }
              return { data: [], error: null };
            },
          }),
        }),
      }),
    };

    await expect(
      listWaterEntries(today, recordingClient as never)
    ).resolves.toEqual([]);
    expect(calls).toEqual([
      { column: 'logged_at', options: { ascending: true } },
    ]);
  });

  it('propagates errors from listWaterEntries', async () => {
    const queryError = new Error('permission denied');
    const failingClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: null, error: queryError }),
          }),
        }),
      }),
    };

    await expect(listWaterEntries(today, failingClient as never)).rejects.toBe(
      queryError
    );
  });

  it('propagates errors from addWaterEntry', async () => {
    const insertError = new Error('check constraint violated');
    const failingClient = {
      from: () => ({
        upsert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: insertError }),
          }),
        }),
      }),
    };

    await expect(
      addWaterEntry(
        { id: 'op-invalid', amountMl: 0, localDate: today },
        failingClient as never
      )
    ).rejects.toBe(insertError);
  });

  it('treats a null list payload as no water entries', async () => {
    const emptyClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };

    await expect(
      listWaterEntries(today, emptyClient as never)
    ).resolves.toEqual([]);
  });

  it('propagates select errors after an ignored duplicate upsert', async () => {
    const selectError = new Error('row not visible');
    const failingClient = {
      from: () => ({
        upsert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: selectError }),
          }),
        }),
      }),
    };

    await expect(
      addWaterEntry(
        { id: 'op-retry', amountMl: 250, localDate: today },
        failingClient as never
      )
    ).rejects.toBe(selectError);
  });

  it('keeps the first row when the same operation id is inserted again', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.constantFrom(yesterday, today),
        async (id, amountMl, otherAmount, localDate) => {
          db.reset();
          const entry = { id, amountMl, localDate };
          const first = await addWaterEntry(entry);
          const retried = await addWaterEntry({
            ...entry,
            amountMl: otherAmount,
          });

          expect(first).toEqual(entry);
          expect(retried).toEqual(entry);
          expect(await listWaterEntries(localDate)).toEqual([entry]);
          const otherDate = localDate === today ? yesterday : today;
          expect(await listWaterEntries(otherDate)).toEqual([]);
        }
      )
    );
  });
});
