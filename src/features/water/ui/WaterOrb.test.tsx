import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MAX_WATER_GOAL_ML, MIN_WATER_GOAL_ML } from '../model';
import { WaterOrb } from './WaterOrb';

const orbCss = readFileSync(
  join(process.cwd(), 'src/features/water/ui/WaterOrb.css'),
  'utf8'
);

beforeEach(() => {
  // Vitest does not inject imported stylesheets into jsdom, and it resets
  // the document between tests. Geometry lives in CSS, so install that file.
  document.head.querySelector('[data-water-orb]')?.remove();
  const style = document.createElement('style');
  style.dataset.waterOrb = 'true';
  style.textContent = orbCss;
  document.head.appendChild(style);
});

function fillOf(orb: HTMLElement): HTMLElement {
  const fill = orb.querySelector('.water__bar-fill');
  if (!(fill instanceof HTMLElement)) {
    throw new Error('Expected the water fill inside the daily goal orb');
  }
  return fill;
}

describe('WaterOrb', () => {
  it('shows 500 ml of a 2 L goal as a quarter-full glass', () => {
    render(<WaterOrb consumedMl={500} goalMl={2000} />);

    const orb = screen.getByRole('progressbar', { name: 'Daily water goal' });
    expect(orb).toHaveAttribute('aria-valuemin', '0');
    expect(orb).toHaveAttribute('aria-valuemax', '2000');
    expect(orb).toHaveAttribute('aria-valuenow', '500');
    expect(orb).toHaveAttribute('aria-valuetext', '500 ml of 2 L');
    expect(screen.getByText('0.5 L')).toBeInTheDocument();
    expect(screen.getByText('of 2 L · 25%')).toBeInTheDocument();

    const fill = fillOf(orb);
    expect(fill).toHaveStyle({ width: '25%', height: '25%' });
    expect(orb.querySelector('svg path')).toBeInTheDocument();
    expect(orb.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows 1.55 L and 77.5% for 1550 ml of a 2 L goal', () => {
    render(<WaterOrb consumedMl={1550} goalMl={2000} />);

    expect(screen.getByText('1.55 L')).toBeInTheDocument();
    expect(screen.getByText('of 2 L · 77.5%')).toBeInTheDocument();
    expect(
      fillOf(screen.getByRole('progressbar', { name: 'Daily water goal' }))
    ).toHaveStyle({ width: '77.5%', height: '77.5%' });
  });

  it('fills the glass at the goal and stays full past it', () => {
    const { rerender } = render(<WaterOrb consumedMl={2000} goalMl={2000} />);

    let orb = screen.getByRole('progressbar', { name: 'Daily water goal' });
    expect(orb).toHaveAttribute('aria-valuenow', '2000');
    expect(orb).toHaveAttribute('aria-valuemax', '2000');
    expect(orb).toHaveAttribute('aria-valuetext', '2000 ml of 2 L');
    expect(fillOf(orb)).toHaveStyle({ width: '100%', height: '100%' });
    expect(screen.getByText('2 L')).toBeInTheDocument();
    expect(screen.getByText('of 2 L · 100%')).toBeInTheDocument();

    rerender(<WaterOrb consumedMl={2500} goalMl={2000} />);
    orb = screen.getByRole('progressbar', { name: 'Daily water goal' });
    expect(orb).toHaveAttribute('aria-valuenow', '2000');
    expect(orb).toHaveAttribute('aria-valuemax', '2000');
    expect(orb).toHaveAttribute('aria-valuetext', '2500 ml of 2 L');
    expect(fillOf(orb)).toHaveStyle({ width: '100%', height: '100%' });
    expect(screen.getByText('2.5 L')).toBeInTheDocument();
    expect(screen.getByText('of 2 L · 100%')).toBeInTheDocument();
  });

  it('shows an empty glass before any water is logged', () => {
    render(<WaterOrb consumedMl={0} goalMl={2000} />);

    const orb = screen.getByRole('progressbar', { name: 'Daily water goal' });
    expect(orb).toHaveAttribute('aria-valuenow', '0');
    expect(orb).toHaveAttribute('aria-valuetext', '0 ml of 2 L');
    expect(fillOf(orb)).toHaveStyle({ width: '0%', height: '0%' });
    expect(screen.getByText('0 L')).toBeInTheDocument();
    expect(screen.getByText('of 2 L · 0%')).toBeInTheDocument();
    expect(orb.querySelector('svg')).not.toBeInTheDocument();
  });

  it('treats a negative or non-finite amount as an empty glass', () => {
    for (const consumedMl of [-50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { unmount } = render(
        <WaterOrb consumedMl={consumedMl} goalMl={2000} />
      );
      const orb = screen.getByRole('progressbar', { name: 'Daily water goal' });
      expect(orb).toHaveAttribute('aria-valuenow', '0');
      expect(orb).toHaveAttribute('aria-valuetext', '0 ml of 2 L');
      expect(fillOf(orb)).toHaveStyle({ width: '0%', height: '0%' });
      unmount();
    }
  });

  it('keeps 1999 ml of a 2 L goal at 99.9% so the glass is not full before the goal', () => {
    render(<WaterOrb consumedMl={1999} goalMl={2000} />);

    const orb = screen.getByRole('progressbar', { name: 'Daily water goal' });
    expect(orb).toHaveAttribute('aria-valuenow', '1999');
    expect(orb).toHaveAttribute('aria-valuemax', '2000');
    expect(orb).toHaveAttribute('aria-valuetext', '1999 ml of 2 L');
    expect(fillOf(orb)).toHaveStyle({ width: '99.9%', height: '99.9%' });
    expect(screen.getByText('1.999 L')).toBeInTheDocument();
    expect(screen.getByText('of 2 L · 99.9%')).toBeInTheDocument();
    expect(orb.querySelector('svg')).toBeInTheDocument();
  });

  it('treats a missing or invalid goal as an empty glass', () => {
    for (const goalMl of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { unmount } = render(<WaterOrb consumedMl={500} goalMl={goalMl} />);
      const orb = screen.getByRole('progressbar', { name: 'Daily water goal' });
      expect(fillOf(orb)).toHaveStyle({ width: '0%', height: '0%' });
      expect(orb.querySelector('svg')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('keeps the rendered fill between 0 and 100% and aria-valuenow within the goal', () => {
    fc.assert(
      fc.property(
        fc.double({
          min: 0,
          max: 50_000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.integer({ min: MIN_WATER_GOAL_ML, max: MAX_WATER_GOAL_ML }),
        (consumedMl, goalMl) => {
          const { unmount } = render(
            <WaterOrb consumedMl={consumedMl} goalMl={goalMl} />
          );
          try {
            const orb = screen.getByRole('progressbar', {
              name: 'Daily water goal',
            });
            const fill = fillOf(orb);
            const height = Number.parseFloat(fill.style.height);
            const width = Number.parseFloat(fill.style.width);
            expect(height).toBeGreaterThanOrEqual(0);
            expect(height).toBeLessThanOrEqual(100);
            expect(width).toBeGreaterThanOrEqual(0);
            expect(width).toBeLessThanOrEqual(100);

            const now = Number(orb.getAttribute('aria-valuenow'));
            const max = Number(orb.getAttribute('aria-valuemax'));
            expect(max).toBe(goalMl);
            expect(now).toBeLessThanOrEqual(max);
            if (consumedMl >= goalMl) {
              expect(height).toBe(100);
              expect(now).toBe(max);
            }
            if (consumedMl === 0) {
              expect(height).toBe(0);
              expect(now).toBe(0);
            }
          } finally {
            unmount();
          }
        }
      )
    );
  });

  it('is a 12rem circle whose level eases and whose wave loops, unless motion is reduced', () => {
    render(<WaterOrb consumedMl={500} goalMl={2000} />);

    const orb = screen.getByRole('progressbar', { name: 'Daily water goal' });
    const orbStyle = getComputedStyle(orb);
    expect(orbCss).toMatch(/width:\s*12rem/);
    expect(orbCss).toMatch(/height:\s*12rem/);
    expect(orbStyle.width).toBe('192px');
    expect(orbStyle.height).toBe('192px');
    expect(orbStyle.borderRadius).toBe('50%');
    expect(orbStyle.overflow).toBe('hidden');

    const fill = fillOf(orb);
    const fillStyle = getComputedStyle(fill);
    expect(fillStyle.position).toBe('absolute');
    expect(fillStyle.bottom).toBe('0px');
    expect(fillStyle.minWidth).toBe('100%');

    const wave = orb.querySelector('.water-orb__wave');
    expect(wave).toBeInstanceOf(SVGElement);
    expect(getComputedStyle(wave as Element).width).toBe('200%');

    expect(orbCss).toMatch(/solid var\(--color-surface\)/);
    expect(orbCss).toMatch(
      /linear-gradient\(\s*to top,\s*var\(--color-water-deep\),\s*var\(--color-water-top\)/
    );
    expect(orbCss).toMatch(/translateX\(-50%\)/);
    expect(orbCss).toMatch(
      /color-mix\(in srgb, var\(--color-surface\) 90%, transparent\)/
    );
    expect(orbCss).toMatch(/height\s+600ms\s+ease-out/);
    expect(orbCss).toMatch(/water-orb-wave\s+6s/);
    const reduceAt = orbCss.indexOf('prefers-reduced-motion: reduce');
    expect(reduceAt).toBeGreaterThan(-1);
    const reduceBlock = orbCss.slice(reduceAt);
    expect(reduceBlock).toMatch(/animation:\s*none/);
    expect(reduceBlock).toMatch(/transition:\s*none/);
  });
});
