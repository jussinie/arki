import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

type GoalRow = {
  user_id: string;
  local_date: string;
  goal_ml: number;
  single_day: boolean;
};

const db = vi.hoisted(() => {
  const entries: EntryRow[] = [];
  const goals: GoalRow[] = [];
  let nextSeq = 0;
  let goalReadError: Error | null = null;
  const goalUpserts: Array<GoalRow> = [];

  const from = vi.fn((table: string) => {
    if (table === 'water_goals') {
      return {
        select: (columns: string) => {
          if (columns !== 'local_date, goal_ml, single_day') {
            throw new Error(`Unexpected columns ${columns}`);
          }
          return {
            order: async (
              column: string,
              options?: { ascending?: boolean }
            ) => {
              if (column !== 'local_date' || options?.ascending !== true) {
                throw new Error('Goal rows are read ordered by local_date asc');
              }
              if (goalReadError) {
                return { data: null, error: goalReadError };
              }
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
        upsert: (payload: GoalRow) => {
          goalUpserts.push({ ...payload });
          throw new Error('The Water page never writes the water goal');
        },
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
    entries,
    goalUpserts,
    setGoalReadError(error: Error | null) {
      goalReadError = error;
    },
    reset() {
      entries.length = 0;
      goals.length = 0;
      nextSeq = 0;
      goalReadError = null;
      goalUpserts.length = 0;
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

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return render(<WaterTracker localDate={localDate} />, { wrapper: Wrapper });
}

function seedGoal(localDate: string, goalMl: number, singleDay: boolean) {
  db.goals.push({
    user_id: 'synthetic-user',
    local_date: localDate,
    goal_ml: goalMl,
    single_day: singleDay,
  });
}

beforeEach(() => {
  db.reset();
});

describe('WaterTracker daily goal display', () => {
  it('shows the goal in effect on the day without any editing UI', async () => {
    seedGoal('2026-11-19', 2500, false);
    renderTracker('2026-11-20');

    const orb = await screen.findByRole('progressbar', {
      name: 'Daily water goal',
    });
    expect(orb).toHaveAttribute('aria-valuemin', '0');
    expect(orb).toHaveAttribute('aria-valuemax', '2500');
    expect(orb).toHaveAttribute('aria-valuenow', '0');
    expect(orb).toHaveAttribute('aria-valuetext', '0 ml of 2.5 L');
    expect(screen.getByText('of 2.5 L · 0%')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Daily water goal (L)')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save goal' })
    ).not.toBeInTheDocument();
    expect(db.goalUpserts).toEqual([]);
  });

  it('keeps every day on the goal in effect on that day', async () => {
    seedGoal('2026-11-19', 2000, false);
    seedGoal('2026-11-21', 3000, false);
    const { rerender } = renderTracker('2026-11-20');

    expect(
      await screen.findByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuemax', '2000');

    rerender(<WaterTracker localDate="2026-11-21" />);
    expect(
      await screen.findByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuemax', '3000');

    rerender(<WaterTracker localDate="2026-11-22" />);
    expect(
      await screen.findByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuemax', '3000');

    rerender(<WaterTracker localDate="2026-11-18" />);
    expect(
      await screen.findByText('No water goal set. Set one in Settings.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('progressbar', { name: 'Daily water goal' })
    ).not.toBeInTheDocument();
  });

  it('applies a single-day exception only on its own date', async () => {
    seedGoal('2026-11-19', 2000, false);
    seedGoal('2026-11-20', 1500, true);
    const { rerender } = renderTracker('2026-11-20');

    expect(
      await screen.findByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuemax', '1500');

    rerender(<WaterTracker localDate="2026-11-21" />);
    expect(
      await screen.findByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuemax', '2000');
  });

  it('shows a no-goal note on a day without a goal and still tracks water', async () => {
    renderTracker('2026-11-20');

    expect(
      await screen.findByText('No water goal set. Set one in Settings.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('progressbar', { name: 'Daily water goal' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('0 ml', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1 dl$/ })).toBeEnabled();
    expect(db.goals).toEqual([]);
  });

  it('marks the goal reached beside a full orb', async () => {
    seedGoal('2026-11-20', 2000, false);
    db.entries.push({
      id: 'entry-1',
      amount_ml: 2000,
      local_date: '2026-11-20',
      logged_at: '1',
    });
    renderTracker('2026-11-20');

    expect(
      await screen.findByRole('img', { name: 'Goal reached' })
    ).toBeInTheDocument();
    const orb = screen.getByRole('progressbar', { name: 'Daily water goal' });
    expect(orb).toHaveAttribute('aria-valuetext', '2000 ml of 2 L');
    expect(orb.querySelector('.water__bar-fill')).toHaveStyle({
      width: '100%',
      height: '100%',
    });
  });

  it('does not mark the goal reached while the orb is capped at 99.9%', async () => {
    seedGoal('2026-11-20', 2000, false);
    db.entries.push({
      id: 'entry-1',
      amount_ml: 1999,
      local_date: '2026-11-20',
      logged_at: '1',
    });
    renderTracker('2026-11-20');

    const orb = await screen.findByRole('progressbar', {
      name: 'Daily water goal',
    });
    expect(orb).toHaveAttribute('aria-valuetext', '1999 ml of 2 L');
    expect(orb.querySelector('.water__bar-fill')).toHaveStyle({
      width: '99.9%',
      height: '99.9%',
    });
    expect(screen.getByText('of 2 L · 99.9%')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Goal reached' })
    ).not.toBeInTheDocument();
  });

  it('shows a goal error and still lets the user add water when the goal cannot be loaded', async () => {
    db.setGoalReadError(new Error('permission denied'));
    renderTracker('2026-11-20');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load the water goal. Please reload.'
    );
    expect(
      await screen.findByText('0 ml', { exact: true })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1 dl$/ })).toBeEnabled();
    expect(
      screen.queryByRole('progressbar', { name: 'Daily water goal' })
    ).not.toBeInTheDocument();
  });
});
