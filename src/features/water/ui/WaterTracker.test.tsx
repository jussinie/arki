import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WaterTracker } from './WaterTracker';

type StoredRow = {
  id: string;
  amount_ml: number;
  local_date: string;
  logged_at: string;
};

const db = vi.hoisted(() => {
  const rows: StoredRow[] = [];
  let nextSeq = 0;
  let selectError: Error | null = null;
  let upsertError: Error | null = null;

  const from = vi.fn((table: string) => {
    if (table === 'water_goals') {
      return {
        select: (_columns?: string) => ({
          order: async () => ({ data: [], error: null }),
        }),
      };
    }

    return {
      select: (_columns?: string) => ({
        maybeSingle: async () => ({ data: null, error: null }),
        eq: (column: 'local_date' | 'id', value: string) => {
          const filtered = rows.filter((row) => row[column] === value);
          return {
            order: async () => {
              if (selectError) {
                return { data: null, error: selectError };
              }
              return {
                data: filtered.map(({ id, amount_ml, local_date }) => ({
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
        options?: { ignoreDuplicates?: boolean }
      ) => ({
        select: () => ({
          maybeSingle: async () => {
            if (upsertError) {
              return { data: null, error: upsertError };
            }
            const existing = rows.find((row) => row.id === payload.id);
            if (existing) {
              return options?.ignoreDuplicates
                ? { data: null, error: null }
                : {
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
              ...payload,
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
    };
  });

  return {
    from,
    setSelectError(error: Error | null) {
      selectError = error;
    },
    setUpsertError(error: Error | null) {
      upsertError = error;
    },
    reset() {
      rows.length = 0;
      nextSeq = 0;
      selectError = null;
      upsertError = null;
      from.mockClear();
    },
  };
});

vi.mock('../../../shared/supabase', () => ({
  supabase: {
    from: db.from,
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: 'synthetic-user', email: 'test@example.com' },
          },
        },
        error: null,
      }),
    },
  },
}));

vi.mock('../../../shared/date', () => ({
  getTodayLocalDate: () => {
    throw new Error('Water UI must receive local_date from its caller');
  },
}));

function renderTracker(createOpId?: () => string) {
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

  const props = createOpId
    ? { localDate: '2026-11-20', createOpId }
    : { localDate: '2026-11-20' };

  return {
    queryClient,
    ...render(<WaterTracker {...props} />, { wrapper: Wrapper }),
  };
}

beforeEach(() => {
  db.reset();
});

describe('WaterTracker', () => {
  it('shows 200 ml for 2026-11-20 after the user adds 2 dl', async () => {
    const createOpId = vi.fn(() => 'op-click');
    const { queryClient } = renderTracker(createOpId);

    expect(
      await screen.findByText('2026-11-20', { exact: true })
    ).toBeInTheDocument();
    expect(
      await screen.findByText('0 ml', { exact: true })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /250|2[,.]5/ })
    ).not.toBeInTheDocument();
    expect(createOpId).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));

    expect(createOpId).toHaveBeenCalledOnce();
    expect(
      await screen.findByText('200 ml', { exact: true })
    ).toBeInTheDocument();
    expect(screen.queryByText('0 ml', { exact: true })).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['water-entries', '2026-11-20'])).toEqual([
      { id: 'op-click', amountMl: 200, localDate: '2026-11-20' },
    ]);
  });

  it('adds 100, 200, 300, and 400 ml when the user clicks 1, 2, 3, and 4 dl', async () => {
    let nextId = 0;
    const createOpId = vi.fn(() => {
      nextId += 1;
      return `op-dl-${nextId}`;
    });
    const { queryClient } = renderTracker(createOpId);

    expect(
      await screen.findByRole('button', { name: /^1 dl$/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^2 dl$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^3 dl$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^4 dl$/ })).toBeInTheDocument();
    expect(createOpId).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^1 dl$/ }));
    expect(
      await screen.findByText('100 ml', { exact: true })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));
    expect(
      await screen.findByText('300 ml', { exact: true })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^3 dl$/ }));
    expect(
      await screen.findByText('600 ml', { exact: true })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^4 dl$/ }));
    expect(
      await screen.findByText('1000 ml', { exact: true })
    ).toBeInTheDocument();

    expect(createOpId).toHaveBeenCalledTimes(4);
    expect(queryClient.getQueryData(['water-entries', '2026-11-20'])).toEqual([
      { id: 'op-dl-1', amountMl: 100, localDate: '2026-11-20' },
      { id: 'op-dl-2', amountMl: 200, localDate: '2026-11-20' },
      { id: 'op-dl-3', amountMl: 300, localDate: '2026-11-20' },
      { id: 'op-dl-4', amountMl: 400, localDate: '2026-11-20' },
    ]);
  });

  it('shows an error alert instead of 0 ml when loading water entries fails', async () => {
    db.setSelectError(new Error('network error'));
    renderTracker();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load water entries. Please reload.'
    );
    expect(screen.queryByText('0 ml', { exact: true })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^1 dl$/ })
    ).not.toBeInTheDocument();
  });

  it('shows an error alert when adding water fails', async () => {
    renderTracker(() => 'op-fail');
    expect(
      await screen.findByText('0 ml', { exact: true })
    ).toBeInTheDocument();

    db.setUpsertError(new Error('insert failed'));
    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add water. Try again.'
    );
    expect(screen.getByText('0 ml', { exact: true })).toBeInTheDocument();
  });
});
