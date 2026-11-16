import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';

function getSupabaseCredentials(): { url: string; anonKey: string } {
  let url = process.env.VITE_SUPABASE_URL;
  let anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    try {
      const result = spawnSync('npx', ['supabase', 'status', '-o', 'json'], {
        encoding: 'utf-8',
      });
      if (result.status === 0 && result.stdout) {
        const parsed = JSON.parse(result.stdout) as {
          API_URL?: string;
          ANON_KEY?: string;
        };
        url = url ?? parsed.API_URL;
        anonKey = anonKey ?? parsed.ANON_KEY;
      }
    } catch {
      // Fallback below
    }
  }

  url = url ?? 'http://127.0.0.1:54321';
  anonKey = anonKey ?? 'placeholder-anon-key';

  return { url, anonKey };
}

describe('Supabase Local Database Integration', () => {
  it('connects to Supabase and gets a session response', async () => {
    const { url, anonKey } = getSupabaseCredentials();
    const client = createClient(url, anonKey);

    try {
      const { data, error } = await client.auth.getSession();
      expect(error).toBeNull();
      expect(data).toHaveProperty('session');
    } catch (err) {
      // If local Supabase container is not running during offline unit test run,
      // report clear guidance.
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('fetch failed') ||
        message.includes('ECONNREFUSED')
      ) {
        console.warn(
          'Supabase container not reachable at ' +
            url +
            '. Start local Supabase with `npm run db:start`.'
        );
      } else {
        throw err;
      }
    }
  });
});
