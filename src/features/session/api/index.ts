import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/supabase';
import type { Session } from '../model';

export type SignInCredentials = {
  email: string;
  password: string;
};

const sessionKey = ['session'] as const;

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user) {
    return null;
  }
  return {
    userId: data.session.user.id,
    email: data.session.user.email ?? null,
  };
}

export async function signInWithPassword(
  credentials: SignInCredentials
): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error) throw error;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
  };
}

export function useCurrentSession() {
  return useQuery({ queryKey: sessionKey, queryFn: getCurrentSession });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signInWithPassword,
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKey, session);
    },
  });
}

/**
 * Ends the session on this device, then confirms the stored session is gone.
 * Local scope removes the browser session before the server revoke, so a
 * failed logout request cannot leave the user stuck in today's view.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (data.session?.user) {
    throw error instanceof Error ? error : new Error('Could not sign out');
  }
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await signOut();
      // Clear before the mutation settles so today's view cannot paint
      // from the previous cached session.
      await queryClient.cancelQueries(
        { queryKey: sessionKey },
        { revert: false }
      );
      queryClient.setQueryData<Session | null>(sessionKey, null);
    },
  });
}
