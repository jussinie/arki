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
  let nextSeq = 0;

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
    ) => ({
      select: (_columns?: string) => ({
        maybeSingle: async () => {
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
    }),
  }));

  return {
    rows,
    from,
    reset() {
      rows.length = 0;
      nextSeq = 0;
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
