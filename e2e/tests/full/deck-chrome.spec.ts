import type { Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

/**
 * Deck chrome (`@full`): the search box and category chips belong to the card lists only, and an
 * open modal keeps the page behind it from scrolling.
 */

const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search this deck' });
const chips = (page: Page) => page.getByRole('navigation', { name: 'Categories' });
const rootOverflow = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).overflowY);

test('search and categories show on the card lists, not on Your shares or Review @full', async ({
  page,
  webDeck,
}) => {
  for (const path of ['', '/favorites', '/search?q=card']) {
    await page.goto(webUrl(`/d/${webDeck.slug}${path}`));
    await expect(searchBox(page)).toBeVisible();
    await expect(chips(page)).toBeVisible();
  }

  for (const path of ['/shares', '/review']) {
    await page.goto(webUrl(`/d/${webDeck.slug}${path}`));
    await expect(page.getByRole('banner')).toContainText(`Smoke ${webDeck.slug}`);
    await expect(searchBox(page)).toHaveCount(0);
    await expect(chips(page)).toHaveCount(0);
    await expect(page.locator('.bottom-bar')).toBeVisible();
  }
});

test('an open sheet stops the page behind it from scrolling, closing frees it @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(searchBox(page)).toBeVisible();
  expect(await rootOverflow(page)).not.toBe('hidden');

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'About' }).click();
  await expect(page.getByRole('dialog', { name: 'Gobbit' })).toBeVisible();
  await expect.poll(() => rootOverflow(page)).toBe('hidden');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Gobbit' })).toHaveCount(0);
  await expect.poll(() => rootOverflow(page)).not.toBe('hidden');
});
