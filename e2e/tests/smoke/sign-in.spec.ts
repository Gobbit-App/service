import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures/identity';
import { waitForCallbackLink } from '../../lib/mailbox';
import { EMAIL_DOMAIN } from '../../lib/stack-config';
import { stack } from '../../lib/stack';

test('a newcomer signs in through the real magic link and lands in their personal deck @smoke', async ({
  browser,
}) => {
  const address = `signin-${randomUUID().slice(0, 8)}@${EMAIL_DOMAIN}`;
  const context = await browser.newContext({ baseURL: stack.webUrl });
  try {
    const page = await context.newPage();
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(address);
    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

    await page.goto(await waitForCallbackLink(stack.mailboxUrl, address));

    // Signed in: the personal deck is reachable instead of bouncing to sign-in.
    await page.goto('/d/me');
    await expect(page).toHaveURL(/\/d\/me$/);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign-in link/i })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
