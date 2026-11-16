import { test, expect } from '@playwright/test';

test.describe('App Smoke Test', () => {
  test('renders the application heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Arki' })).toBeVisible();
  });
});
