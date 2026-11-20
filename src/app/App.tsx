import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInPage, useCurrentSession } from '../features/session';
import { WaterTracker } from '../features/water';
import { getTodayLocalDate } from '../shared/date';
import './App.css';

function SessionView({ localDate }: { localDate: string }) {
  const session = useCurrentSession();

  if (session.isPending) return <p role="status">Loading…</p>;
  if (session.isError)
    return <p role="alert">Unable to load your session. Please reload.</p>;
  if (!session.data) return <SignInPage />;

  return (
    <main className="today">
      <header className="today__header">
        <h1>Arki</h1>
        <p className="today__email">{session.data.email}</p>
      </header>
      <h2>Today</h2>
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
