import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import type { Database } from '../src/shared/supabase/database.types';

const TODAY = '2026-11-20';
const TOMORROW = '2026-11-21';
const YESTERDAY = '2026-11-19';
const BEFORE_ANY_GOAL = '2026-11-18';
const TEST_EMAIL = 'other@example.com';
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

async function createTestClient() {
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
  return client;
}

async function clearGoalUserData(): Promise<void> {
  const client = await createTestClient();

  const { error: deleteWaterError } = await client
    .from('water_entries')
    .delete()
    .in('local_date', [TODAY, TOMORROW, YESTERDAY, BEFORE_ANY_GOAL]);
  if (deleteWaterError) {
    throw deleteWaterError;
  }

  const { error: deleteGoalError } = await client
    .from('water_goals')
    .delete()
    .gte('goal_ml', 100);
  if (deleteGoalError) {
    throw deleteGoalError;
  }
}

async function seedGoal(
  localDate: string,
  goalMl: number,
  singleDay: boolean
): Promise<void> {
  const client = await createTestClient();
  const { error } = await client.from('water_goals').insert({
    local_date: localDate,
    goal_ml: goalMl,
    single_day: singleDay,
  });
  if (error) {
    throw error;
  }
}

test.beforeEach(async () => {
  await clearGoalUserData();
});

test.afterAll(async () => {
  await clearGoalUserData();
});

async function signIn(page: Page, localDate: string) {
  await page.clock.setFixedTime(new Date(`${localDate}T12:00:00Z`));
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Today', exact: true })
  ).toBeVisible();
}

async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

function goalOrb(page: Page) {
  return page.getByRole('progressbar', { name: 'Daily water goal' });
}

test.describe('Water goal in Settings', () => {
  test.use({ timezoneId: 'UTC' });

  test('the Water page has no goal editing and shows an empty state until a goal is set', async ({
    page,
  }) => {
    await signIn(page, TODAY);

    await expect(page.getByText('0 ml', { exact: true })).toBeVisible();
    await expect(
      page.getByText('No water goal set. Set one in Settings.')
    ).toBeVisible();
    await expect(goalOrb(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save goal' })).toHaveCount(
      0
    );
    await expect(page.getByLabel('Daily water goal (L)')).toHaveCount(0);
  });

  test('a goal set for today in Settings applies from today onward', async ({
    page,
  }) => {
    await signIn(page, TODAY);
    await openSettings(page);

    await expect(page.getByLabel('Goal date')).toHaveValue(TODAY);
    await expect(
      page.getByText(
        'Applies every day from Fri, 20 Nov 2026 until you change it.'
      )
    ).toBeVisible();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('');

    await page.getByLabel('Daily water goal (L)').fill('2.5');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('2.5');

    await page.getByRole('link', { name: 'Water' }).click();
    await expect(goalOrb(page)).toHaveAttribute('aria-valuemax', '2500');
    await expect(goalOrb(page)).toHaveAttribute(
      'aria-valuetext',
      '0 ml of 2.5 L'
    );
    await expect(page.getByText('of 2.5 L · 0%')).toBeVisible();

    // The goal still applies on the next day.
    await page.clock.setFixedTime(new Date(`${TOMORROW}T12:00:00Z`));
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
    await expect(goalOrb(page)).toHaveAttribute('aria-valuemax', '2500');
  });

  test('changing the goal on a later day preserves earlier days', async ({
    page,
  }) => {
    await seedGoal(TODAY, 2500, false);
    await signIn(page, TOMORROW);
    await openSettings(page);

    await expect(page.getByLabel('Goal date')).toHaveValue(TOMORROW);
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('2.5');

    await page.getByLabel('Daily water goal (L)').fill('3');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('3');

    await page.getByRole('link', { name: 'Water' }).click();
    await expect(goalOrb(page)).toHaveAttribute('aria-valuemax', '3000');

    await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00Z`));
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
    await expect(goalOrb(page)).toHaveAttribute('aria-valuemax', '2500');
  });

  test('a goal added for a past date affects only that date', async ({
    page,
  }) => {
    await seedGoal(TODAY, 2500, false);
    await signIn(page, TODAY);
    await openSettings(page);

    await page.getByLabel('Goal date').fill(YESTERDAY);
    await expect(
      page.getByText('Applies only to Thu, 19 Nov 2026.')
    ).toBeVisible();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('');

    await page.getByLabel('Daily water goal (L)').fill('1');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('1');

    await page.getByRole('link', { name: 'Water' }).click();
    // Today keeps its own goal.
    await expect(goalOrb(page)).toHaveAttribute('aria-valuemax', '2500');

    // Yesterday has the single-day goal.
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect(goalOrb(page)).toHaveAttribute('aria-valuemax', '1000');

    // The day before any goal stays empty.
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect(
      page.getByText('No water goal set. Set one in Settings.')
    ).toBeVisible();
    await expect(goalOrb(page)).toHaveCount(0);

    // Back on yesterday the single-day goal applies again.
    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(goalOrb(page)).toHaveAttribute('aria-valuemax', '1000');
  });

  test('rejects a goal outside 0.1 L to 10 L without saving', async ({
    page,
  }) => {
    await signIn(page, TODAY);
    await openSettings(page);

    await page.getByLabel('Daily water goal (L)').fill('0');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Enter a goal between 0.1 and 10 L'
    );

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('');
  });
});

test.describe('Water goal in Settings on a phone', () => {
  test.use({ timezoneId: 'UTC', viewport: { width: 390, height: 844 } });

  test('the goal form fits and stays tappable', async ({ page }) => {
    await signIn(page, TODAY);
    await openSettings(page);

    const date = page.getByLabel('Goal date');
    const goal = page.getByLabel('Daily water goal (L)');
    const save = page.getByRole('button', { name: 'Save goal' });

    for (const locator of [date, goal, save]) {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
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
