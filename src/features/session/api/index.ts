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
