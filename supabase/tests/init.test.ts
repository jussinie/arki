import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/shared/supabase/database.types';
import {
  addWaterEntry,
  listWaterEntries,
  listWaterGoals,
  saveWaterGoal,
} from '../../src/features/water/api';
import { resolveWaterGoalMl } from '../../src/features/water/model';

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

describe('water_goals per-day rows, resolution, and RLS (ARK-49)', () => {
  const TEST_PASSWORD = 'Arki-test-password-123!';
  let anonClient: SupabaseClient<Database>;
  let userAClient: SupabaseClient<Database>;
  let userBClient: SupabaseClient<Database>;
  let userAId: string;
  let userBId: string;

  function goals(client: SupabaseClient<Database>) {
    return client.from('water_goals');
  }

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
    userBId = userB.userId;
  });

  afterEach(async () => {
    for (const client of [userAClient, userBClient]) {
      const { error } = await goals(client).delete().gte('goal_ml', 100);
      if (error && error.code !== 'PGRST205') {
        throw error;
      }
    }
  });

  afterAll(async () => {
    await userAClient?.auth.signOut({ scope: 'local' });
    await userBClient?.auth.signOut({ scope: 'local' });
  });

  it('stores a goal per day and keeps earlier days on their own goals after a later change', async () => {
    await saveWaterGoal(
      { localDate: '2026-11-19', goalMl: 2000, singleDay: false },
      userAId,
      userAClient
    );
    await saveWaterGoal(
      { localDate: '2026-11-26', goalMl: 2500, singleDay: false },
      userAId,
      userAClient
    );

    const rows = await listWaterGoals(userAClient);
    expect(rows).toEqual([
      { localDate: '2026-11-19', goalMl: 2000, singleDay: false },
      { localDate: '2026-11-26', goalMl: 2500, singleDay: false },
    ]);

    expect(resolveWaterGoalMl(rows, '2026-11-18')).toBeNull();
    expect(resolveWaterGoalMl(rows, '2026-11-19')).toBe(2000);
    expect(resolveWaterGoalMl(rows, '2026-11-25')).toBe(2000);
    expect(resolveWaterGoalMl(rows, '2026-11-26')).toBe(2500);
    expect(resolveWaterGoalMl(rows, '2026-12-01')).toBe(2500);
  });

  it('applies a goal set for a past date only to that date', async () => {
    await saveWaterGoal(
      { localDate: '2026-11-19', goalMl: 2000, singleDay: false },
      userAId,
      userAClient
    );
    await saveWaterGoal(
      { localDate: '2026-11-23', goalMl: 3000, singleDay: true },
      userAId,
      userAClient
    );

    const rows = await listWaterGoals(userAClient);
    expect(rows).toEqual([
      { localDate: '2026-11-19', goalMl: 2000, singleDay: false },
      { localDate: '2026-11-23', goalMl: 3000, singleDay: true },
    ]);

    expect(resolveWaterGoalMl(rows, '2026-11-22')).toBe(2000);
    expect(resolveWaterGoalMl(rows, '2026-11-23')).toBe(3000);
    expect(resolveWaterGoalMl(rows, '2026-11-24')).toBe(2000);
  });

  it('keeps a single-day exception beside a change point on the same date', async () => {
    await saveWaterGoal(
      { localDate: '2026-11-20', goalMl: 2000, singleDay: false },
      userAId,
      userAClient
    );
    await saveWaterGoal(
      { localDate: '2026-11-20', goalMl: 1500, singleDay: true },
      userAId,
      userAClient
    );

    const rows = await listWaterGoals(userAClient);
    expect(rows).toHaveLength(2);
    expect(resolveWaterGoalMl(rows, '2026-11-20')).toBe(1500);
    expect(resolveWaterGoalMl(rows, '2026-11-21')).toBe(2000);
  });

  it('replaces the row for the same date and kind without duplicating', async () => {
    await saveWaterGoal(
      { localDate: '2026-11-26', goalMl: 2000, singleDay: false },
      userAId,
      userAClient
    );
    await saveWaterGoal(
      { localDate: '2026-11-26', goalMl: 2500, singleDay: false },
      userAId,
      userAClient
    );

    await expect(listWaterGoals(userAClient)).resolves.toEqual([
      { localDate: '2026-11-26', goalMl: 2500, singleDay: false },
    ]);
  });

  it('rejects goals outside 100..10000 ml', async () => {
    for (const invalid of [0, 99, 10001, -1]) {
      const { error } = await goals(userAClient).insert({
        local_date: '2026-11-26',
        goal_ml: invalid,
        single_day: false,
      });
      expect(error).not.toBeNull();
    }

    const validGoals: Array<{ local_date: string; goal_ml: number }> = [
      { local_date: '2026-11-26', goal_ml: 100 },
      { local_date: '2026-11-27', goal_ml: 10000 },
    ];
    for (const valid of validGoals) {
      const { error } = await goals(userAClient).insert({
        local_date: valid.local_date,
        goal_ml: valid.goal_ml,
        single_day: false,
      });
      expect(error).toBeNull();
    }
  });

  it('requires a valid local_date on every goal row', async () => {
    const { error: missingDateError } = await goals(userAClient).insert({
      goal_ml: 2000,
      single_day: false,
    } as never);
    expect(missingDateError).not.toBeNull();

    for (const invalidDate of ['not-a-date', '2026-13-40', '']) {
      const { error } = await goals(userAClient).insert({
        local_date: invalidDate,
        goal_ml: 2000,
        single_day: false,
      });
      expect(error).not.toBeNull();
    }
  });

  it('prevents anonymous callers and User B from reading or changing User A goals', async () => {
    const { error: insertError } = await goals(userAClient).insert({
      local_date: '2026-11-20',
      goal_ml: 2200,
      single_day: false,
    });
    expect(insertError).toBeNull();

    const { data: ownerRows, error: ownerError } = await goals(userAClient)
      .select('local_date, goal_ml, single_day')
      .order('local_date');
    expect(ownerError).toBeNull();
    expect(ownerRows).toEqual([
      { local_date: '2026-11-20', goal_ml: 2200, single_day: false },
    ]);

    const { data: anonRead, error: anonReadError } =
      await goals(anonClient).select('*');
    expect(anonReadError).toBeNull();
    expect(anonRead).toEqual([]);

    const { error: anonInsertError } = await goals(anonClient).insert({
      local_date: '2026-11-21',
      goal_ml: 2000,
      single_day: false,
    });
    expect(anonInsertError).not.toBeNull();

    const { data: anonUpdate } = await goals(anonClient)
      .update({ goal_ml: 3000 })
      .eq('local_date', '2026-11-20')
      .select();
    expect(anonUpdate).toEqual([]);

    const { data: anonDelete } = await goals(anonClient)
      .delete()
      .eq('local_date', '2026-11-20')
      .select();
    expect(anonDelete).toEqual([]);

    const { data: userBRead, error: userBReadError } = await goals(userBClient)
      .select('*')
      .eq('user_id', userAId);
    expect(userBReadError).toBeNull();
    expect(userBRead).toEqual([]);

    const { error: spoofInsertError } = await goals(userBClient).insert({
      user_id: userAId,
      local_date: '2026-11-22',
      goal_ml: 3000,
      single_day: false,
    });
    expect(spoofInsertError).not.toBeNull();

    const { error: spoofUpsertError } = await goals(userBClient).upsert(
      {
        user_id: userAId,
        local_date: '2026-11-22',
        goal_ml: 3000,
        single_day: false,
      },
      { onConflict: 'user_id,local_date,single_day' }
    );
    expect(spoofUpsertError).not.toBeNull();

    const { data: userBUpdate } = await goals(userBClient)
      .update({ goal_ml: 3000 })
      .eq('local_date', '2026-11-20')
      .select();
    expect(userBUpdate).toEqual([]);

    const { data: userBDelete } = await goals(userBClient)
      .delete()
      .eq('local_date', '2026-11-20')
      .select();
    expect(userBDelete).toEqual([]);

    const { data: stillOwner, error: stillOwnerError } = await goals(
      userAClient
    )
      .select('local_date, goal_ml, single_day')
      .order('local_date');
    expect(stillOwnerError).toBeNull();
    expect(stillOwner).toEqual([
      { local_date: '2026-11-20', goal_ml: 2200, single_day: false },
    ]);

    const { error: userBOwnGoalError } = await goals(userBClient).insert({
      local_date: '2026-11-20',
      goal_ml: 3000,
      single_day: true,
    });
    expect(userBOwnGoalError).toBeNull();

    const { data: userBOwn, error: userBOwnError } = await goals(userBClient)
      .select('local_date, goal_ml, single_day')
      .order('local_date');
    expect(userBOwnError).toBeNull();
    expect(userBOwn).toEqual([
      { local_date: '2026-11-20', goal_ml: 3000, single_day: true },
    ]);
  });

  it('rejects reassignment of User A goal rows to User B', async () => {
    const { error: insertError } = await goals(userAClient).insert({
      local_date: '2026-11-20',
      goal_ml: 2200,
      single_day: false,
    });
    expect(insertError).toBeNull();

    const { data: reassigned, error: reassignError } = await goals(userAClient)
      .update({ user_id: userBId })
      .eq('local_date', '2026-11-20')
      .select('user_id, local_date, goal_ml');
    expect(reassignError !== null || reassigned?.length === 0).toBe(true);

    const { data: ownerRows, error: ownerError } = await goals(userAClient)
      .select('local_date, goal_ml, single_day')
      .order('local_date');
    expect(ownerError).toBeNull();
    expect(ownerRows).toEqual([
      { local_date: '2026-11-20', goal_ml: 2200, single_day: false },
    ]);

    const { data: userBRead, error: userBReadError } = await goals(userBClient)
      .select('*')
      .eq('user_id', userAId);
    expect(userBReadError).toBeNull();
    expect(userBRead).toEqual([]);
  });
});
