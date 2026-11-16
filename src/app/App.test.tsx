import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { App } from './App';

describe('App', () => {
  it('renders the Arki heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Arki' })
    ).toBeInTheDocument();
  });
});
