import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { App } from './App';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

const db = vi.hoisted(() => {
  const rows: Array<{ id: string; amount_ml: number; local_date: string }> = [];

  const from = vi.fn((_table: string) => ({
    select: () => ({
      maybeSingle: async () => ({ data: null, error: null }),
      eq: (column: 'local_date' | 'id', value: string) => {
        const filtered = rows.filter((row) => row[column] === value);
        return {
          order: async () => ({ data: [...filtered], error: null }),
          single: async () => ({
            data: filtered[0] ?? null,
            error: filtered[0] ? null : new Error('Row not found'),
          }),
        };
      },
    }),
    upsert: (
      payload: { id: string; amount_ml: number; local_date: string },
      options?: { ignoreDuplicates?: boolean }
    ) => ({
      select: () => ({
        maybeSingle: async () => {
          const existing = rows.find((row) => row.id === payload.id);
          if (existing) {
            return options?.ignoreDuplicates
              ? { data: null, error: null }
              : { data: existing, error: null };
          }
          const stored = { ...payload };
          rows.push(stored);
          return { data: stored, error: null };
        },
      }),
    }),
  }));

  return {
    from,
    reset() {
      rows.length = 0;
      from.mockClear();
    },
  };
});

vi.mock('../shared/supabase', () => ({ supabase: { auth, from: db.from } }));

const user = { id: 'synthetic-user', email: 'test@example.com' };

beforeEach(() => {
  vi.resetAllMocks();
  db.reset();
  window.history.replaceState(null, '', '/');
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
});

describe('App', () => {
  it('shows the sign-in page when signed out', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Arki' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sign in' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password'
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^1 dl$/ })
    ).not.toBeInTheDocument();
  });

  it('shows Today and the authenticated email after signing in', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'synthetic-password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('adds 2 dl of water on today after sign-in', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
    render(<App localDate="2026-11-20" />);

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    expect(
      await screen.findByText('2026-11-20', { exact: true })
    ).toBeInTheDocument();
    expect(
      await screen.findByText('0 ml', { exact: true })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));
    expect(
      await screen.findByText('200 ml', { exact: true })
    ).toBeInTheDocument();
  });

  it('restores Today from an existing session', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('keeps Today visible and shows an error when sign-out fails', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
    auth.signOut.mockResolvedValue({ error: new Error('nope') });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not sign out. Try again.'
    );
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Sign in' })
    ).not.toBeInTheDocument();
  });

  it('disables Sign out while the request is in flight', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
    let releaseSignOut: (() => void) | undefined;
    auth.signOut.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSignOut = () => resolve({ error: null });
        })
    );
    render(<App />);

    expect(
      await screen.findByRole('button', { name: 'Sign out' })
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
    });
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();

    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    releaseSignOut?.();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sign in' })
    ).toBeInTheDocument();
  });

  it('returns to the sign-in page after sign-out', async () => {
    let signedIn = true;
    auth.getSession.mockImplementation(async () => ({
      data: { session: signedIn ? { user } : null },
      error: null,
    }));
    auth.signOut.mockImplementation(async () => {
      signedIn = false;
      return { error: null };
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sign in' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Today' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign out' })
    ).not.toBeInTheDocument();
  });

  it('redirects signed-out users from / to /sign-in', async () => {
    window.history.replaceState(null, '', '/');
    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sign in' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/sign-in');
    expect(window.location.search).toBe('');
  });

  it('bounces signed-out deep links to /sign-in and returns after sign-in', async () => {
    window.history.replaceState(null, '', '/days/2026-11-19?tab=water');
    auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sign in' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/sign-in');
    expect(window.location.search).toBe(
      '?redirect=%2Fdays%2F2026-11-19%3Ftab%3Dwater'
    );

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'synthetic-password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/days/2026-11-19');
    expect(window.location.search).toBe('?tab=water');
  });

  it('ignores unsafe redirect targets and sends signed-in users to /', async () => {
    window.history.replaceState(
      null,
      '',
      '/sign-in?redirect=https%3A%2F%2Fevil.example'
    );
    auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'synthetic-password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
  });

  it('redirects already signed-in users away from /sign-in to /', async () => {
    window.history.replaceState(null, '', '/sign-in');
    auth.getSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('redirects to clean /sign-in without carrying deep-link params after sign-out', async () => {
    window.history.replaceState(null, '', '/days/2026-11-19');
    let signedIn = true;
    auth.getSession.mockImplementation(async () => ({
      data: { session: signedIn ? { user } : null },
      error: null,
    }));
    auth.signOut.mockImplementation(async () => {
      signedIn = false;
      return { error: null };
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sign in' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/sign-in');
    expect(window.location.search).toBe('');

    // After sign-out settles, a subsequent deep-link navigation via popstate
    // must still preserve the requested path in ?redirect=.
    window.history.pushState(null, '', '/library?q=oats');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sign in' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/sign-in');
    expect(window.location.search).toBe('?redirect=%2Flibrary%3Fq%3Doats');
  });
});

describe('day navigation', () => {
  beforeEach(() => {
    auth.getSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
  });

  it('shows today, both arrows, and a native calendar picker when signed in', async () => {
    render(<App localDate="2026-11-20" />);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Today' })
    ).toBeInTheDocument();
    const picker = screen.getByLabelText('Choose date');
    expect(picker).toHaveAttribute('type', 'date');
    expect(picker).toHaveValue('2026-11-20');
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Today' })
    ).not.toBeInTheDocument();
  });

  it('steps backward and forward into the future and jumps back to today', async () => {
    render(<App localDate="2026-11-20" />);
    await screen.findByRole('heading', { level: 2, name: 'Today' });

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByLabelText('Choose date')).toHaveValue('2026-11-19');
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Today' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByLabelText('Choose date')).toHaveValue('2026-11-21');

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByLabelText('Choose date')).toHaveValue('2026-11-20');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Today' })
    ).toBeInTheDocument();
  });

  it('loads and adds water for the picked day without changing today', async () => {
    render(<App localDate="2026-11-20" />);
    await screen.findByText('0 ml', { exact: true });
    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));
    await screen.findByText('200 ml', { exact: true });

    fireEvent.change(screen.getByLabelText('Choose date'), {
      target: { value: '2026-11-15' },
    });
    expect(screen.getByLabelText('Choose date')).toHaveValue('2026-11-15');
    expect(
      await screen.findByText('0 ml', { exact: true })
    ).toBeInTheDocument();
    expect(screen.getByText("Day's water total")).toBeInTheDocument();
    expect(screen.queryByText("Today's water total")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^3 dl$/ }));
    expect(
      await screen.findByText('300 ml', { exact: true })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(
      await screen.findByText('200 ml', { exact: true })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choose date'), {
      target: { value: '2026-11-15' },
    });
    expect(
      await screen.findByText('300 ml', { exact: true })
    ).toBeInTheDocument();
  });

  it('keeps the selected day when the calendar is cleared or receives an invalid date', async () => {
    render(<App localDate="2026-11-20" />);
    await screen.findByRole('heading', { level: 2, name: 'Today' });

    for (const value of ['', '2026-02-30', 'not-a-date']) {
      fireEvent.change(screen.getByLabelText('Choose date'), {
        target: { value },
      });
      expect(
        screen.getByRole('heading', { level: 2, name: 'Today' })
      ).toBeInTheDocument();
      expect(
        screen.getByText('2026-11-20', { exact: true })
      ).toBeInTheDocument();
    }
  });

  it('hides day navigation when signed out', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    render(<App localDate="2026-11-20" />);
    await screen.findByRole('heading', { level: 2, name: 'Sign in' });

    expect(screen.queryByLabelText('Choose date')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Previous day' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Next day' })
    ).not.toBeInTheDocument();
  });
});

describe('selected-day presentation', () => {
  it('formats the selected heading without changing the current URL', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
    render(<App localDate="2026-11-20" />);
    await screen.findByRole('heading', { level: 2, name: 'Today' });

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Thu, 19 Nov 2026' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sat, 21 Nov 2026' })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Choose date'), {
      target: { value: '2026-11-15' },
    });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sun, 15 Nov 2026' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });
});

describe('app navigation', () => {
  beforeEach(() => {
    auth.getSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
  });

  it('shows the Water, Food, and Settings tabs with Water current on the Today view', async () => {
    render(<App localDate="2026-11-20" />);

    await screen.findByRole('heading', { name: 'Today' });
    expect(
      screen.getByRole('navigation', { name: 'Primary' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Water' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Food' })).not.toHaveAttribute(
      'aria-current'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('switches to the Food stub page and back to the Water view', async () => {
    render(<App localDate="2026-11-20" />);
    await screen.findByRole('heading', { name: 'Today' });

    fireEvent.click(screen.getByRole('link', { name: 'Food' }));

    expect(
      await screen.findByRole('heading', { name: 'Food' })
    ).toBeInTheDocument();
    expect(screen.getByText('Work in progress')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Today' })
    ).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/food');
    expect(screen.getByRole('link', { name: 'Food' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    fireEvent.click(screen.getByRole('link', { name: 'Water' }));

    expect(
      await screen.findByRole('heading', { name: 'Today' })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('renders the Settings stub page from the /settings path', async () => {
    window.history.replaceState(null, '', '/settings');
    render(<App localDate="2026-11-20" />);

    expect(
      await screen.findByRole('heading', { name: 'Settings' })
    ).toBeInTheDocument();
    expect(screen.getByText('Work in progress')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('follows popstate navigation between tabs', async () => {
    render(<App localDate="2026-11-20" />);
    await screen.findByRole('heading', { name: 'Today' });

    window.history.pushState(null, '', '/food');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(
      await screen.findByRole('heading', { name: 'Food' })
    ).toBeInTheDocument();

    window.history.pushState(null, '', '/settings');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(
      await screen.findByRole('heading', { name: 'Settings' })
    ).toBeInTheDocument();
  });

  it('keeps day deep links on the Water tab', async () => {
    window.history.replaceState(null, '', '/days/2026-11-19?tab=water');
    render(<App />);

    await screen.findByRole('heading', { name: 'Today' });
    expect(screen.getByRole('link', { name: 'Water' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      screen.queryByRole('heading', { name: 'Food' })
    ).not.toBeInTheDocument();
  });

  it('hides the tab bar when signed out', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    render(<App localDate="2026-11-20" />);

    await screen.findByRole('heading', { level: 2, name: 'Sign in' });

    expect(
      screen.queryByRole('navigation', { name: 'Primary' })
    ).not.toBeInTheDocument();
  });

  it('returns to the Food stub page after signing in from a /food deep link', async () => {
    window.history.replaceState(null, '', '/food');
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
    render(<App localDate="2026-11-20" />);

    await screen.findByRole('heading', { level: 2, name: 'Sign in' });
    expect(window.location.search).toBe('?redirect=%2Ffood');

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'synthetic-password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Food' })
    ).toBeInTheDocument();
    expect(screen.getByText('Work in progress')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/food');
  });

  it('bounces signed-out /settings deep links to /sign-in and returns after sign-in', async () => {
    window.history.replaceState(null, '', '/settings');
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
    render(<App localDate="2026-11-20" />);

    await screen.findByRole('heading', { level: 2, name: 'Sign in' });
    expect(window.location.search).toBe('?redirect=%2Fsettings');

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'synthetic-password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Settings' })
    ).toBeInTheDocument();
    expect(screen.getByText('Work in progress')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings');
  });
});
