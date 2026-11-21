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

  it('creates a new operation id for each decilitre button before that amount is sent', () => {
    const order: string[] = [];
    let nextId = 0;
    const createOpId = vi.fn(() => {
      order.push('create');
      nextId += 1;
      return `op-dl-${nextId}`;
    });
    addWater.mutate.mockImplementation(() => {
      order.push('send');
    });

    render(<WaterTracker localDate="2026-11-20" createOpId={createOpId} />);
    expect(createOpId).not.toHaveBeenCalled();

    for (const dl of [1, 2, 3, 4]) {
      fireEvent.click(screen.getByRole('button', { name: `Add ${dl} dl` }));
    }

    expect(order).toEqual([
      'create',
      'send',
      'create',
      'send',
      'create',
      'send',
      'create',
      'send',
    ]);
    expect(addWater.mutate).toHaveBeenNthCalledWith(1, {
      id: 'op-dl-1',
      amountMl: 100,
      localDate: '2026-11-20',
    });
    expect(addWater.mutate).toHaveBeenNthCalledWith(2, {
      id: 'op-dl-2',
      amountMl: 200,
      localDate: '2026-11-20',
    });
    expect(addWater.mutate).toHaveBeenNthCalledWith(3, {
      id: 'op-dl-3',
      amountMl: 300,
      localDate: '2026-11-20',
    });
    expect(addWater.mutate).toHaveBeenNthCalledWith(4, {
      id: 'op-dl-4',
      amountMl: 400,
      localDate: '2026-11-20',
    });
    for (const dl of [1, 2, 3, 4]) {
      expect(
        screen.getByRole('button', { name: `Add ${dl} dl` })
      ).toHaveAttribute('type', 'button');
    }
  });
});
