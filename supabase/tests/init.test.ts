import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

type SupabaseStatusJson = {
  API_URL?: string;
  ANON_KEY?: string;
  _tag?: string;
  error?: { message?: string };
};

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function parseSupabaseStatusOutput(
  stdout: string,
  stderr: string
): { url: string; anonKey: string } {
  const chunks = [stdout, stderr].map((value) => value.trim()).filter(Boolean);
  const parseErrors: string[] = [];

  for (const chunk of chunks) {
    const jsonText = extractJsonObject(chunk);
    if (!jsonText) {
      continue;
    }
    let parsed: SupabaseStatusJson;
    try {
      parsed = JSON.parse(jsonText) as SupabaseStatusJson;
    } catch (err) {
      parseErrors.push(err instanceof Error ? err.message : String(err));
      continue;
    }
    if (parsed._tag === 'Error') {
      throw new Error(
        `${parsed.error?.message ?? 'supabase status reported an error'}. Start local Supabase with \`npm run db:start\`.`
      );
    }
    if (parsed.API_URL && parsed.ANON_KEY) {
      return { url: parsed.API_URL, anonKey: parsed.ANON_KEY };
    }
  }

  const details = [stdout.trim(), stderr.trim(), ...parseErrors]
    .filter(Boolean)
    .join('\n');
  throw new Error(
    `Could not read API_URL and ANON_KEY from supabase status. Start local Supabase with \`npm run db:start\`.${details ? `\n${details}` : ''}`
  );
}

function readCredentialsFromStatus(): { url: string; anonKey: string } {
  const result = spawnSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf-8',
    timeout: 15_000,
  });

  if (result.error) {
    throw new Error(
      `Failed to run supabase status. Start local Supabase with \`npm run db:start\`.\n${result.error.message}`
    );
  }

  if (result.status !== 0) {
    parseSupabaseStatusOutput(result.stdout, result.stderr);
    throw new Error(
      `supabase status exited ${result.status}. Start local Supabase with \`npm run db:start\`.`
    );
  }

  return parseSupabaseStatusOutput(result.stdout, result.stderr);
}

function getSupabaseCredentials(): { url: string; anonKey: string } {
  const envUrl = process.env.VITE_SUPABASE_URL;
  const envAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (envUrl && envAnonKey) {
    return { url: envUrl, anonKey: envAnonKey };
  }

  const fromStatus = readCredentialsFromStatus();
  return {
    url: envUrl ?? fromStatus.url,
    anonKey: envAnonKey ?? fromStatus.anonKey,
  };
}

async function fetchOrThrow(
  target: string,
  init: RequestInit,
  service: string,
  baseUrl: string
): Promise<Response> {
  try {
    return await fetch(target, init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Local ${service} is not reachable at ${baseUrl}. Start it with \`npm run db:start\`.\n${detail}`,
      { cause: err }
    );
  }
}

describe('Supabase Local Database Integration', () => {
  it('connects to local Auth and PostgREST', async () => {
    const { url, anonKey } = getSupabaseCredentials();
    const baseUrl = url.replace(/\/$/, '');
    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    };
    const authResponse = await fetchOrThrow(
      `${baseUrl}/auth/v1/health`,
      { signal: AbortSignal.timeout(5_000) },
      'Auth',
      baseUrl
    );
    expect(authResponse.ok).toBe(true);

    const restResponse = await fetchOrThrow(
      `${baseUrl}/rest/v1/`,
      { headers, signal: AbortSignal.timeout(5_000) },
      'PostgREST',
      baseUrl
    );
    expect(restResponse.ok).toBe(true);
  });
});
