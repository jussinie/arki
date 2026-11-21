import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/shared/supabase/database.types';
import { addWaterEntry, listWaterEntries } from '../../src/features/water/api';

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

function createTestClient(
  url: string,
  anonKey: string
): SupabaseClient<Database> {
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signInTestUser(
  url: string,
  anonKey: string,
  email: string,
  password: string
): Promise<{ client: SupabaseClient<Database>; userId: string }> {
  const client = createTestClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw error ?? new Error(`Failed to sign in synthetic user ${email}`);
  }
  return { client, userId: data.user.id };
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

describe('water_entries table, RLS, and idempotency (ARK-9)', () => {
  const TEST_PASSWORD = 'Arki-test-password-123!';
  let anonClient: SupabaseClient<Database>;
  let userAClient: SupabaseClient<Database>;
  let userBClient: SupabaseClient<Database>;
  let userAId: string;
  const userACreatedIds: string[] = [];

  beforeAll(async () => {
    const { url, anonKey } = getSupabaseCredentials();
    anonClient = createTestClient(url, anonKey);

    const userA = await signInTestUser(
      url,
      anonKey,
      'test@example.com',
      TEST_PASSWORD
    );
    userAClient = userA.client;
    userAId = userA.userId;

    const userB = await signInTestUser(
      url,
      anonKey,
      'other@example.com',
      TEST_PASSWORD
    );
    userBClient = userB.client;
  });

  afterEach(async () => {
    if (userACreatedIds.length > 0) {
      await userAClient
        .from('water_entries')
        .delete()
        .in('id', userACreatedIds);
      userACreatedIds.length = 0;
    }
  });

  afterAll(async () => {
    await userAClient?.auth.signOut({ scope: 'local' });
    await userBClient?.auth.signOut({ scope: 'local' });
  });

  it('prevents User B and anonymous callers from selecting, inserting, updating, or deleting User A water rows', async () => {
    const entryId = crypto.randomUUID();
    userACreatedIds.push(entryId);

    const { error: insertError } = await userAClient
      .from('water_entries')
      .insert({
        id: entryId,
        amount_ml: 250,
        local_date: '2026-11-20',
      });
    expect(insertError).toBeNull();

    const { data: anonRead, error: anonReadError } = await anonClient
      .from('water_entries')
      .select('*')
      .eq('id', entryId);
    expect(anonReadError).toBeNull();
    expect(anonRead).toEqual([]);

    const { error: anonInsertError } = await anonClient
      .from('water_entries')
      .insert({
        id: crypto.randomUUID(),
        amount_ml: 250,
        local_date: '2026-11-20',
      });
    expect(anonInsertError).not.toBeNull();

    const { data: anonUpdate } = await anonClient
      .from('water_entries')
      .update({ amount_ml: 500 })
      .eq('id', entryId)
      .select();
    expect(anonUpdate).toEqual([]);

    const { data: anonDelete } = await anonClient
      .from('water_entries')
      .delete()
      .eq('id', entryId)
      .select();
    expect(anonDelete).toEqual([]);

    const { data: userBRead, error: userBReadError } = await userBClient
      .from('water_entries')
      .select('*')
      .eq('id', entryId);
    expect(userBReadError).toBeNull();
    expect(userBRead).toEqual([]);

    const { error: userBSpoofInsertError } = await userBClient
      .from('water_entries')
      .insert({
        id: crypto.randomUUID(),
        user_id: userAId,
        amount_ml: 250,
        local_date: '2026-11-20',
      });
    expect(userBSpoofInsertError).not.toBeNull();

    const { data: userBUpdate } = await userBClient
      .from('water_entries')
      .update({ amount_ml: 500 })
      .eq('id', entryId)
      .select();
    expect(userBUpdate).toEqual([]);

    const { data: userBDelete } = await userBClient
      .from('water_entries')
      .delete()
      .eq('id', entryId)
      .select();
    expect(userBDelete).toEqual([]);

    const { data: userARead, error: userAReadError } = await userAClient
      .from('water_entries')
      .select('id, amount_ml, local_date')
      .eq('id', entryId)
      .single();
    expect(userAReadError).toBeNull();
    expect(userARead).toEqual({
      id: entryId,
      amount_ml: 250,
      local_date: '2026-11-20',
    });
  });

  it('returns the existing row and creates no duplicate when inserting with a reused operation id', async () => {
    const opId = crypto.randomUUID();
    userACreatedIds.push(opId);

    const first = await addWaterEntry(
      { id: opId, amountMl: 250, localDate: '2026-11-20' },
      userAClient
    );
    expect(first).toEqual({
      id: opId,
      amountMl: 250,
      localDate: '2026-11-20',
    });

    const retried = await addWaterEntry(
      { id: opId, amountMl: 400, localDate: '2026-11-20' },
      userAClient
    );
    expect(retried).toEqual({
      id: opId,
      amountMl: 250,
      localDate: '2026-11-20',
    });

    const { data: rows, error } = await userAClient
      .from('water_entries')
      .select('id, amount_ml, local_date')
      .eq('id', opId);
    expect(error).toBeNull();
    expect(rows).toEqual([
      { id: opId, amount_ml: 250, local_date: '2026-11-20' },
    ]);
  });

  it('requires explicit local_date and never derives it from logged_at', async () => {
    const { error: missingDateError } = await userAClient
      .from('water_entries')
      .insert({
        id: crypto.randomUUID(),
        amount_ml: 200,
      } as never);
    expect(missingDateError).not.toBeNull();

    const entryId = crypto.randomUUID();
    userACreatedIds.push(entryId);

    const { error: insertError } = await userAClient
      .from('water_entries')
      .insert({
        id: entryId,
        amount_ml: 200,
        local_date: '2026-11-19',
        logged_at: '2026-11-20T23:30:00Z',
      });
    expect(insertError).toBeNull();

    const { data: readRow, error: readError } = await userAClient
      .from('water_entries')
      .select('id, amount_ml, local_date')
      .eq('id', entryId)
      .single();
    expect(readError).toBeNull();
    expect(readRow).toEqual({
      id: entryId,
      amount_ml: 200,
      local_date: '2026-11-19',
    });
  });

  it('does not let the owner change a logged water amount', async () => {
    const entryId = crypto.randomUUID();
    userACreatedIds.push(entryId);

    const { error: insertError } = await userAClient
      .from('water_entries')
      .insert({
        id: entryId,
        amount_ml: 250,
        local_date: '2026-11-20',
      });
    expect(insertError).toBeNull();

    const { data: ownerUpdate, error: ownerUpdateError } = await userAClient
      .from('water_entries')
      .update({ amount_ml: 500 })
      .eq('id', entryId)
      .select('id, amount_ml, local_date');
    expect(ownerUpdateError).toBeNull();
    expect(ownerUpdate).toEqual([]);

    const { data: unchanged, error: readError } = await userAClient
      .from('water_entries')
      .select('id, amount_ml, local_date')
      .eq('id', entryId)
      .single();
    expect(readError).toBeNull();
    expect(unchanged).toEqual({
      id: entryId,
      amount_ml: 250,
      local_date: '2026-11-20',
    });
  });

  it('rejects local_date values that are not calendar dates', async () => {
    for (const invalidDate of ['not-a-date', '2026-13-40', '']) {
      const { error } = await userAClient.from('water_entries').insert({
        id: crypto.randomUUID(),
        amount_ml: 250,
        local_date: invalidDate,
      });
      expect(error).not.toBeNull();
    }
  });

  it('rejects water amounts outside 1..5000 ml', async () => {
    for (const invalidAmount of [0, -100, 5001]) {
      const { error } = await userAClient.from('water_entries').insert({
        id: crypto.randomUUID(),
        amount_ml: invalidAmount,
        local_date: '2026-11-20',
      });
      expect(error).not.toBeNull();
    }

    for (const validAmount of [1, 5000]) {
      const validId = crypto.randomUUID();
      userACreatedIds.push(validId);
      const { error } = await userAClient.from('water_entries').insert({
        id: validId,
        amount_ml: validAmount,
        local_date: '2026-11-20',
      });
      expect(error).toBeNull();
    }
  });

  it('lists only the authenticated user entries for the requested local_date in logged_at order', async () => {
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const otherDayId = crypto.randomUUID();
    userACreatedIds.push(firstId, secondId, otherDayId);

    const { error: insertError } = await userAClient
      .from('water_entries')
      .insert([
        {
          id: secondId,
          amount_ml: 200,
          local_date: '2026-11-20',
          logged_at: '2026-11-20T09:00:00Z',
        },
        {
          id: firstId,
          amount_ml: 100,
          local_date: '2026-11-20',
          logged_at: '2026-11-20T08:00:00Z',
        },
        {
          id: otherDayId,
          amount_ml: 300,
          local_date: '2026-11-19',
          logged_at: '2026-11-19T12:00:00Z',
        },
      ]);
    expect(insertError).toBeNull();

    await expect(listWaterEntries('2026-11-20', userAClient)).resolves.toEqual([
      { id: firstId, amountMl: 100, localDate: '2026-11-20' },
      { id: secondId, amountMl: 200, localDate: '2026-11-20' },
    ]);
    await expect(listWaterEntries('2026-11-20', userBClient)).resolves.toEqual(
      []
    );
  });

  it('rejects cross-user id collision via addWaterEntry without overwriting User A row', async () => {
    const sharedId = crypto.randomUUID();
    userACreatedIds.push(sharedId);

    await addWaterEntry(
      { id: sharedId, amountMl: 250, localDate: '2026-11-20' },
      userAClient
    );

    await expect(
      addWaterEntry(
        { id: sharedId, amountMl: 400, localDate: '2026-11-20' },
        userBClient
      )
    ).rejects.toMatchObject({ message: expect.any(String) });

    await expect(listWaterEntries('2026-11-20', userAClient)).resolves.toEqual([
      { id: sharedId, amountMl: 250, localDate: '2026-11-20' },
    ]);
  });
});
