import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

  const from = vi.fn((_table: string) => ({
    select: (_columns?: string) => ({
      maybeSingle: async () => ({ data: null, error: null }),
      eq: (column: 'local_date' | 'id', value: string) => {
        const filtered = rows.filter((row) => row[column] === value);
        return {
          order: async () => {
            if (selectError) {
              return { data: null, error: selectError };
            }
            const sorted = [...filtered].sort((a, b) =>
              a.logged_at.localeCompare(b.logged_at)
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
  }));

  return {
    from,
    seed(nextRows: StoredRow[]) {
      rows.push(...nextRows);
    },
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

async function expectDayTotal(amount: string) {
  const label = await screen.findByText("Day's water total");
  const total = label.parentElement;
  if (!(total instanceof HTMLElement)) {
    throw new Error("Missing day's water total");
  }
  expect(
    await within(total).findByText(amount, { exact: true })
  ).toBeInTheDocument();
}

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
    await expectDayTotal('0 ml');
    expect(
      screen.queryByRole('button', { name: /250|2[,.]5/ })
    ).not.toBeInTheDocument();
    expect(createOpId).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));

    expect(createOpId).toHaveBeenCalledOnce();
    await expectDayTotal('200 ml');
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
    await expectDayTotal('100 ml');

    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));
    await expectDayTotal('300 ml');

    fireEvent.click(screen.getByRole('button', { name: /^3 dl$/ }));
    await expectDayTotal('600 ml');

    fireEvent.click(screen.getByRole('button', { name: /^4 dl$/ }));
    await expectDayTotal('1000 ml');

    expect(createOpId).toHaveBeenCalledTimes(4);
    expect(queryClient.getQueryData(['water-entries', '2026-11-20'])).toEqual([
      { id: 'op-dl-1', amountMl: 100, localDate: '2026-11-20' },
      { id: 'op-dl-2', amountMl: 200, localDate: '2026-11-20' },
      { id: 'op-dl-3', amountMl: 300, localDate: '2026-11-20' },
      { id: 'op-dl-4', amountMl: 400, localDate: '2026-11-20' },
    ]);
  });

  it('shows 200 ml and 500 ml entries and a 700 ml total for 2026-11-20', async () => {
    db.seed([
      {
        id: 'entry-500',
        amount_ml: 500,
        local_date: '2026-11-20',
        logged_at: '2026-11-21T00:30:00.000Z',
      },
      {
        id: 'entry-200',
        amount_ml: 200,
        local_date: '2026-11-20',
        logged_at: '2026-11-19T23:30:00.000Z',
      },
      {
        id: 'other-day',
        amount_ml: 999,
        local_date: '2026-11-21',
        logged_at: '2026-11-20T12:00:00.000Z',
      },
    ]);
    renderTracker();

    const list = await screen.findByRole('list', { name: 'Water entries' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/^200 ml$/);
    expect(items[1]).toHaveTextContent(/^500 ml$/);
    await expectDayTotal('700 ml');
    expect(
      screen.queryByText('999 ml', { exact: true })
    ).not.toBeInTheDocument();
    expect(list).not.toHaveTextContent('999');
  });

  it('keeps the open day list current after another entry is added', async () => {
    db.seed([
      {
        id: 'entry-200',
        amount_ml: 200,
        local_date: '2026-11-20',
        logged_at: '2026-11-19T23:30:00.000Z',
      },
      {
        id: 'entry-500',
        amount_ml: 500,
        local_date: '2026-11-20',
        logged_at: '2026-11-21T00:30:00.000Z',
      },
    ]);
    renderTracker(() => 'op-added');

    await expectDayTotal('700 ml');
    fireEvent.click(screen.getByRole('button', { name: /^1 dl$/ }));

    await expectDayTotal('800 ml');
    const labels = within(screen.getByRole('list', { name: 'Water entries' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toContain('100 ml');
    expect(labels).toContain('200 ml');
    expect(labels).toContain('500 ml');
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
    await expectDayTotal('0 ml');

    db.setUpsertError(new Error('insert failed'));
    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add water. Try again.'
    );
    await expectDayTotal('0 ml');
  });
});
