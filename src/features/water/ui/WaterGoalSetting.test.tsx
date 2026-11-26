import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WaterGoalSetting } from './WaterGoalSetting';

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
  let readGate: Promise<void> = Promise.resolve();
  let releaseReads: (() => void) | null = null;
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
            await readGate;
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
    holdReads() {
      readGate = new Promise<void>((resolve) => {
        releaseReads = resolve;
      });
      return () => {
        readGate = Promise.resolve();
        releaseReads?.();
        releaseReads = null;
      };
    },
    reset() {
      goals.length = 0;
      upserts.length = 0;
      readError = null;
      writeError = null;
      writeGate = Promise.resolve();
      releaseWrites = null;
      readGate = Promise.resolve();
      releaseReads = null;
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

const TODAY = '2026-11-20';

function renderSetting(today = TODAY) {
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

  return render(<WaterGoalSetting today={today} />, { wrapper: Wrapper });
}

function seedGoal(localDate: string, goalMl: number, singleDay: boolean) {
  db.goals.push({
    user_id: 'user-1',
    local_date: localDate,
    goal_ml: goalMl,
    single_day: singleDay,
  });
}

async function saveGoal(liters: string) {
  const input = await screen.findByLabelText('Daily water goal (L)');
  fireEvent.change(input, { target: { value: liters } });
  fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
}

beforeEach(() => {
  auth.userId = 'user-1';
  auth.error = null;
  db.reset();
});

describe('WaterGoalSetting form state', () => {
  it('defaults the date to today with an empty goal field when no goal is set', async () => {
    renderSetting();

    expect(await screen.findByLabelText('Goal date')).toHaveValue(TODAY);
    expect(screen.getByLabelText('Daily water goal (L)')).toHaveValue('');
    expect(
      screen.getByText(
        'Applies every day from Fri, 20 Nov 2026 until you change it.'
      )
    ).toBeInTheDocument();
    expect(db.upserts).toEqual([]);
  });

  it('prefills the goal in effect on the selected date', async () => {
    seedGoal('2026-11-19', 2500, false);
    renderSetting();

    expect(await screen.findByLabelText('Daily water goal (L)')).toHaveValue(
      '2.5'
    );
  });

  it('switches the helper text and prefill when a past date is selected', async () => {
    seedGoal('2026-11-19', 2000, false);
    seedGoal('2026-11-19', 1500, true);
    renderSetting();

    fireEvent.change(await screen.findByLabelText('Goal date'), {
      target: { value: '2026-11-19' },
    });

    expect(screen.getByLabelText('Daily water goal (L)')).toHaveValue('1.5');
    expect(
      screen.getByText('Applies only to Thu, 19 Nov 2026.')
    ).toBeInTheDocument();
  });

  it('shows Loading water goal while the goals load', async () => {
    const release = db.holdReads();
    renderSetting();

    expect(screen.getByRole('status')).toHaveTextContent('Loading water goal…');
    expect(screen.queryByLabelText('Goal date')).not.toBeInTheDocument();

    release();
    expect(await screen.findByLabelText('Goal date')).toBeInTheDocument();
  });

  it('shows a load error instead of the form when the goals cannot load', async () => {
    db.setReadError(new Error('permission denied'));
    renderSetting();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load the water goal. Please reload.'
    );
    expect(screen.queryByLabelText('Goal date')).not.toBeInTheDocument();
  });
});

describe('WaterGoalSetting saves', () => {
  it('saves a goal for today as an ongoing change point', async () => {
    renderSetting();
    await saveGoal('2.5');

    expect(await screen.findByLabelText('Daily water goal (L)')).toHaveValue(
      '2.5'
    );
    expect(db.upserts).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-20',
        goal_ml: 2500,
        single_day: false,
      },
    ]);
  });

  it('saves a future-dated goal as an ongoing change point', async () => {
    renderSetting();
    fireEvent.change(await screen.findByLabelText('Goal date'), {
      target: { value: '2026-12-01' },
    });
    await saveGoal('3');
    await waitFor(() => expect(db.upserts).toHaveLength(1));

    expect(db.upserts).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-12-01',
        goal_ml: 3000,
        single_day: false,
      },
    ]);
  });

  it('saves a past-dated goal as a single-day exception', async () => {
    renderSetting();
    fireEvent.change(await screen.findByLabelText('Goal date'), {
      target: { value: '2026-11-19' },
    });
    await saveGoal('1');
    await waitFor(() => expect(db.upserts).toHaveLength(1));

    expect(db.upserts).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-19',
        goal_ml: 1000,
        single_day: true,
      },
    ]);
  });

  it('saves a comma decimal as liters and rewrites the draft in dotted form', async () => {
    renderSetting();

    await saveGoal('2,5');

    expect(await screen.findByLabelText('Daily water goal (L)')).toHaveValue(
      '2.5'
    );
    expect(db.upserts).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-20',
        goal_ml: 2500,
        single_day: false,
      },
    ]);
  });

  it('rewrites a leading-zero whole-litre draft after a successful save', async () => {
    renderSetting();

    await saveGoal('02');

    expect(await screen.findByLabelText('Daily water goal (L)')).toHaveValue(
      '2'
    );
    expect(db.upserts).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-20',
        goal_ml: 2000,
        single_day: false,
      },
    ]);
  });
});

describe('WaterGoalSetting validation and errors', () => {
  it('rejects a goal outside 0.1 L to 10 L before writing', async () => {
    renderSetting();

    for (const invalid of ['', '0', '0.09', '10.1', 'abc']) {
      await saveGoal(invalid);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Enter a goal between 0.1 and 10 L'
      );
    }

    expect(db.upserts).toEqual([]);
  });

  it('requires a valid date before saving', async () => {
    renderSetting();

    fireEvent.change(await screen.findByLabelText('Goal date'), {
      target: { value: '' },
    });
    await saveGoal('2.5');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a valid date.'
    );
    expect(screen.getByLabelText('Goal date')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(db.upserts).toEqual([]);
  });

  it('shows an error when saving fails and leaves the goal unsaved', async () => {
    renderSetting();
    await saveGoal('2.5');
    await waitFor(() => expect(db.upserts).toHaveLength(1));

    db.setWriteError(new Error('permission denied'));
    await saveGoal('3');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the water goal. Try again.'
    );
    expect(db.upserts).toHaveLength(2);
    expect(db.goals).toEqual([
      {
        user_id: 'user-1',
        local_date: '2026-11-20',
        goal_ml: 2500,
        single_day: false,
      },
    ]);
  });

  it('disables Save goal while a save is in flight', async () => {
    renderSetting();
    await screen.findByLabelText('Daily water goal (L)');

    const releaseWrites = db.holdWrites();
    fireEvent.change(screen.getByLabelText('Daily water goal (L)'), {
      target: { value: '2.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));

    // The optimistic update changes the saved label and remounts the form, so
    // the button must be re-queried on every retry.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save goal' })).toBeDisabled()
    );
    releaseWrites();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save goal' })).toBeEnabled()
    );
    await waitFor(() => expect(db.upserts).toHaveLength(1));
  });

  it('marks the goal field invalid and prefers the validation message over a save error', async () => {
    renderSetting();
    db.setWriteError(new Error('permission denied'));
    await saveGoal('2');

    const input = await screen.findByLabelText('Daily water goal (L)');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save the water goal. Try again.'
    );
    expect(input).toHaveAttribute('aria-describedby', 'water-goal-error');

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a goal between 0.1 and 10 L'
    );
    expect(
      screen.queryByText('Could not save the water goal. Try again.')
    ).not.toBeInTheDocument();
  });

  it('resets the draft and the validation error when the selected date changes', async () => {
    seedGoal('2026-11-21', 3000, false);
    renderSetting();

    const input = await screen.findByLabelText('Daily water goal (L)');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a goal between 0.1 and 10 L'
    );

    fireEvent.change(screen.getByLabelText('Goal date'), {
      target: { value: '2026-11-21' },
    });

    expect(screen.getByLabelText('Daily water goal (L)')).toHaveValue('3');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
