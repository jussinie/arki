import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentSession, useCurrentSession, useSignIn } from './index';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
}));
vi.mock('../../../shared/supabase', () => ({ supabase: { auth } }));

const user = { id: 'synthetic-user', email: 'test@example.com' };
const session = { userId: user.id, email: user.email };
const credentials = { email: user.email, password: 'synthetic-password' };

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

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
});

describe('session API', () => {
  it('reads the current user from a persisted session', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
    await expect(getCurrentSession()).resolves.toEqual(session);
  });

  it('returns null when signed out', async () => {
    await expect(getCurrentSession()).resolves.toBeNull();
  });

  it('propagates session errors', async () => {
    const error = new Error('Session unavailable');
    auth.getSession.mockResolvedValue({ data: { session: null }, error });
    await expect(getCurrentSession()).rejects.toBe(error);
  });

  it('signs in through Supabase and updates the current session', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user }, error: null });
    const { result } = renderHook(
      () => ({ current: useCurrentSession(), signIn: useSignIn() }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.current.isSuccess).toBe(true));
    expect(result.current.current.data).toBeNull();

    await act(async () => {
      await result.current.signIn.mutateAsync(credentials);
    });

    expect(auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith(
      credentials
    );
    await waitFor(() => expect(result.current.current.data).toEqual(session));
  });

  it('keeps the user signed out when authentication fails', async () => {
    const error = new Error('Invalid login credentials');
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error });
    const { result } = renderHook(
      () => ({ current: useCurrentSession(), signIn: useSignIn() }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.current.isSuccess).toBe(true));

    await act(async () => {
      await expect(result.current.signIn.mutateAsync(credentials)).rejects.toBe(
        error
      );
    });

    expect(result.current.current.data).toBeNull();
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });
});
