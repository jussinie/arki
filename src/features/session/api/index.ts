import { supabase } from '../../../shared/supabase';
import type { Session } from '../model';

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
