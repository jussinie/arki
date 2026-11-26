import { expect, test } from '@playwright/test';

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'Arki-test-password-123!';

test.describe('Route guard for signed-out users (ARK-7)', () => {
  test("opening today's view while signed out redirects to /sign-in", async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
  });

  test('deep links bounce to /sign-in and return to the requested view after sign-in', async ({
    page,
  }) => {
    await page.goto('/days/2026-11-19?tab=water');

    await expect(page).toHaveURL(
      '/sign-in?redirect=%2Fdays%2F2026-11-19%3Ftab%3Dwater'
    );
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);

    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/days/2026-11-19?tab=water');
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
    await expect(page.getByText(TEST_EMAIL, { exact: true })).toBeVisible();
  });

  test('unsafe external redirect targets fall back to / after sign-in', async ({
    page,
  }) => {
    await page.goto('/sign-in?redirect=https%3A%2F%2Fevil.example%2Fphish');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
  });

  test('encoded protocol-relative redirect targets fall back to / after sign-in', async ({
    page,
  }) => {
    await page.goto('/sign-in?redirect=%2F%2Fevil.example%2Fphish');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
  });

  test('nested /sign-in/callback does not redirect-loop', async ({ page }) => {
    await page.goto('/sign-in/callback');

    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page).not.toHaveURL(/redirect=/);
    await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
  });

  test('signed-in users visiting /sign-in are redirected to /', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/sign-in');
    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
  });
});
