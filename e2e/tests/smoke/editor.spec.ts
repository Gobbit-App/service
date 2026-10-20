import type { Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

const preview = (page: Page) => page.getByRole('region', { name: 'Preview' });
const save = (page: Page) => page.getByRole('button', { name: 'Save card' });

test('a text card added from the editor shows in the list and survives a reload @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor text ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.getByRole('link', { name: 'Add card' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));
  await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();

  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Body', { exact: true }).fill('Written from the editor');
  const previewText = await preview(page).getByRole('article').innerText();
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const listed = page.getByRole('article').filter({ hasText: title });
  await expect(listed).toBeVisible();
  // The preview is the same Card component as the list (D136).
  expect((await listed.innerText()).split('\n').slice(0, 2)).toEqual(
    previewText.split('\n').slice(0, 2),
  );

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
  await expect(page).toHaveURL(/\?type=link$/);
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/recipes');
  await page.getByLabel('Preview title', { exact: true }).fill('Recipes');
  await expect(preview(page)).toContainText('Recipes');
  await save(page).click();

  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('a 601-character body disables Save and says why @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));

  await page.getByLabel('Title', { exact: true }).fill('Too long');
  await page.getByLabel('Body', { exact: true }).fill('x'.repeat(601));

  await expect(save(page)).toBeDisabled();
  await expect(page.getByText('Fix 1 field')).toBeVisible();
  await expect(page.getByText('601 / 600 characters')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));
});

test('the category chips start on the deck default category @smoke', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  const chips = page.getByRole('group', { name: 'Categories' }).getByRole('button');
  await expect(chips).not.toHaveCount(0);
  await expect(chips.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
});

test('a table card keeps a moved row and stops at 12 rows @smoke', async ({ page, webDeck }) => {
  const title = `Editor table ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=table`));

  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Column 1 heading').fill('Day');
  await page.getByLabel('Column 2 heading').fill('Meal');
  await page.getByLabel('Row 1, Day').fill('Monday');
  await page.getByLabel('Row 1, Meal').fill('Soup');
  await page.getByRole('button', { name: 'Add row' }).click();
  await page.getByLabel('Row 2, Day').fill('Tuesday');
  await page.getByLabel('Row 2, Meal').fill('Pasta');
  await page.getByRole('button', { name: 'Move row 2 up' }).click();
  await expect(page.getByLabel('Row 1, Day')).toHaveValue('Tuesday');

  const addRow = page.getByRole('button', { name: 'Add row' });
  for (let rows = 2; rows < 12; rows += 1) await addRow.click();
  await expect(addRow).toBeDisabled();
  for (let row = 12; row > 2; row -= 1) {
    await page.getByRole('button', { name: `Remove row ${row}` }).click();
  }

  await save(page).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(card.getByRole('row').nth(1)).toContainText('Tuesday');
  await expect(card.getByRole('row').nth(2)).toContainText('Monday');
});

test('a calc card shows its live result; a bad expression disables Save @smoke', async ({
  page,
  webDeck,
}) => {
  const title = `Editor calc ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=calc`));

  await page.getByLabel('Title', { exact: true }).fill(title);
  const first = page.getByRole('group', { name: 'Field 1' });
  await first.getByLabel('Label').fill('Price');
  await first.getByLabel('Default').fill('3');
  await page.getByRole('button', { name: 'Add field' }).click();
  const second = page.getByRole('group', { name: 'Field 2' });
  await second.getByLabel('Label').fill('Count');
  await second.getByLabel('Default').fill('4');
  await page.getByLabel('Result label', { exact: true }).fill('Total');

  await page.getByLabel('Expression', { exact: true }).fill('a * (');
  await expect(save(page)).toBeDisabled();

  await page.getByLabel('Expression', { exact: true }).fill('a * b');
  await expect(page.getByText('Total: 12').first()).toBeVisible();
  await expect(save(page)).toBeEnabled();
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('a card is edited from its page; the type is fixed @smoke', async ({ page, webDeck }) => {
  const card = webDeck.items.find((item) => item.type === 'text')!;
  const title = `Edited ${webDeck.slug}`;
  await page.goto(webUrl(`/i/${card.id}`));
  await page.getByRole('link', { name: 'Edit', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/i/${card.id}/edit$`));
  await expect(page.getByRole('heading', { name: 'Edit card' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(card.title);

  await page.getByLabel('Title', { exact: true }).fill(title);
  await save(page).click();

  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('list cards link to the editor @smoke', async ({ page, webDeck }) => {
  const card = webDeck.items.find((item) => item.type === 'table')!;
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: card.title }) })
    .getByRole('link', { name: 'Edit', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}/edit$`));
  await expect(page.getByLabel('Column 1 heading')).toHaveValue('Day');
});
