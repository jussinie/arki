import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WaterTracker } from './WaterTracker';

const waterDay = vi.hoisted(() => ({
  data: [] as { id: string; amountMl: number; localDate: string }[] | undefined,
  isPending: false,
  isError: false,
}));

const waterGoal = vi.hoisted(() => ({
  data: 2000 as number | undefined,
  isPending: false,
  isError: false,
}));

const addWater = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
}));

vi.mock('../api', () => ({
  useWaterDay: () => waterDay,
  useAddWater: () => addWater,
  useWaterGoal: () => waterGoal,
  useSetWaterGoal: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
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
    waterGoal.data = 2000;
    waterGoal.isPending = false;
    waterGoal.isError = false;
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
    expect(
      screen.queryByRole('progressbar', { name: 'Daily water goal' })
    ).not.toBeInTheDocument();
  });

  it('shows Loading water goal and still lets the user add water', () => {
    waterGoal.isPending = true;
    waterGoal.data = undefined;
    render(<WaterTracker localDate="2026-11-20" createOpId={() => 'op-1'} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading water goal…');
    expect(
      screen.queryByLabelText('Daily water goal (L)')
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Day's water total")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^2 dl$/ }));
    expect(addWater.mutate).toHaveBeenCalledExactlyOnceWith({
      id: 'op-1',
      amountMl: 200,
      localDate: '2026-11-20',
    });
  });

  it('still lists water entries while the goal is loading', () => {
    waterGoal.isPending = true;
    waterGoal.data = undefined;
    waterDay.data = [
      { id: 'entry-200', amountMl: 200, localDate: '2026-11-20' },
      { id: 'entry-500', amountMl: 500, localDate: '2026-11-20' },
    ];
    render(<WaterTracker localDate="2026-11-20" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading water goal…');
    expect(
      within(screen.getByRole('list', { name: 'Water entries' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
    ).toEqual(['200 ml', '500 ml']);
  });

  it('still lists water entries when the water goal fails to load', () => {
    waterGoal.isError = true;
    waterGoal.data = undefined;
    waterDay.data = [
      { id: 'entry-200', amountMl: 200, localDate: '2026-11-20' },
      { id: 'entry-500', amountMl: 500, localDate: '2026-11-20' },
    ];
    render(<WaterTracker localDate="2026-11-20" createOpId={() => 'op-1'} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to load the water goal. Please reload.'
    );
    expect(
      within(screen.getByRole('list', { name: 'Water entries' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
    ).toEqual(['200 ml', '500 ml']);

    fireEvent.click(screen.getByRole('button', { name: /^1 dl$/ }));
    expect(addWater.mutate).toHaveBeenCalledExactlyOnceWith({
      id: 'op-1',
      amountMl: 100,
      localDate: '2026-11-20',
    });
  });

  it('hides stale entries when reloading the day fails', () => {
    waterDay.isError = true;
    waterDay.data = [{ id: 'stale', amountMl: 200, localDate: '2026-11-20' }];
    render(<WaterTracker localDate="2026-11-20" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to load water entries. Please reload.'
    );
    expect(
      screen.queryByRole('list', { name: 'Water entries' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('200 ml', { exact: true })
    ).not.toBeInTheDocument();
  });

  it('treats a missing goal payload as a load failure even without an error flag', () => {
    waterGoal.data = undefined;
    render(<WaterTracker localDate="2026-11-20" createOpId={() => 'op-1'} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to load the water goal. Please reload.'
    );
    expect(
      screen.queryByLabelText('Daily water goal (L)')
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Day's water total")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^1 dl$/ }));
    expect(addWater.mutate).toHaveBeenCalledExactlyOnceWith({
      id: 'op-1',
      amountMl: 100,
      localDate: '2026-11-20',
    });
  });
});
