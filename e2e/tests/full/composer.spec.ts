import type { Page } from '@playwright/test';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';

/**
 * 039 composer frame (`@full`, D300/D308/D310): the editor is its own page — no deck search,
 * no category nav, no bottom bar — with a top bar of Close, the heading and Save; Ctrl+Enter
 * saves and Escape leaves through the unsaved-changes guard. Save/Close themselves are `@smoke`.
 */

const textCard = (deck: WebDeck) => deck.items.find((item) => item.type === 'text')!;
const discardDialog = (page: Page) => page.getByRole('dialog', { name: 'Discard changes?' });

async function expectNoDeckChrome(page: Page): Promise<void> {
  await expect(page.getByRole('searchbox', { name: 'Search this deck' })).toHaveCount(0);
  await expect(page.locator('.bottom-bar')).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('banner').getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
}

test('the composer replaces the deck chrome, which is back after leaving @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  await expect(page.getByRole('heading', { level: 1, name: 'New card' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(`Smoke ${webDeck.slug}`);
  await expectNoDeckChrome(page);

  await page.goto(webUrl(`/i/${textCard(webDeck).id}/edit`));
  await expect(page.getByRole('heading', { level: 1, name: 'Edit card' })).toBeVisible();
  await expectNoDeckChrome(page);

  await page.getByRole('link', { name: 'Close' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${textCard(webDeck).id}$`));
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(page.getByRole('searchbox', { name: 'Search this deck' })).toBeVisible();
  await expect(page.locator('.bottom-bar')).toBeVisible();
});

test('a blocked Save says why only after an attempt (D308) @full', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('Title is required')).toHaveCount(0);

  await save.click();
  await expect(page.getByText('Title is required')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`));
});

test('Ctrl+Enter saves from the text field (D310) @full', async ({ page, webDeck }) => {
  const title = `Keyboard ${webDeck.slug}`;
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Title', { exact: true }).press('Control+Enter');
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('Escape leaves: untouched at once, changed through the guard (D310) @full', async ({
  page,
  webDeck,
}) => {
  const card = textCard(webDeck);
  await page.goto(webUrl(`/i/${card.id}/edit`));
  await page.getByLabel('Title', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));

  await page.goto(webUrl(`/i/${card.id}/edit`));
  await page.getByLabel('Title', { exact: true }).fill(`Changed ${card.title}`);
  await page.keyboard.press('Escape');
  await expect(discardDialog(page)).toBeVisible();
  // Escape in the open dialog is Keep editing, not a second leave.
  await page.keyboard.press('Escape');
  await expect(discardDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}/edit$`));

  await page.keyboard.press('Escape');
  await discardDialog(page).getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));
});
