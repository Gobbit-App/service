import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures/identity';
import { webUrl } from '../../lib/stack';
import { EMAIL_DOMAIN } from '../../lib/stack-config';

/** 046: a username unique per run (lowercase letters and digits only). */
const smokeUsername = (): string => `smoke${randomUUID().replace(/-/g, '').slice(0, 10)}`;

test('a new deck lists only its implicit owner @smoke', async ({ api, smokeDeck }) => {
  const res = await api.get(`decks/${smokeDeck.slug}/members`);
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  expect(data).toHaveLength(1);
  expect(data[0]).toMatchObject({ role: 'owner', implicit: true });
});

test('inviting a reader creates a pending membership @smoke', async ({ api, smokeDeck }) => {
  const email = `invitee-${randomUUID().slice(0, 8)}@${EMAIL_DOMAIN}`;
  const res = await api.post(`decks/${smokeDeck.slug}/invites`, {
    data: { email, role: 'reader' },
  });
  expect(res.status()).toBe(201);
  const { membership } = await res.json();
  expect(membership).toMatchObject({ email, role: 'reader', acceptedAt: null });
});

test('an anonymous request for a deck is 401 @smoke', async ({ anon, smokeDeck }) => {
  expect((await anon.get(`decks/${smokeDeck.slug}`)).status()).toBe(401);
});

/** 046 Story 7: the invite form previews a member by username (D424) without showing an email. */
test('the invite form previews a member by username, with no email @smoke', async ({
  page,
  smokeDeck,
  newUser,
}) => {
  const username = smokeUsername();
  const invitee = await newUser('invitee');
  expect((await invitee.api.patch('me/profile', { data: { username } })).status()).toBe(200);

  await page.goto(webUrl(`/d/${smokeDeck.slug}/settings`));
  const invite = page.getByRole('form', { name: 'Invite someone' });
  await invite.getByLabel('Email or username').fill(username);
  await expect(invite.getByRole('img', { name: `Added by ${username}` })).toBeVisible();
  await expect(invite.getByText(`@${username}`)).toBeVisible();
  expect(await invite.innerHTML()).not.toContain(invitee.email);
});

/** 046 Story 7: invite by username lands, and the member list shows no email. */
test('inviting by username adds the member without their email @smoke', async ({
  page,
  smokeDeck,
  newUser,
}) => {
  const username = smokeUsername();
  const invitee = await newUser('invitee');
  expect((await invitee.api.patch('me/profile', { data: { username } })).status()).toBe(200);

  await page.goto(webUrl(`/d/${smokeDeck.slug}/settings`));
  const invite = page.getByRole('form', { name: 'Invite someone' });
  await invite.getByLabel('Email or username').fill(username);
  await expect(invite.getByRole('img', { name: `Added by ${username}` })).toBeVisible();
  await invite.getByRole('button', { name: 'Send invite' }).click();
  await expect(invite.getByRole('status')).toContainText(`Invite sent to ${username}`);

  const row = page
    .getByRole('list', { name: 'Members' })
    .getByRole('listitem')
    .filter({ hasText: `@${username}` });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(/[^@\s]+@[^@\s]+\.[^@\s]+/);
});
