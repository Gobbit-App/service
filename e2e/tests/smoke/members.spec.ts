import { test, expect, webUrl } from '../../fixtures/web';
import { clearProfile, smokeUsername } from './helpers/profile';

/** The one standing invitee user on the deployed DB; its membership is removed on teardown. */
const SMOKE_INVITEE = 'smoke-invitee@example.test';

test('a new deck lists only its implicit owner @smoke', async ({ api, smokeDeck }) => {
  const res = await api.get(`decks/${smokeDeck.slug}/members`);
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  expect(data).toHaveLength(1);
  expect(data[0]).toMatchObject({ role: 'owner', implicit: true });
});

test('inviting a reader creates a pending membership @smoke', async ({ api, smokeDeck }) => {
  const res = await api.post(`decks/${smokeDeck.slug}/invites`, {
    data: { email: SMOKE_INVITEE, role: 'reader' },
  });
  expect(res.status()).toBe(201);
  const { membership } = await res.json();
  expect(membership).toMatchObject({ email: SMOKE_INVITEE, role: 'reader', acceptedAt: null });
});

test('an anonymous request for a deck is 401 @smoke', async ({ anon, smokeDeck }) => {
  expect((await anon.get(`decks/${smokeDeck.slug}`)).status()).toBe(401);
});

/**
 * 046 Story 7: the invite form previews a member by username (D424) without showing an email.
 * A second member cannot sign in from e2e, so the previewed member is the owner (found by their
 * own fresh username); sending is not exercised here (self-invites are refused).
 */
test('the invite form previews a member by username, with no email @smoke', async ({
  page,
  api,
  smokeDeck,
}) => {
  const username = smokeUsername();
  try {
    expect((await api.patch('me/profile', { data: { username } })).status()).toBe(200);
    const me = (await (await api.get('me')).json()) as { user: { email: string } };

    await page.goto(webUrl(`/d/${smokeDeck.slug}/settings`));
    const invite = page.getByRole('form', { name: 'Invite someone' });
    await invite.getByLabel('Email or username').fill(username);
    await expect(invite.getByRole('img', { name: `Added by ${username}` })).toBeVisible();
    await expect(invite.getByText(`@${username}`)).toBeVisible();
    expect(await invite.innerHTML()).not.toContain(me.user.email);
  } finally {
    await clearProfile(api);
  }
});

/**
 * 046 Story 7: invite by username lands. Needs a standing member whose username was set out of
 * band (their own session); skipped unless SMOKE_INVITEE_USERNAME names that member.
 */
test('inviting by username adds the member without their email @smoke', async ({
  page,
  smokeDeck,
}) => {
  const username = process.env.SMOKE_INVITEE_USERNAME;
  test.skip(!username, 'SMOKE_INVITEE_USERNAME is not set');

  await page.goto(webUrl(`/d/${smokeDeck.slug}/settings`));
  const invite = page.getByRole('form', { name: 'Invite someone' });
  await invite.getByLabel('Email or username').fill(username!);
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
