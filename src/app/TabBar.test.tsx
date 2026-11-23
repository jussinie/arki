import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TabBar } from './TabBar';

describe('TabBar', () => {
  it('renders Water, Food, and Settings links to their tab paths', () => {
    render(<TabBar activeTab="water" onNavigate={() => undefined} />);

    expect(
      screen.getByRole('navigation', { name: 'Primary' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Water' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.getByRole('link', { name: 'Food' })).toHaveAttribute(
      'href',
      '/food'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings'
    );
  });

  it('marks only the active tab as the current page', () => {
    render(<TabBar activeTab="food" onNavigate={() => undefined} />);

    expect(screen.getByRole('link', { name: 'Food' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Water' })).not.toHaveAttribute(
      'aria-current'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('intercepts plain left clicks and reports the target path', () => {
    const onNavigate = vi.fn();
    render(<TabBar activeTab="water" onNavigate={onNavigate} />);
    const foodLink = screen.getByRole('link', { name: 'Food' });
    const clickEvent = createEvent.click(foodLink);

    fireEvent(foodLink, clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('/food');
  });

  it('keeps native browser behaviour for modified or non-left clicks', () => {
    const onNavigate = vi.fn();
    render(<TabBar activeTab="water" onNavigate={onNavigate} />);
    const foodLink = screen.getByRole('link', { name: 'Food' });

    const clickInits = [
      { button: 0, ctrlKey: true },
      { button: 0, metaKey: true },
      { button: 0, shiftKey: true },
      { button: 0, altKey: true },
      { button: 1 },
      { button: 2 },
    ];

    for (const init of clickInits) {
      const clickEvent = createEvent.click(foodLink, init);
      fireEvent(foodLink, clickEvent);
      expect(clickEvent.defaultPrevented).toBe(false);
    }

    expect(onNavigate).not.toHaveBeenCalled();
  });
});
