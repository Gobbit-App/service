import { expect, test } from '../../fixtures/identity';
import { webUrl } from '../../lib/stack';
import { smokeUsername } from './helpers/profile';

const LABEL_PREFIX = 'smoke-token-';

test('creates an ingest token, shows it once and revokes it from settings @smoke', async ({
  page,
}) => {
  const label = `${LABEL_PREFIX}${Date.now()}`;

  await page.goto(webUrl('/?all=true'));
  // D276/D278: one Settings entry, in the bottom bar's ⋯ menu.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Your tokens' })).toBeVisible();

  await page.getByLabel('Name').fill(label);
  await page.getByRole('button', { name: 'Create token' }).click();

  const secret = page.getByRole('status').filter({ hasText: label });
  await expect(secret.locator('code').first()).toHaveText(/^ing_[A-Za-z0-9_-]{43}$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/^ing_[A-Za-z0-9_-]{43}$/)).toHaveCount(0);

  const list = page.getByRole('list', { name: 'Your tokens' });
  const row = list.getByRole('listitem').filter({ hasText: label });
  await expect(row).toContainText('Never used');

  await row.getByRole('button', { name: `Revoke ${label}` }).click();
  await row.getByRole('button', { name: 'Revoke for good' }).click();
  await expect(list.getByRole('listitem').filter({ hasText: label })).toHaveCount(0);
});

test('keeps Create disabled without a name and refuses an anonymous token list @smoke', async ({
  page,
  anon,
}) => {
  await page.goto(webUrl('/settings'));
  const create = page.getByRole('button', { name: 'Create token' });
  await expect(create).toBeDisabled();
  await page.getByLabel('Name').fill('   ');
  await expect(create).toBeDisabled();

  expect((await anon.get('me/ingest-tokens')).status()).toBe(401);
});

/** 046 Story 1, 7: the profile form saves and the values survive a reload. */
test('saves the profile from Settings and keeps it after a reload @smoke', async ({ page }) => {
  const username = smokeUsername();
  await page.goto(webUrl('/settings'));
  await page.getByRole('link', { name: 'Edit your profile' }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);

  await page.getByLabel('First name').fill('Smoke');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Username').fill(username);
  await expect(page.getByText('Available')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('First name')).toHaveValue('Smoke');
  await expect(page.getByLabel('Last name')).toHaveValue('Tester');
  await expect(page.getByLabel('Username')).toHaveValue(username);
});

/** 046 Story 2: a card shows its creator's avatar in a shared deck, none in the personal deck. */
test('a card shows the creator avatar in a shared deck, not in the personal deck @smoke', async ({
  page,
  api,
  webDeck,
}) => {
  const username = smokeUsername();
  expect((await api.patch('me/profile', { data: { username } })).status()).toBe(200);
  const me = (await (await api.get('me')).json()) as { user: { email: string } };

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const card = page.getByRole('article').filter({ hasText: 'Smoke text' });
  const avatar = card.getByRole('img', { name: `Added by ${username}` });
  await expect(avatar).toBeVisible();
  await avatar.focus();
  // The tooltip is the `data-tip` attribute (CSS), not DOM text.
  await expect(avatar).toHaveAttribute('data-tip', username);
  expect(await card.innerHTML()).not.toContain(me.user.email);

  // A magic-link sign-in creates the personal deck.
  const title = `Personal ${webDeck.slug}`;
  const created = await api.post('decks/me/items', {
    data: { type: 'text', title, body: 'Only me' },
  });
  expect(created.status(), 'create personal card').toBe(201);
  const { id } = (await created.json()) as { id: string };
  try {
    await page.goto(webUrl('/d/me'));
    const mine = page.getByRole('article').filter({ hasText: title });
    await expect(mine).toBeVisible();
    await expect(mine.getByRole('img', { name: /^Added by / })).toHaveCount(0);
  } finally {
    await api.delete(`items/${id}`);
  }
});
