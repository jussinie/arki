import { expect, test, type Locator, type Page } from '@playwright/test';

const TODAY = '2026-11-20';

async function expectPhoneControl(control: Locator) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(
    await control.evaluate((element) => getComputedStyle(element).fontSize)
  ).toBe('16px');
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true);
}

for (const phone of [false, true]) {
  test.describe(
    phone ? 'Day navigation on phone' : 'Day navigation on desktop',
    () => {
      test.use({
        timezoneId: 'UTC',
        ...(phone ? { viewport: { width: 390, height: 844 } } : {}),
      });

      test('arrows, calendar selection, and Today load the selected water day', async ({
        page,
      }) => {
        const requestedDays: string[] = [];
        // Only the external water-read boundary is substituted. Distinct synthetic
        // totals prove the actual feature hook requests and renders each local_date.
        await page.route('**/rest/v1/water_entries?*', async (route) => {
          expect(route.request().method()).toBe('GET');
          const dateFilter = new URL(route.request().url()).searchParams.get(
            'local_date'
          );
          expect(dateFilter).toMatch(/^eq\.\d{4}-\d{2}-\d{2}$/);
          const day = dateFilter!.slice(3);
          requestedDays.push(day);
          await route.fulfill({
            json: [
              {
                id: '00000000-0000-4000-8000-000000000035',
                amount_ml: day === '2026-11-15' ? 350 : 200,
                local_date: day,
              },
            ],
          });
        });
        await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00Z`));
        await page.goto('/');
        await page.getByLabel('Email').fill('test@example.com');
        await page.getByLabel('Password').fill('Arki-test-password-123!');
        await page
          .getByRole('button', { name: 'Sign in', exact: true })
          .click();

        await expect(
          page.getByRole('heading', { level: 2, name: 'Today', exact: true })
        ).toBeVisible();
        const picker = page.getByLabel('Choose date');
        const previous = page.getByRole('button', { name: 'Previous day' });
        const next = page.getByRole('button', { name: 'Next day' });
        await expect(picker).toHaveAttribute('type', 'date');
        await expect(picker).toHaveValue(TODAY);
        await expect(page.getByText(TODAY, { exact: true })).toHaveCount(0);
        await expect(page.getByText('0.2 L', { exact: true })).toBeVisible();

        if (phone) {
          for (const control of [previous, next, picker]) {
            await expectPhoneControl(control);
          }
          await expectNoOverflow(page);
        }

        await previous.click();
        await expect(picker).toHaveValue('2026-11-19');
        const today = page.getByRole('button', { name: 'Today', exact: true });
        await expect(today).toBeVisible();
        if (phone) {
          for (const control of [previous, next, picker, today]) {
            await expectPhoneControl(control);
          }
          await expectNoOverflow(page);
        }

        await next.click();
        await next.click();
        await expect(picker).toHaveValue('2026-11-21');
        await expect(page.getByText('2026-11-21', { exact: true })).toHaveCount(
          0
        );

        await picker.fill('2026-11-15');
        await expect(picker).toHaveValue('2026-11-15');
        await expect(page.getByText('0.35 L', { exact: true })).toBeVisible();
        await expect(page.getByText("Day's water total")).toHaveCount(0);
        expect(requestedDays).toContain('2026-11-15');

        await today.click();
        await expect(picker).toHaveValue(TODAY);
        await expect(
          page.getByRole('heading', { level: 2, name: 'Today', exact: true })
        ).toBeVisible();
        await expect(page.getByText('0.2 L', { exact: true })).toBeVisible();
        await expect(today).toHaveCount(0);
        if (phone) await expectNoOverflow(page);
      });
    }
  );
}
