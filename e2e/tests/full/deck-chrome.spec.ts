import type { Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';
import {
  breadcrumb,
  searchBox,
  searchButton,
  searchDeck,
  viewSwitcher,
} from '../smoke/helpers/deck-header';

/**
 * Deck chrome (`@full`): the one-line breadcrumb header (043, D380–D382). The view switcher and
 * Search belong to the card lists only; an open modal keeps the page behind it from scrolling.
 */

const rootOverflow = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).overflowY);

test('view switcher and Search show on the card lists, not on Your shares or Review @full', async ({
  page,
  webDeck,
}) => {
  for (const path of ['', '/favorites', '/search?q=card']) {
    await page.goto(webUrl(`/d/${webDeck.slug}${path}`));
    await expect(breadcrumb(page)).toContainText(`Smoke ${webDeck.slug}`);
    await expect(searchButton(page)).toBeVisible();
    await expect(viewSwitcher(page)).toBeVisible();
  }

  for (const path of ['/shares', '/review']) {
    await page.goto(webUrl(`/d/${webDeck.slug}${path}`));
    await expect(breadcrumb(page)).toContainText(`Smoke ${webDeck.slug}`);
    await expect(page.getByRole('button', { name: 'Switch deck' })).toBeVisible();
    await expect(searchButton(page)).toHaveCount(0);
    await expect(viewSwitcher(page)).toHaveCount(0);
    await expect(page.locator('.bottom-bar')).toBeVisible();
  }
});

test('the header is a single row at phone width @full', async ({ page, webDeck }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(webUrl(`/d/${webDeck.slug}/favorites`));
  const header = await page.getByRole('banner').boundingBox();
  expect(header?.height ?? 0).toBeLessThan(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('the deck switcher lists the deck checked and leads to all decks @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/favorites`));
  await page.getByRole('button', { name: 'Switch deck' }).click();
  await expect(
    page.getByRole('menuitemradio', { name: `Smoke ${webDeck.slug}`, exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitem', { name: 'All decks' }).click();
  await expect(page).toHaveURL(/\/\?all=true$/);
});

test('the deck name goes to the deck main page @full', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/favorites`));
  await breadcrumb(page)
    .getByRole('link', { name: `Smoke ${webDeck.slug}` })
    .click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(viewSwitcher(page)).toHaveText('All');
});

test('search sheet: Escape closes without searching, recent searches come back @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await searchButton(page).click();
  await expect(searchBox(page)).toBeFocused();
  await expect(page.getByRole('region', { name: 'Recent searches' })).toHaveCount(0);
  await searchBox(page).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));

  await searchDeck(page, 'Smoke text');
  await expect(page).toHaveURL(/\/search\?q=Smoke(\+|%20)text/);
  await expect(viewSwitcher(page)).toHaveText('Search');

  await searchButton(page).click();
  await expect(searchBox(page)).toHaveValue('Smoke text');
  const recent = page.getByRole('region', { name: 'Recent searches' });
  await expect(recent.getByRole('button', { name: 'Smoke text' })).toBeVisible();
});

test('/ opens the search sheet on a card list @full', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.keyboard.press('/');
  await expect(searchBox(page)).toBeFocused();
});

test('an open sheet stops the page behind it from scrolling, closing frees it @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(searchButton(page)).toBeVisible();
  expect(await rootOverflow(page)).not.toBe('hidden');

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'About' }).click();
  await expect(page.getByRole('dialog', { name: 'Gobbit' })).toBeVisible();
  await expect.poll(() => rootOverflow(page)).toBe('hidden');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Gobbit' })).toHaveCount(0);
  await expect.poll(() => rootOverflow(page)).not.toBe('hidden');
});
