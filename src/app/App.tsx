import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInPage, useCurrentSession, useSignOut } from '../features/session';
import './App.css';

function SessionView() {
  const session = useCurrentSession();
  const signOut = useSignOut();

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
