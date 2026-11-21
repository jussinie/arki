import { expect, test, type Page } from '@playwright/test';

const STORY_DAY = '2026-11-20';

function storyInstant(): Date {
  const now = Date.now();
  const start = Date.parse(`${STORY_DAY}T00:00:00Z`);
  const end = Date.parse(`${STORY_DAY}T23:59:59Z`);
  if (now >= start && now <= end) {
    return new Date(now);
  }
  // Noon on the story day stays behind a later server clock, so the auth
  // token's real expiry still looks valid to the frozen page (jwt_expiry).
  return new Date(`${STORY_DAY}T12:00:00Z`);
}

async function signIn(page: Page) {
  await page.clock.setFixedTime(storyInstant());
  await page.goto('/');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('Arki-test-password-123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Today', exact: true })
  ).toBeVisible();
}

test.describe('Add water to today', () => {
  test.use({ timezoneId: 'UTC' });

  test('adding 2 dl shows 200 ml for 2026-11-20 until reload', async ({
    page,
  }) => {
    await signIn(page);

    await expect(page.getByText(STORY_DAY, { exact: true })).toBeVisible();
    await expect(page.getByText('0 ml', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /250|2[,.]5/ })).toHaveCount(
      0
    );

    await page.getByRole('button', { name: '2 dl', exact: true }).click();
    await expect(page.getByText('200 ml', { exact: true })).toBeVisible();
    await expect(page.getByText('0 ml', { exact: true })).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
    await expect(page.getByText('0 ml', { exact: true })).toBeVisible();
    await expect(page.getByText('200 ml', { exact: true })).toHaveCount(0);
  });

  test('1, 2, 3, and 4 dl add 100, 200, 300, and 400 ml until reload', async ({
    page,
  }) => {
    await signIn(page);

    await expect(
      page.getByRole('button', { name: '1 dl', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '2 dl', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '3 dl', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '4 dl', exact: true })
    ).toBeVisible();
    await expect(page.getByText('0 ml', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '1 dl', exact: true }).click();
    await expect(page.getByText('100 ml', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '2 dl', exact: true }).click();
    await expect(page.getByText('300 ml', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '3 dl', exact: true }).click();
    await expect(page.getByText('600 ml', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '4 dl', exact: true }).click();
    await expect(page.getByText('1000 ml', { exact: true })).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
    await expect(page.getByText('0 ml', { exact: true })).toBeVisible();
    await expect(page.getByText('1000 ml', { exact: true })).toHaveCount(0);
  });
});

test.describe('Add water on a phone', () => {
  test.use({ timezoneId: 'UTC', viewport: { width: 390, height: 844 } });

  test('the add button fits and stays tappable', async ({ page }) => {
    await signIn(page);

    const add = page.getByRole('button', { name: '2 dl', exact: true });
    await expect(add).toBeVisible();
    const box = await add.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    await add.click();
    await expect(page.getByText('200 ml', { exact: true })).toBeVisible();
  });

  test('the decilitre buttons fit and stay tappable', async ({ page }) => {
    await signIn(page);

    for (const name of ['1 dl', '2 dl', '3 dl', '4 dl']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
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

    await page.getByRole('button', { name: '2 dl', exact: true }).click();
    await expect(page.getByText('200 ml', { exact: true })).toBeVisible();
  });
});
