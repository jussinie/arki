import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../../shared/supabase';
import type { Session } from '../model';

export type SignInCredentials = {
  email: string;
  password: string;
};

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) {
    return null;
  }
  return {
    userId: data.session.user.id,
    email: data.session.user.email ?? null,
  };
}

// Stub until the successful sign-in story calls Supabase Auth.
export async function signInWithPassword(
  credentials: SignInCredentials
): Promise<void> {
  void credentials;
}

export function useSignIn() {
  return useMutation({
    mutationFn: signInWithPassword,
  });
}
