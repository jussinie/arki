import { expect, test, type Locator, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import type { Database } from '../src/shared/supabase/database.types';

const DAY_ONE = '2026-11-20';
const DAY_TWO = '2026-11-19';
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

async function clearGoalUserData(): Promise<void> {
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

  const { error: deleteWaterError } = await client
    .from('water_entries')
    .delete()
    .in('local_date', [DAY_ONE, DAY_TWO]);
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

function dayTotal(page: Page, amount: string) {
  return page.locator('.water__total').getByText(amount, { exact: true });
}

function goalBar(page: Page): Locator {
  return page.getByRole('progressbar', { name: 'Daily water goal' });
}

test.describe('Daily water goal', () => {
  test.use({ timezoneId: 'UTC' });

  test('shows a 2 L goal on an empty bar whose track and fill differ', async ({
    page,
  }) => {
    await signIn(page, DAY_ONE);

    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('2');
    const bar = goalBar(page);
    await expect(bar).toHaveAttribute('aria-valuemax', '2000');
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await expect(dayTotal(page, '0 ml')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Goal reached' })).toHaveCount(
      0
    );

    const colors = await bar.evaluate((element) => {
      const fill = element.querySelector('.water__bar-fill');
      return {
        track: getComputedStyle(element).backgroundColor,
        fill: fill ? getComputedStyle(fill).backgroundColor : '',
      };
    });
    expect(colors.track).not.toBe(colors.fill);
    expect(colors.track).not.toBe('rgba(0, 0, 0, 0)');
    expect(colors.fill).not.toBe('rgba(0, 0, 0, 0)');
    expect(colors.fill).not.toBe('');
  });

  test('caps the bar at the goal, keeps the full amount, and uses that goal on another day', async ({
    page,
  }) => {
    await signIn(page, DAY_ONE);

    await page.getByLabel('Daily water goal (L)').fill('0.2');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(goalBar(page)).toHaveAttribute('aria-valuemax', '200');

    await page.getByRole('button', { name: '2 dl', exact: true }).click();
    await expect(dayTotal(page, '200 ml')).toBeVisible();
    const check = page.getByRole('img', { name: 'Goal reached' });
    await expect(check).toBeVisible();
    await expect(goalBar(page)).toHaveAttribute('aria-valuenow', '200');

    const checkColor = await check.evaluate(
      (element) => getComputedStyle(element).color
    );
    const channels = checkColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    expect(channels).not.toBeNull();
    const red = Number(channels![1]);
    const green = Number(channels![2]);
    const blue = Number(channels![3]);
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);

    const barBox = await goalBar(page).boundingBox();
    const checkBox = await check.boundingBox();
    expect(barBox).not.toBeNull();
    expect(checkBox).not.toBeNull();
    expect(checkBox!.x).toBeGreaterThanOrEqual(barBox!.x + barBox!.width - 1);

    await page.getByRole('button', { name: '1 dl', exact: true }).click();
    await expect(dayTotal(page, '300 ml')).toBeVisible();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('0.2');
    await expect(goalBar(page)).toHaveAttribute('aria-valuemax', '200');
    await expect(goalBar(page)).toHaveAttribute('aria-valuenow', '200');
    await expect(check).toBeVisible();

    const widths = await goalBar(page).evaluate((element) => {
      const fill = element.querySelector('.water__bar-fill');
      const barRect = element.getBoundingClientRect();
      const fillRect = fill?.getBoundingClientRect();
      return {
        bar: barRect.width,
        fill: fillRect?.width ?? Number.POSITIVE_INFINITY,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    });
    expect(widths.fill).toBeLessThanOrEqual(widths.bar + 1);
    expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);

    await page.clock.setFixedTime(new Date(`${DAY_TWO}T12:00:00Z`));
    await page.reload();
    await expect(page.getByText(DAY_TWO, { exact: true })).toBeVisible();
    await expect(dayTotal(page, '0 ml')).toBeVisible();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('0.2');
    await expect(page.getByRole('img', { name: 'Goal reached' })).toHaveCount(
      0
    );

    await page.getByRole('button', { name: '1 dl', exact: true }).click();
    await expect(dayTotal(page, '100 ml')).toBeVisible();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('0.2');
    await expect(page.getByRole('img', { name: 'Goal reached' })).toHaveCount(
      0
    );

    await page.clock.setFixedTime(new Date(`${DAY_ONE}T12:00:00Z`));
    await page.reload();
    await expect(page.getByText(DAY_ONE, { exact: true })).toBeVisible();
    await expect(dayTotal(page, '300 ml')).toBeVisible();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('0.2');
    await expect(page.getByRole('img', { name: 'Goal reached' })).toBeVisible();
  });

  test('rejects a goal outside 0.1 L to 10 L', async ({ page }) => {
    await signIn(page, DAY_ONE);

    await page.getByLabel('Daily water goal (L)').fill('0');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Enter a goal between 0.1 and 10 L'
    );
    await expect(goalBar(page)).toHaveAttribute('aria-valuemax', '2000');

    await page.reload();
    await expect(page.getByLabel('Daily water goal (L)')).toHaveValue('2');
    await expect(goalBar(page)).toHaveAttribute('aria-valuemax', '2000');
  });
});

test.describe('Daily water goal on a phone', () => {
  test.use({ timezoneId: 'UTC', viewport: { width: 390, height: 844 } });

  test('the goal field, save button, and bar fit and stay tappable', async ({
    page,
  }) => {
    await signIn(page, DAY_ONE);

    const goal = page.getByLabel('Daily water goal (L)');
    const save = page.getByRole('button', { name: 'Save goal' });
    const bar = goalBar(page);
    await expect(goal).toBeVisible();
    await expect(save).toBeVisible();
    await expect(bar).toBeVisible();

    for (const locator of [goal, save]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }

    const barBox = await bar.boundingBox();
    expect(barBox).not.toBeNull();
    expect(barBox!.x).toBeGreaterThanOrEqual(0);
    expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(390);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
