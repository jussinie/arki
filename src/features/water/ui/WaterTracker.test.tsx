import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { clearMemoryWaterLog } from '../api';
import { WaterTracker } from './WaterTracker';

vi.mock('../../../shared/date', () => ({
  getTodayLocalDate: () => {
    throw new Error('Water UI must receive local_date from its caller');
  },
}));

function renderTracker(createOpId?: () => string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  const props = createOpId
    ? { localDate: '2026-11-20', createOpId }
    : { localDate: '2026-11-20' };

  return {
    queryClient,
    ...render(<WaterTracker {...props} />, { wrapper: Wrapper }),
  };
}

beforeEach(() => {
  clearMemoryWaterLog();
});

describe('WaterTracker', () => {
  it('shows 250 ml for 2026-11-20 after the user adds water', async () => {
    const createOpId = vi.fn(() => 'op-click');
    const { queryClient } = renderTracker(createOpId);

    expect(
      await screen.findByText('2026-11-20', { exact: true })
    ).toBeInTheDocument();
    expect(
      await screen.findByText('0 ml', { exact: true })
    ).toBeInTheDocument();
    expect(createOpId).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add 250 ml' }));

    expect(createOpId).toHaveBeenCalledOnce();
    expect(
      await screen.findByText('250 ml', { exact: true })
    ).toBeInTheDocument();
    expect(screen.queryByText('0 ml', { exact: true })).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['water-entries', '2026-11-20'])).toEqual([
      { id: 'op-click', amountMl: 250, localDate: '2026-11-20' },
    ]);
  });
});
