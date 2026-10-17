import { expect, test, webUrl } from '../../fixtures/web';

const LABEL_PREFIX = 'smoke-token-';

/** D50: leave no smoke tokens behind (the owner may hold at most 5). */
test.afterEach(async ({ api }) => {
  const res = await api.get('me/ingest-tokens');
  if (!res.ok()) return;
  const { data } = (await res.json()) as { data: { id: string; label: string }[] };
  for (const t of data.filter((t) => t.label.startsWith(LABEL_PREFIX))) {
    await api.delete(`me/ingest-tokens/${t.id}`);
  }
});

test('creates an ingest token, shows it once and revokes it from settings @smoke', async ({
  page,
}) => {
  const label = `${LABEL_PREFIX}${Date.now()}`;

  await page.goto(webUrl('/'));
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Ingest tokens' })).toBeVisible();

  await page.getByLabel('Name').fill(label);
  await page.getByRole('button', { name: 'Create token' }).click();

  const secret = page.getByRole('status').filter({ hasText: label });
  await expect(secret.locator('code').first()).toHaveText(/^ing_[A-Za-z0-9_-]{43}$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/^ing_[A-Za-z0-9_-]{43}$/)).toHaveCount(0);

  const list = page.getByRole('list', { name: 'Ingest tokens' });
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
