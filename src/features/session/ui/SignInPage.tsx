import { useState, type FormEvent } from 'react';
import { useSignIn } from '../api';
import './SignInPage.css';

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useSignIn();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (trimmedEmail === '' || password === '') {
      return;
    }
    signIn.mutate({ email: trimmedEmail, password });
  }

  return (
    <main className="sign-in">
      <div className="sign-in__panel">
        <h1 className="sign-in__brand">Arki</h1>
        <h2 id="sign-in-title" className="sign-in__title">
          Sign in
        </h2>
        <form
          className="sign-in__form"
          method="post"
          aria-labelledby="sign-in-title"
          onSubmit={handleSubmit}
        >
          <div className="sign-in__field">
            <label htmlFor="sign-in-email">Email</label>
            <input
              id="sign-in-email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </div>
          <div className="sign-in__field">
            <label htmlFor="sign-in-password">Password</label>
            <input
              id="sign-in-password"
              name="password"
              type="password"
              autoComplete="current-password"
              enterKeyHint="go"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </div>
          <button
            className="sign-in__submit"
            type="submit"
            disabled={signIn.isPending}
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
