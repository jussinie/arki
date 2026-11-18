import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { App } from './App';

describe('App', () => {
  it('shows the sign-in page when the app opens', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Arki' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sign in' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password'
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
