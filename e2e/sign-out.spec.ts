import { expect, test, type Page } from '@playwright/test';

const email = 'test@example.com';
const password = 'Arki-test-password-123!';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Today', exact: true })
  ).toBeVisible();
}

test("a signed-in user can sign out from today's view", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
});

test.describe('Sign out on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the sign-out control fits and still leaves today', async ({ page }) => {
    await signIn(page);

    const signOut = page.getByRole('button', { name: 'Sign out' });
    await expect(signOut).toBeVisible();

    const box = await signOut.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    await signOut.click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
  });
});
