import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WaterTracker } from './WaterTracker';

type EntryRow = {
  id: string;
  amount_ml: number;
  local_date: string;
  logged_at: string;
};

type GoalRow = { user_id: string; goal_ml: number };

const db = vi.hoisted(() => {
  const entries: EntryRow[] = [];
  const goals: GoalRow[] = [];
  let nextSeq = 0;
  let goalWriteError: Error | null = null;

  const from = vi.fn((table: string) => {
    if (table === 'water_goals') {
      return {
        select: () => ({
          maybeSingle: async () => {
            const row = goals[0];
            return {
              data: row ? { goal_ml: row.goal_ml } : null,
              error: null,
            };
          },
        }),
        upsert: (payload: { user_id: string; goal_ml: number }) => ({
          select: () => ({
            single: async () => {
              if (goalWriteError) {
                return { data: null, error: goalWriteError };
              }
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
        }),
      };
    }

    return {
      select: () => ({
        eq: (column: 'local_date' | 'id', value: string) => {
          const filtered = entries.filter((row) => row[column] === value);
          return {
            order: async () => ({
              data: filtered.map(({ id, amount_ml, local_date }) => ({
                id,
                amount_ml,
                local_date,
              })),
              error: null,
            }),
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
            const existing = entries.find((row) => row.id === payload.id);
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
            entries.push({
              ...payload,
              logged_at: String(nextSeq).padStart(8, '0'),
            });
            return {
              data: {
                id: payload.id,
                amount_ml: payload.amount_ml,
                local_date: payload.local_date,
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
    goals,
    setGoalWriteError(error: Error | null) {
      goalWriteError = error;
    },
    reset() {
      entries.length = 0;
      goals.length = 0;
      nextSeq = 0;
      goalWriteError = null;
      from.mockClear();
    },
  };
});

vi.mock('../../../shared/supabase', () => ({
  supabase: {
    from: db.from,
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'synthetic-user' } } },
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

function renderTracker(localDate = '2026-11-20') {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  let nextId = 0;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  const view = render(
    <WaterTracker
      localDate={localDate}
      createOpId={() => {
        nextId += 1;
        return `goal-op-${nextId}`;
      }}
    />,
    { wrapper: Wrapper }
  );

  return view;
}

async function saveGoal(liters: string) {
  const input = await screen.findByLabelText('Daily water goal (L)');
  fireEvent.change(input, { target: { value: liters } });
  fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
}

beforeEach(() => {
  db.reset();
});

describe('WaterTracker daily goal', () => {
  it('shows a 2 L goal and an empty bar before the user sets one', async () => {
    renderTracker();

    expect(await screen.findByLabelText('Daily water goal (L)')).toHaveValue(
      '2'
    );
    const bar = screen.getByRole('progressbar', { name: 'Daily water goal' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '2000');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuetext', '0 ml of 2 L');
    expect(bar.querySelector('.water__bar-fill')).toHaveStyle({ width: '0%' });
    expect(
      screen.queryByRole('img', { name: 'Goal reached' })
    ).not.toBeInTheDocument();
    expect(db.goals).toEqual([]);
  });

  it('fills the bar up to the goal, then keeps tracking water past it', async () => {
    renderTracker();
    await saveGoal('0.2');

    expect(await screen.findByLabelText('Daily water goal (L)')).toHaveValue(
      '0.2'
    );
    await screen.findByRole('progressbar', {
      name: 'Daily water goal',
      value: { max: 200, now: 0 },
    });

    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));
    expect(
      await screen.findByText('200 ml', { exact: true })
    ).toBeInTheDocument();
    const reached = screen.getByRole('progressbar', {
      name: 'Daily water goal',
    });
    expect(reached).toHaveAttribute('aria-valuemax', '200');
    expect(reached).toHaveAttribute('aria-valuenow', '200');
    expect(reached.querySelector('.water__bar-fill')).toHaveStyle({
      width: '100%',
    });
    expect(
      screen.getByRole('img', { name: 'Goal reached' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^1 dl$/ }));
    expect(
      await screen.findByText('300 ml', { exact: true })
    ).toBeInTheDocument();
    const over = screen.getByRole('progressbar', { name: 'Daily water goal' });
    expect(over).toHaveAttribute('aria-valuemax', '200');
    expect(over).toHaveAttribute('aria-valuenow', '200');
    expect(over).toHaveAttribute('aria-valuetext', '300 ml of 0.2 L');
    expect(over.querySelector('.water__bar-fill')).toHaveStyle({
      width: '100%',
    });
    expect(
      screen.getByRole('img', { name: 'Goal reached' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Daily water goal (L)')).toHaveValue('0.2');
    expect(db.goals).toEqual([{ user_id: 'synthetic-user', goal_ml: 200 }]);
  });

  it('keeps the same goal on another day and fills that day on its own', async () => {
    const { rerender } = renderTracker('2026-11-20');
    await saveGoal('1');
    expect(await screen.findByLabelText('Daily water goal (L)')).toHaveValue(
      '1'
    );

    fireEvent.click(screen.getByRole('button', { name: /^4 dl$/ }));
    expect(
      await screen.findByText('400 ml', { exact: true })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Goal reached' })
    ).not.toBeInTheDocument();

    rerender(<WaterTracker localDate="2026-11-19" />);
    expect(
      await screen.findByText('0 ml', { exact: true })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Daily water goal (L)')).toHaveValue('1');
    expect(
      screen.getByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuemax', '1000');
    expect(
      screen.queryByRole('img', { name: 'Goal reached' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^1 dl$/ }));
    expect(
      await screen.findByText('100 ml', { exact: true })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Daily water goal (L)')).toHaveValue('1');

    rerender(<WaterTracker localDate="2026-11-20" />);
    expect(
      await screen.findByText('400 ml', { exact: true })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Daily water goal (L)')).toHaveValue('1');
    expect(
      screen.queryByRole('img', { name: 'Goal reached' })
    ).not.toBeInTheDocument();
    expect(db.goals).toEqual([{ user_id: 'synthetic-user', goal_ml: 1000 }]);
  });

  it('rejects a goal outside 0.1 L to 10 L and keeps the saved goal', async () => {
    renderTracker();
    await saveGoal('2.5');
    expect(await screen.findByLabelText('Daily water goal (L)')).toHaveValue(
      '2.5'
    );
    expect(
      screen.getByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuemax', '2500');

    for (const invalid of ['', '0', '0.09', '10.1', 'abc']) {
      const input = screen.getByLabelText('Daily water goal (L)');
      fireEvent.change(input, { target: { value: invalid } });
      fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Enter a goal between 0.1 and 10 L'
      );
      expect(
        screen.getByRole('progressbar', { name: 'Daily water goal' })
      ).toHaveAttribute('aria-valuemax', '2500');
    }

    expect(db.goals).toEqual([{ user_id: 'synthetic-user', goal_ml: 2500 }]);
  });

  it('shows an error when saving the goal fails and leaves the previous goal', async () => {
    renderTracker();
    expect(await screen.findByLabelText('Daily water goal (L)')).toHaveValue(
      '2'
    );
    db.setGoalWriteError(new Error('permission denied'));

    const input = screen.getByLabelText('Daily water goal (L)');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the water goal. Try again.'
    );
    expect(
      screen.getByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuemax', '2000');
    expect(db.goals).toEqual([]);
  });
});
