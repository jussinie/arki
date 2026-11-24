import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WaterTracker } from './WaterTracker';

const trackerCss = readFileSync(
  join(process.cwd(), 'src/features/water/ui/WaterTracker.css'),
  'utf8'
);

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
  }));

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
  document.head.querySelector('[data-water-tracker]')?.remove();
  const style = document.createElement('style');
  style.dataset.waterTracker = 'true';
  style.textContent = trackerCss;
  document.head.appendChild(style);
});

describe('WaterTracker', () => {
  it('omits the Water heading, date text, and Day’s water total text, centers the orb container, and renders the goal selector under the quick-add buttons', async () => {
    renderTracker();

    const orb = await screen.findByRole('progressbar', {
      name: 'Daily water goal',
    });
    const firstAddButton = screen.getByRole('button', { name: /^1 dl$/ });
    const lastAddButton = screen.getByRole('button', { name: /^4 dl$/ });
    const goalInput = screen.getByLabelText('Daily water goal (L)');
    const saveGoalButton = screen.getByRole('button', { name: 'Save goal' });

    expect(
      screen.queryByRole('heading', { name: 'Water' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('2026-11-20', { exact: true })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Day's water total")).not.toBeInTheDocument();
    expect(screen.queryByText('0 ml', { exact: true })).not.toBeInTheDocument();

    const meter = orb.parentElement;
    expect(meter).toHaveClass('water__goal-meter');
    expect(getComputedStyle(meter as Element).position).toBe('relative');
    const status = meter?.querySelector('.water__goal-status');
    expect(status).toBeInstanceOf(HTMLElement);
    expect(getComputedStyle(status as Element).position).toBe('absolute');

    expect(
      orb.compareDocumentPosition(firstAddButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      lastAddButton.compareDocumentPosition(goalInput) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      lastAddButton.compareDocumentPosition(saveGoalButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows 0.2 L in the orb for 2026-11-20 after the user adds 2 dl', async () => {
    const createOpId = vi.fn(() => 'op-click');
    const { queryClient } = renderTracker(createOpId);

    const orb = await screen.findByRole('progressbar', {
      name: 'Daily water goal',
    });
    expect(orb).toHaveAttribute('aria-valuetext', '0 ml of 2 L');
    expect(screen.getByText('0 L', { exact: true })).toBeInTheDocument();
    expect(
      screen.queryByText('2026-11-20', { exact: true })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Day's water total")).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /250|2[,.]5/ })
    ).not.toBeInTheDocument();
    expect(createOpId).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));

    expect(createOpId).toHaveBeenCalledOnce();
    expect(
      await screen.findByText('0.2 L', { exact: true })
    ).toBeInTheDocument();
    expect(orb).toHaveAttribute('aria-valuetext', '200 ml of 2 L');
    expect(screen.queryByText('0 L', { exact: true })).not.toBeInTheDocument();
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
      await screen.findByText('0.1 L', { exact: true })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));
    expect(
      await screen.findByText('0.3 L', { exact: true })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^3 dl$/ }));
    expect(
      await screen.findByText('0.6 L', { exact: true })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^4 dl$/ }));
    expect(await screen.findByText('1 L', { exact: true })).toBeInTheDocument();

    expect(createOpId).toHaveBeenCalledTimes(4);
    expect(queryClient.getQueryData(['water-entries', '2026-11-20'])).toEqual([
      { id: 'op-dl-1', amountMl: 100, localDate: '2026-11-20' },
      { id: 'op-dl-2', amountMl: 200, localDate: '2026-11-20' },
      { id: 'op-dl-3', amountMl: 300, localDate: '2026-11-20' },
      { id: 'op-dl-4', amountMl: 400, localDate: '2026-11-20' },
    ]);
  });

  it('shows an error alert instead of the orb when loading water entries fails', async () => {
    db.setSelectError(new Error('network error'));
    renderTracker();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load water entries. Please reload.'
    );
    expect(
      screen.queryByRole('progressbar', { name: 'Daily water goal' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^1 dl$/ })
    ).not.toBeInTheDocument();
  });

  it('shows an error alert when adding water fails', async () => {
    renderTracker(() => 'op-fail');
    expect(await screen.findByText('0 L', { exact: true })).toBeInTheDocument();

    db.setUpsertError(new Error('insert failed'));
    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add water. Try again.'
    );
    expect(screen.getByText('0 L', { exact: true })).toBeInTheDocument();
  });
});
