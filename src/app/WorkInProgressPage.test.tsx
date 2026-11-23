import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { WorkInProgressPage } from './WorkInProgressPage';

describe('WorkInProgressPage', () => {
  it('states the Food section title and that it is a work in progress', () => {
    render(<WorkInProgressPage title="Food" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Food' })
    ).toBeInTheDocument();
    expect(screen.getByText('Work in progress')).toBeInTheDocument();
  });

  it('states the Settings section title and that it is a work in progress', () => {
    render(<WorkInProgressPage title="Settings" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Settings' })
    ).toBeInTheDocument();
    expect(screen.getByText('Work in progress')).toBeInTheDocument();
  });
});
