import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SignInPage } from './SignInPage';

const signIn = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('../api', () => ({
  useSignIn: () => signIn,
}));

function submitForm() {
  fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
}

describe('SignInPage', () => {
  beforeEach(() => {
    signIn.mutate.mockReset();
    signIn.isPending = false;
  });

  it('shows an email field, a password field, and a submit action', () => {
    render(<SignInPage />);

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    const submit = screen.getByRole('button', { name: 'Sign in' });

    expect(email).toHaveAttribute('type', 'email');
    expect(email).toBeRequired();
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toBeRequired();
    expect(submit).toHaveAttribute('type', 'submit');
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
  });

  it('does not call sign-in when email or password is missing', () => {
    render(<SignInPage />);

    submitForm();
    expect(signIn.mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    submitForm();
    expect(signIn.mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: '   ' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    });
    submitForm();
    expect(signIn.mutate).not.toHaveBeenCalled();
  });

  it('calls the session hook with the trimmed email and password', () => {
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: '  test@example.com  ' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    });
    submitForm();

    expect(signIn.mutate).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'secret',
    });
  });

  it('disables the submit button while sign-in is pending', () => {
    signIn.isPending = true;
    render(<SignInPage />);

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });
});
