import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInPage, useCurrentSession, useSignOut } from '../features/session';
import { WaterTracker } from '../features/water';
import { formatDisplayDate, getTodayLocalDate } from '../shared/date';
import { DateNavigator } from './DateNavigator';
import { SettingsPage } from './SettingsPage';
import { TabBar } from './TabBar';
import { WorkInProgressPage } from './WorkInProgressPage';
import { SIGN_IN_PATH, getGuardRedirect, resolveAppTab } from './routing';
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

function SessionView({
  localDate,
  today,
  onDateChange,
}: {
  localDate: string;
  today: string;
  onDateChange: (localDate: string) => void;
}) {
  const session = useCurrentSession();
  const signOut = useSignOut();
  const { pathname, search, hash, push, replace } = useAppLocation();
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

  const tab = resolveAppTab(pathname);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__identity">
          <h1>Arki</h1>
          <p className="app__email">{session.data.email}</p>
        </div>
        <button
          className="app__sign-out"
          type="button"
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
        >
          Sign out
        </button>
      </header>
      {signOut.isError ? (
        <p className="app__sign-out-error" role="alert">
          Could not sign out. Try again.
        </p>
      ) : null}
      {tab === 'food' ? (
        <WorkInProgressPage title="Food" />
      ) : tab === 'settings' ? (
        <SettingsPage today={today} />
      ) : (
        <main className="today">
          <h2>
            {localDate === today ? 'Today' : formatDisplayDate(localDate)}
          </h2>
          <DateNavigator
            value={localDate}
            today={today}
            onChange={onDateChange}
          />
          <WaterTracker localDate={localDate} />
        </main>
      )}
      <TabBar activeTab={tab} onNavigate={push} />
    </div>
  );
}

export function App({
  localDate = getTodayLocalDate(),
}: {
  localDate?: string;
}) {
  const [selectedDate, setSelectedDate] = useState(localDate);
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
      <SessionView
        localDate={selectedDate}
        today={localDate}
        onDateChange={setSelectedDate}
      />
    </QueryClientProvider>
  );
}
