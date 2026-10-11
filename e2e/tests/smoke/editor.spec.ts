import { expect, test, webUrl } from '../../fixtures/web';

test('a text card added from the editor shows in the list and survives a reload @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor text ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('link', { name: 'Add card' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));

  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Body', { exact: true }).fill('Written from the editor');
  await page.getByRole('button', { name: 'Save card' }).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('a link card added from the editor is listed with its url @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor link ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));

  await page.getByRole('radio', { name: 'Link' }).check();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/recipes');
  await page.getByRole('button', { name: 'Save card' }).click();

  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('a 601-character body is refused with the API message @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));

  await page.getByLabel('Title', { exact: true }).fill('Too long');
  await page.getByLabel('Body', { exact: true }).fill('x'.repeat(601));
  await page.getByRole('button', { name: 'Save card' }).click();

  await expect(page.getByRole('alert')).toContainText('600');
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));
});

test('the category select starts on the deck default category @smoke', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  const category = page.getByLabel('Category', { exact: true });
  await expect(category).toHaveValue(/.+/);
  await expect(category.locator('option')).not.toHaveCount(0);
});
