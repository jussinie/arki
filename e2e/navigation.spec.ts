import { expect, test, type Page } from '@playwright/test';

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'Arki-test-password-123!';

async function signIn(page: Page) {
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('Bottom tab navigation (ARK-46)', () => {
  test('shows Water, Food, and Settings tabs with Water current after sign-in', async ({
    page,
  }) => {
    await page.goto('/');
    await signIn(page);

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Water' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(nav.getByRole('link', { name: 'Food' })).not.toHaveAttribute(
      'aria-current'
    );
    await expect(
      nav.getByRole('link', { name: 'Settings' })
    ).not.toHaveAttribute('aria-current');
  });

  test('switches between the Food and Settings stubs and back to Water', async ({
    page,
  }) => {
    await page.goto('/');
    await signIn(page);
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();

    await page.getByRole('link', { name: 'Food' }).click();
    await expect(page).toHaveURL('/food');
    await expect(
      page.getByRole('heading', { name: 'Food', exact: true })
    ).toBeVisible();
    await expect(page.getByText('Work in progress')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toHaveCount(0);

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL('/settings');
    await expect(
      page.getByRole('heading', { name: 'Settings', exact: true })
    ).toBeVisible();

    await page.getByRole('link', { name: 'Water' }).click();
    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
  });

  test('returns to the previous tab with the browser back button', async ({
    page,
  }) => {
    await page.goto('/');
    await signIn(page);
    await page.getByRole('link', { name: 'Food' }).click();
    await expect(page).toHaveURL('/food');
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL('/settings');

    await page.goBack();
    await expect(page).toHaveURL('/food');
    await expect(
      page.getByRole('heading', { name: 'Food', exact: true })
    ).toBeVisible();
  });

  test('deep links to /food bounce to sign-in and return after signing in', async ({
    page,
  }) => {
    await page.goto('/food');

    await expect(page).toHaveURL('/sign-in?redirect=%2Ffood');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(
      0
    );

    await signIn(page);

    await expect(page).toHaveURL('/food');
    await expect(
      page.getByRole('heading', { name: 'Food', exact: true })
    ).toBeVisible();
    await expect(page.getByText('Work in progress')).toBeVisible();
  });

  test('centers the app column and pins the tab bar to the viewport bottom', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await signIn(page);

    const nav = page.getByRole('navigation', { name: 'Primary' });
    const box = await nav.boundingBox();
    if (box === null) {
      throw new Error('The tab bar has no bounding box.');
    }

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
    }));

    // The app is a 24rem (384px) column, centered on the page.
    expect(box.width).toBeCloseTo(384, 0);
    expect(box.x).toBeCloseTo((layout.clientWidth - 384) / 2, 0);
    // The tab bar hugs the bottom of the viewport.
    expect(box.y + box.height).toBeCloseTo(layout.clientHeight, 0);
  });
});
