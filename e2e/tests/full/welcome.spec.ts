import { randomUUID } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';
import type { PlaywrightWorkerArgs } from '@playwright/test';
import { test, expect, newApiContext, signInByMagicLink } from '../../fixtures/identity';
import { waitForCallbackLink } from '../../lib/mailbox';
import { EMAIL_DOMAIN } from '../../lib/stack-config';
import { stack } from '../../lib/stack';
import { categoryList } from '../smoke/helpers/browse-deck';
import { searchBox } from '../smoke/helpers/deck-header';

/** 053 (D478-D486): the first-run welcome of a member who came in by a mailed invite. */

const CATEGORIES = [
  { name: 'Welcome soups', slug: 'welcome-soups' },
  { name: 'Welcome breads', slug: 'welcome-breads' },
] as const;

type Playwright = PlaywrightWorkerArgs['playwright'];

/** A deck with two categories (one card each) and a page of a new address that accepted its mailed invite. */
async function invitedMember(
  playwright: Playwright,
  browser: Browser,
  owner: import('@playwright/test').APIRequestContext,
  deck: { id: string; slug: string },
): Promise<{ page: Page; email: string }> {
  for (const cat of CATEGORIES) {
    const res = await owner.post(`decks/${deck.id}/categories`, { data: cat });
    expect(res.status(), `create ${cat.slug}`).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const card = await owner.post(`decks/${deck.slug}/items`, {
      data: { type: 'text', title: `Card in ${cat.name}`, body: 'Body', categoryIds: [id] },
    });
    expect(card.status(), 'create card').toBe(201);
  }
  const email = `welcome-${randomUUID().slice(0, 8)}@${EMAIL_DOMAIN}`;
  const invite = await owner.post(`decks/${deck.id}/invites`, { data: { email, role: 'reader' } });
  expect(invite.status(), 'invite').toBe(201);

  const api = await newApiContext(playwright);
  const link = await waitForCallbackLink(stack.mailboxUrl, email);
  const cb = await api.get(link, { maxRedirects: 0 });
  expect(cb.status(), 'invite link callback').toBe(303);
  await answerAnalytics(api);
  const context = await browser.newContext({
    baseURL: stack.webUrl,
    storageState: await api.storageState(),
  });
  await api.dispose();
  return { page: await context.newPage(), email };
}

/** The consent wall comes first (D483); answer it as the settings toggle would, so only the welcome shows. */
async function answerAnalytics(api: import('@playwright/test').APIRequestContext): Promise<void> {
  const res = await api.put('me/analytics-consent', {
    data: { value: 'declined', source: 'settings' },
  });
  expect(res.status(), 'record analytics answer').toBe(200);
}

const welcome = (page: Page) => page.getByRole('dialog', { name: /^Welcome to / });
const hint = (page: Page) => page.getByRole('dialog', { name: 'How to browse' });

test('a mailed invite shows the welcome; Categories opens the list, back closes only the list; a new device sees none @full', async ({
  playwright,
  browser,
  api,
  smokeDeck,
}) => {
  const { page, email } = await invitedMember(playwright, browser, api, smokeDeck);
  await page.goto(`/d/${smokeDeck.slug}`);
  await expect(welcome(page)).toBeVisible();

  const dismissed = page.waitForResponse(
    (r) => r.request().method() === 'DELETE' && r.url().endsWith(`/decks/${smokeDeck.id}/welcome`),
  );
  await welcome(page).getByRole('button', { name: 'Categories' }).click();
  expect((await dismissed).status()).toBe(204);

  await expect(welcome(page)).toHaveCount(0);
  await expect(categoryList(page)).toBeVisible();
  await expect(page).toHaveURL(/\/browse\?/);

  await page.goBack();
  await expect(categoryList(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/browse\?/);

  // The same person on another device: the dismissal lives on the membership.
  const second = await signInByMagicLink(playwright, email);
  try {
    await answerAnalytics(second.api);
    const context = await browser.newContext({
      baseURL: stack.webUrl,
      storageState: await second.api.storageState(),
    });
    try {
      const other = await context.newPage();
      await other.goto(`/d/${smokeDeck.slug}`);
      await expect(other.getByRole('banner')).toBeVisible();
      await expect(welcome(other)).toHaveCount(0);
    } finally {
      await context.close();
    }
  } finally {
    await second.api.dispose();
  }
  await page.context().close();
});

test('the welcome Search button opens the focused search box @full', async ({
  playwright,
  browser,
  api,
  smokeDeck,
}) => {
  const { page } = await invitedMember(playwright, browser, api, smokeDeck);
  await page.goto(`/d/${smokeDeck.slug}`);
  await expect(welcome(page)).toBeVisible();
  await welcome(page).getByRole('button', { name: 'Search' }).click();
  await expect(welcome(page)).toHaveCount(0);
  await expect(searchBox(page)).toBeFocused();
  await page.context().close();
});

test('How to browse waits until the welcome list has closed @full', async ({
  playwright,
  browser,
  api,
  smokeDeck,
}) => {
  const { page } = await invitedMember(playwright, browser, api, smokeDeck);
  await page.goto(`/d/${smokeDeck.slug}`);
  await welcome(page).getByRole('button', { name: 'Categories' }).click();
  const list = categoryList(page);
  await expect(list).toBeVisible();
  await expect(hint(page)).toHaveCount(0);

  await list.getByRole('button', { name: new RegExp(`^${CATEGORIES[0].name}(,|$)`) }).click();
  await expect(list).toHaveCount(0);
  await expect(hint(page)).toBeVisible();
  await page.context().close();
});
