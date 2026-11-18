import { expect, test } from '@playwright/test';

test.describe('Sign-in page', () => {
  test('a signed-out visitor sees email, password, and submit', async ({
    page,
  }) => {
    await page.goto('/');

    const email = page.getByLabel('Email');
    const password = page.getByLabel('Password');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('type', 'email');
    await expect(password).toBeVisible();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel(/username/i)).toHaveCount(0);
  });

  test('email and password are required', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByLabel('Email')).toBeFocused();
    expect(
      await page
        .getByLabel('Email')
        .evaluate((el: HTMLInputElement) => el.validity.valueMissing)
    ).toBe(true);
    await expect(page).toHaveURL('/');

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByLabel('Password')).toBeFocused();
    expect(
      await page
        .getByLabel('Password')
        .evaluate((el: HTMLInputElement) => el.validity.valueMissing)
    ).toBe(true);

    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('secret');
    await page.getByRole('button', { name: 'Sign in' }).click();
    expect(
      await page
        .getByLabel('Email')
        .evaluate((el: HTMLInputElement) => el.validity.typeMismatch)
    ).toBe(true);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('a known account signs in and sees Today with their email', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('Arki-test-password-123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('test@example.com', { exact: true })
    ).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Today', exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('test@example.com', { exact: true })
    ).toBeVisible();
  });
});

test.describe('Sign-in page on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('fields and submit fit the screen and stay tappable', async ({
    page,
  }) => {
    await page.goto('/');

    const email = page.getByLabel('Email');
    const password = page.getByLabel('Password');
    const submit = page.getByRole('button', { name: 'Sign in' });

    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeVisible();

    const emailBox = await email.boundingBox();
    const submitBox = await submit.boundingBox();
    expect(emailBox).not.toBeNull();
    expect(submitBox).not.toBeNull();
    expect(emailBox!.x).toBeGreaterThanOrEqual(0);
    expect(emailBox!.width).toBeGreaterThan(200);
    expect(submitBox!.height).toBeGreaterThanOrEqual(44);
    expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(844);

    expect(await email.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      '16px'
    );

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
