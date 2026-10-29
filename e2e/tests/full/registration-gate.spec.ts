import { devices, type Browser, type Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

const { defaultBrowserType: _ignored, ...PIXEL_7 } = devices['Pixel 7'];

async function stranger(browser: Browser, run: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext(PIXEL_7);
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/** D222–D224 (029, `@full`; its UI links ship with 030). Writes a waitlist row: local stack only. */
test.describe('registration gate @full', () => {
  test('an unknown address gets the shared "check your inbox" message', async ({ browser }) => {
    await stranger(browser, async (page) => {
      await page.goto(webUrl('/sign-in'));
      await page.getByLabel(/email/i).fill(`gate-${Date.now().toString(36)}@example.test`);
      await page.getByRole('button', { name: /sign-in link/i }).click();
      await expect(page.getByRole('status')).toContainText('Check your inbox');
    });
  });

  test('the closed error offers the waitlist and a new link', async ({ browser }) => {
    await stranger(browser, async (page) => {
      await page.goto(webUrl('/auth/error?reason=closed'));
      await expect(
        page.getByRole('heading', { name: 'Gobbit is invite-only for now' }),
      ).toBeVisible();

      await page.getByRole('link', { name: 'Join the waitlist' }).click();
      await expect(page).toHaveURL(/\/welcome$/);
      await expect(page.locator('form.join')).toBeVisible();

      await page.goto(webUrl('/auth/error?reason=closed'));
      await page.getByRole('link', { name: 'Get a new link' }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
    });
  });

  test('sign-in links to the waitlist', async ({ browser }) => {
    await stranger(browser, async (page) => {
      await page.goto(webUrl('/sign-in'));
      await page.getByRole('link', { name: 'Join the waitlist' }).click();
      await expect(page).toHaveURL(/\/welcome$/);
    });
  });
});
