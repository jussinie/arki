import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WaterTracker } from './WaterTracker';

const waterDay = vi.hoisted(() => ({
  data: [] as { id: string; amountMl: number; localDate: string }[] | undefined,
  isPending: false,
  isError: false,
}));

const waterGoals = vi.hoisted(() => ({
  data: [] as
    { localDate: string; goalMl: number; singleDay: boolean }[] | undefined,
  isPending: false,
  isError: false,
  isSuccess: true,
}));

const addWater = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
}));

vi.mock('../api', () => ({
  useWaterDay: () => waterDay,
  useAddWater: () => addWater,
  useWaterGoals: () => waterGoals,
}));

vi.mock('../../../shared/date', () => ({
  getTodayLocalDate: () => {
    throw new Error('Water UI must receive local_date from its caller');
  },
}));

describe('WaterTracker loading and missing-goal states', () => {
  beforeEach(() => {
    addWater.mutate.mockReset();
    addWater.isPending = false;
    addWater.isError = false;
    waterDay.data = [];
    waterDay.isPending = false;
    waterDay.isError = false;
    waterGoals.data = [
      { localDate: '2026-11-20', goalMl: 2000, singleDay: false },
    ];
    waterGoals.isPending = false;
    waterGoals.isError = false;
    waterGoals.isSuccess = true;
  });

  it('shows Loading water and hides add buttons while entries are pending', () => {
    waterDay.isPending = true;
    waterDay.data = undefined;
    render(<WaterTracker localDate="2026-11-20" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading water…');
    expect(
      screen.queryByRole('button', { name: /^1 dl$/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Daily water goal (L)')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('0 ml', { exact: true })).not.toBeInTheDocument();
  });

  it('shows Loading water goal and still lets the user add water', () => {
    waterGoals.isPending = true;
    waterGoals.data = undefined;
    render(<WaterTracker localDate="2026-11-20" createOpId={() => 'op-1'} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading water goal…');
    expect(
      screen.queryByLabelText('Daily water goal (L)')
    ).not.toBeInTheDocument();
    expect(screen.getByText('0 ml', { exact: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));
    expect(addWater.mutate).toHaveBeenCalledExactlyOnceWith({
      id: 'op-1',
      amountMl: 200,
      localDate: '2026-11-20',
    });
  });

  it('treats a missing goal payload as a load failure even without an error flag', () => {
    waterGoals.data = undefined;
    waterGoals.isSuccess = true;
    render(<WaterTracker localDate="2026-11-20" createOpId={() => 'op-1'} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to load the water goal. Please reload.'
    );
    expect(
      screen.queryByLabelText('Daily water goal (L)')
    ).not.toBeInTheDocument();
    expect(screen.getByText('0 ml', { exact: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^1 dl$/ }));
    expect(addWater.mutate).toHaveBeenCalledExactlyOnceWith({
      id: 'op-1',
      amountMl: 100,
      localDate: '2026-11-20',
    });
  });
});
