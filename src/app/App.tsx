import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInPage, useCurrentSession, useSignOut } from '../features/session';
import { WaterTracker } from '../features/water';
import { getTodayLocalDate } from '../shared/date';
import { SIGN_IN_PATH, getGuardRedirect } from './routing';
import { useAppLocation } from './useAppLocation';
import './App.css';

function resolveRouteRedirect({
  location,
  isPending,
  isError,
  isAuthenticated,
  isSigningOut,
}: {
  location: { pathname: string; search: string; hash: string };
  isPending: boolean;
  isError: boolean;
  isAuthenticated: boolean;
  isSigningOut: boolean;
}): string | null {
  if (isPending || isError) {
    return null;
  }
  if (!isAuthenticated && isSigningOut) {
    const isCleanSignIn =
      location.pathname === SIGN_IN_PATH &&
      location.search === '' &&
      location.hash === '';
    return isCleanSignIn ? null : SIGN_IN_PATH;
  }
  return getGuardRedirect(location, isAuthenticated);
}

function SessionView({ localDate }: { localDate: string }) {
  const session = useCurrentSession();
  const signOut = useSignOut();
  const { pathname, search, hash, replace } = useAppLocation();
  const isAuthenticated = Boolean(session.data);
  const { isSuccess: isSignOutSuccess, reset: resetSignOut } = signOut;

  const guardRedirect = resolveRouteRedirect({
    location: { pathname, search, hash },
    isPending: session.isPending,
    isError: session.isError,
    isAuthenticated,
    isSigningOut: signOut.isPending || isSignOutSuccess,
  });

  useEffect(() => {
    if (guardRedirect !== null) {
      replace(guardRedirect);
      return;
    }
    if (
      isSignOutSuccess &&
      (isAuthenticated ||
        (pathname === SIGN_IN_PATH && search === '' && hash === ''))
    ) {
      resetSignOut();
    }
  }, [
    guardRedirect,
    hash,
    isAuthenticated,
    isSignOutSuccess,
    pathname,
    replace,
    resetSignOut,
    search,
  ]);

  if (session.isPending) return <p role="status">Loading…</p>;
  if (session.isError)
    return <p role="alert">Unable to load your session. Please reload.</p>;
  if (!session.data) return <SignInPage />;

  return (
    <main className="today">
      <header className="today__header">
        <div className="today__identity">
          <h1>Arki</h1>
          <p className="today__email">{session.data.email}</p>
        </div>
        <button
          className="today__sign-out"
          type="button"
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
        >
          Sign out
        </button>
      </header>
      <h2>Today</h2>
      {signOut.isError ? (
        <p className="today__error" role="alert">
          Could not sign out. Try again.
        </p>
      ) : null}
      <WaterTracker localDate={localDate} />
    </main>
  );
}

export function App({
  localDate = getTodayLocalDate(),
}: {
  localDate?: string;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionView localDate={localDate} />
    </QueryClientProvider>
  );
}
