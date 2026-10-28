import { devices, type Browser, type Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';
import { resolveE2eEnv } from '../../lib/env';

const { webBaseURL } = resolveE2eEnv();
const { defaultBrowserType: _ignored, ...PIXEL_7 } = devices['Pixel 7'];

const uniqueEmail = () =>
  `landing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** A visitor with no session cookie (the fixture's `page` carries the smoke session). */
async function stranger(browser: Browser, run: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext(PIXEL_7);
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/** D228 (030, `@full`): the no-JS form on a phone. Writes waitlist rows, so local stack only. */
test.describe('landing form @full', () => {
  test('a visitor joins and sees "check your email"', async ({ browser }) => {
    await stranger(browser, async (page) => {
      await page.goto(webUrl('/welcome'));
      await page.getByLabel('Email').fill(uniqueEmail());
      await page.getByRole('radio', { name: 'My family' }).check();
      await page.getByLabel(/anything you want us to know/i).fill('Our street');
      await page.getByRole('button', { name: 'Join the waitlist' }).click();
      await expect(page).toHaveURL(/\/welcome\/joined$/);
      await expect(page.getByRole('status')).toContainText('Check your email to confirm');
    });
  });

  test('an invalid email shows the message and keeps the note', async ({ browser }) => {
    await stranger(browser, async (page) => {
      await page.goto(webUrl('/welcome'));
      // Let the server, not the browser, judge the address.
      await page.locator('form.join').evaluate((form) => {
        (form as HTMLFormElement).noValidate = true;
      });
      await page.getByLabel('Email').fill('not-an-email');
      await page.getByRole('radio', { name: "A community I'm part of" }).check();
      await page.getByLabel(/anything you want us to know/i).fill('Building 4');
      await page.getByRole('button', { name: 'Join the waitlist' }).click();
      await expect(page.locator('#email-error')).toBeVisible();
      await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByLabel(/anything you want us to know/i)).toHaveValue('Building 4');
    });
  });

  test('a filled honeypot gets the same thanks page', async ({ browser }) => {
    await stranger(browser, async (page) => {
      await page.goto(webUrl('/welcome'));
      await page.getByLabel('Email').fill(uniqueEmail());
      await page.getByRole('radio', { name: 'Just me' }).check();
      await page.locator('input[name="website"]').fill('https://spam.example', { force: true });
      await page.getByRole('button', { name: 'Join the waitlist' }).click();
      await expect(page).toHaveURL(/\/welcome\/joined$/);
      await expect(page.getByRole('status')).toContainText('Check your email to confirm');
    });
  });
});

/** D227 (030, `@full`): signed-out visitors of the app home end on the landing page. */
test.describe('landing navigation @full', () => {
  test('a stale session cookie on / ends on /welcome', async ({ browser }) => {
    const context = await browser.newContext(PIXEL_7);
    try {
      await context.addCookies([
        { name: 'gobbit_session', value: 'stale-session', url: webBaseURL, sameSite: 'Lax' },
      ]);
      const page = await context.newPage();
      await page.goto(webUrl('/'));
      await expect(page).toHaveURL(/\/welcome\?from=app$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('form.join')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('"Sign in" on the landing page opens sign-in', async ({ browser }) => {
    await stranger(browser, async (page) => {
      await page.goto(webUrl('/welcome'));
      await page.getByRole('link', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole('button', { name: /sign-in link/i })).toBeVisible();
    });
  });
});
