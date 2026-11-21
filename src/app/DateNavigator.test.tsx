import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DateNavigator } from './DateNavigator';

const TODAY = '2026-11-20';

describe('DateNavigator', () => {
  it('is controlled: requests a new date and displays only its supplied value', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DateNavigator value={TODAY} today={TODAY} onChange={onChange} />
    );
    expect(
      screen.getByRole('navigation', { name: 'Day navigation' })
    ).toBeVisible();
    expect(screen.getByLabelText('Choose date')).toHaveValue(TODAY);
    expect(
      screen.queryByRole('button', { name: 'Today' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-19');
    expect(screen.getByLabelText('Choose date')).toHaveValue(TODAY);

    rerender(
      <DateNavigator value="2026-11-19" today={TODAY} onChange={onChange} />
    );
    expect(screen.getByLabelText('Choose date')).toHaveValue('2026-11-19');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(onChange).toHaveBeenLastCalledWith(TODAY);
  });

  it.each([
    ['2026-11-20', 'Next day', '2026-11-21'],
    ['2026-12-31', 'Next day', '2027-01-01'],
    ['2027-01-01', 'Previous day', '2026-12-31'],
    ['2024-03-01', 'Previous day', '2024-02-29'],
    ['2024-02-29', 'Next day', '2024-03-01'],
    ['2026-03-01', 'Previous day', '2026-02-28'],
  ])('navigates from %s via %s to %s', (value, button, expected) => {
    const onChange = vi.fn();
    render(<DateNavigator value={value} today={TODAY} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('accepts a valid calendar selection, including future dates', () => {
    const onChange = vi.fn();
    render(<DateNavigator value={TODAY} today={TODAY} onChange={onChange} />);
    const picker = screen.getByLabelText('Choose date');
    expect(picker).toHaveAttribute('type', 'date');
    expect(picker).toHaveAttribute('min', '0001-01-01');
    expect(picker).toHaveAttribute('max', '9999-12-31');
    for (const value of ['2026-11-15', '2026-11-21']) {
      fireEvent.change(picker, { target: { value } });
      expect(onChange).toHaveBeenLastCalledWith(value);
      expect(picker).toHaveValue(TODAY);
    }
  });

  it.each(['', 'not-a-date', '2026-02-30', '0000-01-01', '10000-01-01'])(
    'ignores empty or invalid picker input %j',
    (value) => {
      const onChange = vi.fn();
      render(<DateNavigator value={TODAY} today={TODAY} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('Choose date'), {
        target: { value },
      });
      expect(onChange).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['0001-01-01', 'Previous day', 'Next day', '0001-01-02'],
    ['9999-12-31', 'Next day', 'Previous day', '9999-12-30'],
  ])(
    'prevents navigation beyond %s while allowing the other direction',
    (value, disabled, enabled, expected) => {
      const onChange = vi.fn();
      render(<DateNavigator value={value} today={TODAY} onChange={onChange} />);
      expect(screen.getByRole('button', { name: disabled })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: disabled }));
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: enabled }));
      expect(onChange).toHaveBeenCalledExactlyOnceWith(expected);
    }
  );
});
