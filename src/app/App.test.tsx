import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { App } from './App';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('../shared/supabase', () => ({ supabase: { auth } }));

const user = { id: 'synthetic-user', email: 'test@example.com' };

beforeEach(() => {
  vi.resetAllMocks();
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
});
