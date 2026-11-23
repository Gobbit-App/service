import { expect, test, newApiContext } from '../../fixtures/identity';
import { waitForCallbackLink } from '../../lib/mailbox';
import { stack } from '../../lib/stack';
import { EMAIL_DOMAIN } from '../../lib/stack-config';

/**
 * 051 US3 (`@full`): a pending invite's address is the inviter's to see, nobody else's, and is
 * gone once the invite is accepted. The invitee accepts through the real invite-mail link.
 */
test('only the inviter sees a pending address, and not after it is accepted @full', async ({
  page,
  user,
  playwright,
  smokeDeck,
  member,
}) => {
  const reader = await member(smokeDeck, 'reader');
  const invitee = `invitee-${Math.random().toString(36).slice(2, 10)}@${EMAIL_DOMAIN}`;

  await page.goto(`/d/${smokeDeck.slug}/settings`);
  const invite = page.getByRole('form', { name: 'Invite someone' });
  await invite.getByLabel('Email').fill(invitee);
  await invite.getByLabel('Role').selectOption('editor');
  await invite.getByRole('button', { name: 'Send invite' }).click();
  await expect(invite.getByRole('status')).toContainText(`Invite sent to ${invitee}`);
  await expect(page.getByRole('listitem').filter({ hasText: invitee })).toContainText('Invited');

  // The reader's members screen shows neither address, and no "Invited by".
  const readerPage = await reader.page();
  await readerPage.goto(`/d/${smokeDeck.slug}/settings`);
  await expect(readerPage.getByRole('heading', { name: 'Members' })).toBeVisible();
  const text = await readerPage.locator('body').innerText();
  expect(text).not.toContain(invitee);
  expect(text).not.toContain(user.email);
  expect(text).not.toContain('Invited by');

  // Following the invite mail's link accepts the invite and removes the address from the owner's view.
  const accepted = await newApiContext(playwright);
  try {
    const link = await waitForCallbackLink(stack.mailboxUrl, invitee);
    expect((await accepted.get(link, { maxRedirects: 0 })).status()).toBe(303);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
    await expect(page.getByText(invitee)).toHaveCount(0);
  } finally {
    await accepted.dispose();
  }
});
