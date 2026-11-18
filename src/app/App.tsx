import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInPage } from '../features/session';

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
      <SignInPage />
    </QueryClientProvider>
  );
}
