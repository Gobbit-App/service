import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures/identity';
import { waitForCallbackLink } from '../../lib/mailbox';
import { EMAIL_DOMAIN } from '../../lib/stack-config';
import { stack, webUrl } from '../../lib/stack';

/** 052: an owner's invite link takes a fresh address into the deck, once. */
test('an invite link joins a new address once and then reads as used @smoke', async ({
  page,
  api,
  smokeDeck,
  newUser,
  browser,
}) => {
  const inviterName = `ruth${randomUUID().slice(0, 6)}`;
  expect((await api.patch('me/profile', { data: { username: inviterName } })).status()).toBe(200);
  const name = `Smoke link ${randomUUID().slice(0, 6)}`;
  await page.goto(webUrl(`/d/${smokeDeck.slug}/settings`));
  const form = page.getByRole('form', { name: 'Invite by link' });
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByRole('list', { name: 'Invite links' }).getByText(name)).toBeVisible();

  // The list is the only place the url is served; the Share button would hand it to the clipboard.
  const list = await api.get(`decks/${smokeDeck.id}/invite-links`);
  expect(list.status()).toBe(200);
  const { links } = (await list.json()) as { links: { name: string; url: string }[] };
  const url = new URL(links.find((l) => l.name === name)!.url);
  const token = url.searchParams.get('t')!;

  const preview = await fetch(`${stack.webUrl}/s/invite?t=${encodeURIComponent(token)}`);
  expect(preview.status).toBe(200);
  expect(await preview.text()).toContain(`Smoke ${smokeDeck.slug}`);

  const address = `joiner-${randomUUID().slice(0, 8)}@${EMAIL_DOMAIN}`;
  const context = await browser.newContext({ baseURL: stack.webUrl });
  try {
    const guest = await context.newPage();
    await guest.goto(`/join?t=${encodeURIComponent(token)}`);
    await expect(guest.getByText(`Smoke ${smokeDeck.slug}`).first()).toBeVisible();
    await guest.getByRole('button', { name: 'Join' }).click();
    await guest.getByLabel('Email').fill(address);
    await guest.getByRole('button', { name: 'Send sign-in link' }).click();
    await expect(guest.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

    await guest.goto(await waitForCallbackLink(stack.mailboxUrl, address));
    await expect(guest).toHaveURL(new RegExp(`/d/${smokeDeck.slug}$`));

    // 053: the consent wall shows alone; the welcome follows the answer, once.
    const welcome = guest.getByRole('dialog', { name: /^Welcome to/ });
    const wall = guest.getByRole('dialog', { name: 'Help improve Gobbit?' });
    await expect(wall).toBeVisible();
    await expect(welcome).toHaveCount(0);
    await wall.getByRole('button', { name: 'No thanks' }).click();
    await expect(welcome).toContainText(`Smoke ${smokeDeck.slug}`);
    await expect(welcome).toContainText(`${inviterName} invited you`);
    await welcome.getByRole('button', { name: 'Start reading' }).click();
    await expect(welcome).toHaveCount(0);
    await guest.reload();
    await expect(
      guest.getByRole('heading', { name: `Smoke ${smokeDeck.slug}` }).first(),
    ).toBeVisible();
    await expect(welcome).toHaveCount(0);
  } finally {
    await context.close();
  }

  const second = await newUser('second');
  const other = await second.page();
  await other.goto(webUrl(`/join?t=${encodeURIComponent(token)}`));
  await expect(other.getByText(/already been used/i)).toBeVisible();
  await expect(other.getByRole('button', { name: 'Join' })).toHaveCount(0);
});
