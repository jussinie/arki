import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryWaterLog, useAddWater, useWaterDay } from './index';

vi.mock('../../../shared/date', () => ({
  getTodayLocalDate: vi.fn(() => {
    throw new Error('local_date must be supplied by the caller');
  }),
}));

const today = '2026-11-20';
const yesterday = '2026-11-19';

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

function renderWater() {
  return renderHook(
    () => ({
      today: useWaterDay(today),
      yesterday: useWaterDay(yesterday),
      add: useAddWater(),
    }),
    { wrapper: createWrapper() }
  );
}

beforeEach(() => {
  clearMemoryWaterLog();
});

describe('useAddWater', () => {
  it('records 250 ml on the local date the caller sends', async () => {
    const { result } = renderWater();
    await waitFor(() => expect(result.current.today.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.yesterday.isSuccess).toBe(true));

    await act(async () => {
      await result.current.add.mutateAsync({
        id: 'op-today',
        amountMl: 250,
        localDate: today,
      });
    });

    await waitFor(() =>
      expect(result.current.today.data).toEqual([
        { id: 'op-today', amountMl: 250, localDate: today },
      ])
    );
    expect(result.current.yesterday.data).toEqual([]);
  });

  it('does not generate an operation id when the request runs', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID');
    const { result } = renderWater();
    await waitFor(() => expect(result.current.today.isSuccess).toBe(true));

    await act(async () => {
      await result.current.add.mutateAsync({
        id: 'op-from-the-click',
        amountMl: 250,
        localDate: today,
      });
    });

    expect(randomUUID).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.today.data).toEqual([
        {
          id: 'op-from-the-click',
          amountMl: 250,
          localDate: today,
        },
      ])
    );
    randomUUID.mockRestore();
  });

  it('stores one row when the same operation id is sent twice', async () => {
    const { result } = renderWater();
    await waitFor(() => expect(result.current.today.isSuccess).toBe(true));
    const first = {
      id: 'op-retry',
      amountMl: 250,
      localDate: today,
    };

    await act(async () => {
      await result.current.add.mutateAsync(first);
      await result.current.add.mutateAsync({
        ...first,
        amountMl: 500,
      });
    });

    await waitFor(() => expect(result.current.today.data).toEqual([first]));
  });
});
