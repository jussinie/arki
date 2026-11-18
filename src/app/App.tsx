import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInPage, useCurrentSession } from '../features/session';
import './App.css';

function SessionView() {
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
    </main>
  );
}

export function App() {
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
      <SessionView />
    </QueryClientProvider>
  );
}
