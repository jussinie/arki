import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import type { Database } from '../src/shared/supabase/database.types';

const TODAY = '2026-11-20';
// 2026-11-19 and 2026-11-20 are cleared by the other water suites while e2e
// runs in parallel, so this scenario opens an otherwise unused local_date.
const STORY_DAY = '2026-11-18';
const OTHER_DAY = '2026-11-17';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'Arki-test-password-123!';

test.describe.configure({ mode: 'serial' });

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function getSupabaseCredentials(): { url: string; anonKey: string } {
  const envUrl = process.env.VITE_SUPABASE_URL;
  const envAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (envUrl && envAnonKey) {
    return { url: envUrl, anonKey: envAnonKey };
  }

  const output = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  const jsonText = extractJsonObject(output);
  if (!jsonText) {
    throw new Error('Could not parse JSON from `npx supabase status -o json`');
  }
  const parsed = JSON.parse(jsonText) as {
    API_URL?: string;
    ANON_KEY?: string;
  };
  if (!parsed.API_URL || !parsed.ANON_KEY) {
    throw new Error('Missing API_URL or ANON_KEY in `supabase status` output');
  }
  return { url: parsed.API_URL, anonKey: parsed.ANON_KEY };
}

async function clearStoryDays(): Promise<void> {
  const { url, anonKey } = getSupabaseCredentials();
  const client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInError) {
    throw signInError;
  }

  const { error: deleteError } = await client
    .from('water_entries')
    .delete()
    .in('local_date', [STORY_DAY, OTHER_DAY]);
  if (deleteError) {
    throw deleteError;
  }
}

async function seedStoryDay(): Promise<void> {
  const { url, anonKey } = getSupabaseCredentials();
  const client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInError) {
    throw signInError;
  }

  const { error: insertError } = await client.from('water_entries').insert([
    {
      id: crypto.randomUUID(),
      amount_ml: 500,
      local_date: STORY_DAY,
      logged_at: '2026-11-19T00:30:00Z',
    },
    {
      id: crypto.randomUUID(),
      amount_ml: 200,
      local_date: STORY_DAY,
      logged_at: '2026-11-17T23:30:00Z',
    },
    {
      id: crypto.randomUUID(),
      amount_ml: 999,
      local_date: OTHER_DAY,
      logged_at: '2026-11-18T12:00:00Z',
    },
  ]);
  if (insertError) {
    throw insertError;
  }
}

test.beforeEach(async () => {
  await clearStoryDays();
  await seedStoryDay();
});

test.afterAll(async () => {
  await clearStoryDays();
});

async function signIn(page: Page) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00Z`));
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Today', exact: true })
  ).toBeVisible();
}

test.describe('See the day water entries', () => {
  test.use({ timezoneId: 'UTC' });

  test('opening a day shows each entry and the local_date total', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByLabel('Choose date').fill(STORY_DAY);

    await expect(page.getByLabel('Choose date')).toHaveValue(STORY_DAY);
    const list = page.getByRole('list', { name: 'Water entries' });
    await expect(list.getByRole('listitem')).toHaveText(['200 ml', '500 ml']);
    const orb = page.getByRole('progressbar', { name: 'Daily water goal' });
    await expect(orb).toHaveAttribute('aria-valuetext', /^700 ml of /);
    await expect(page.getByText('0.7 L', { exact: true })).toBeVisible();
    await expect(page.getByText('999 ml', { exact: true })).toHaveCount(0);
    await expect(list).not.toContainText('999');

    await page.getByRole('button', { name: '1 dl', exact: true }).click();
    await expect(orb).toHaveAttribute('aria-valuetext', /^800 ml of /);
    await expect(page.getByText('0.8 L', { exact: true })).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveText([
      '200 ml',
      '500 ml',
      '100 ml',
    ]);
  });

  test('switching days replaces the entry list and total', async ({ page }) => {
    await signIn(page);
    await page.getByLabel('Choose date').fill(STORY_DAY);
    const list = page.getByRole('list', { name: 'Water entries' });
    await expect(list.getByRole('listitem')).toHaveText(['200 ml', '500 ml']);

    await page.getByLabel('Choose date').fill(OTHER_DAY);
    await expect(page.getByLabel('Choose date')).toHaveValue(OTHER_DAY);
    const otherList = page.getByRole('list', { name: 'Water entries' });
    await expect(otherList.getByRole('listitem')).toHaveText(['999 ml']);
    await expect(
      page.getByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuetext', /^999 ml of /);
    await expect(page.getByText('200 ml', { exact: true })).toHaveCount(0);
    await expect(page.getByText('500 ml', { exact: true })).toHaveCount(0);
  });
});

test.describe('See the day water entries on a phone', () => {
  test.use({ timezoneId: 'UTC', viewport: { width: 390, height: 844 } });

  test('the entry list fits the phone width', async ({ page }) => {
    await signIn(page);
    await page.getByLabel('Choose date').fill(STORY_DAY);

    const list = page.getByRole('list', { name: 'Water entries' });
    await expect(list.getByRole('listitem')).toHaveText(['200 ml', '500 ml']);
    await expect(
      page.getByRole('progressbar', { name: 'Daily water goal' })
    ).toHaveAttribute('aria-valuetext', /^700 ml of /);
    await expect(page.getByText('0.7 L', { exact: true })).toBeVisible();

    for (const item of await list.getByRole('listitem').all()) {
      const box = await item.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
