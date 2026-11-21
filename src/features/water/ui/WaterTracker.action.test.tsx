import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WaterTracker } from './WaterTracker';

const addWater = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('../api', () => ({
  useWaterDay: () => ({
    data: [],
    isPending: false,
    isSuccess: true,
    isError: false,
  }),
  useAddWater: () => addWater,
}));

vi.mock('../../../shared/date', () => ({
  getTodayLocalDate: () => {
    throw new Error('Water UI must receive local_date from its caller');
  },
}));

describe('WaterTracker add action', () => {
  beforeEach(() => {
    addWater.mutate.mockReset();
    addWater.isPending = false;
  });

  it('creates the operation id when the user clicks, before the request is sent', () => {
    const order: string[] = [];
    const createOpId = vi.fn(() => {
      order.push('create');
      return 'op-from-the-click';
    });
    addWater.mutate.mockImplementation(() => {
      order.push('send');
    });

    render(<WaterTracker localDate="2026-11-20" createOpId={createOpId} />);
    expect(createOpId).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add 250 ml' }));

    expect(order).toEqual(['create', 'send']);
    expect(addWater.mutate).toHaveBeenCalledExactlyOnceWith({
      id: 'op-from-the-click',
      amountMl: 250,
      localDate: '2026-11-20',
    });
    expect(screen.getByRole('button', { name: 'Add 250 ml' })).toHaveAttribute(
      'type',
      'button'
    );
  });
});
