import { fireEvent, render, screen } from '@testing-library/react';
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
