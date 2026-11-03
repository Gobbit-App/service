import type { Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

/**
 * 036 bottom bar (D274–D280, ADR-067, `@full`): fixed while scrolling and clear of the last card,
 * absent from Browse and the editor, the + by keyboard, short press and long press, and the ⋯
 * menu. The critical create/sign-out journeys through the bar run in the `@smoke` editor,
 * share and settings specs.
 */

const bar = (page: Page) => page.getByRole('navigation', { name: 'Deck actions' });
const add = (page: Page) => bar(page).getByRole('button', { name: 'Add', exact: true });

test('the bar stays put while scrolling and never covers the last card @full', async ({
  page,
  webDeck,
}) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(bar(page)).toBeVisible();
  const before = await bar(page).boundingBox();

  await page.mouse.wheel(0, 10_000);
  await expect(bar(page)).toBeInViewport();
  expect(await bar(page).boundingBox()).toEqual(before);

  const last = page.locator('.item-list__items > li').last();
  await last.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 10_000);
  const lastBox = await last.boundingBox();
  const barBox = await bar(page).boundingBox();
  expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeLessThanOrEqual(barBox?.y ?? 0);
});

test('Browse and the editor have no bottom bar @full', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await bar(page).getByRole('button', { name: 'Browse', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/browse`));
  await expect(page.locator('.bottom-bar')).toHaveCount(0);

  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();
  await expect(page.locator('.bottom-bar')).toHaveCount(0);
});

test('the + menu works from the keyboard and Escape returns focus @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await add(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'New card' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Paste or share' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(add(page)).toBeFocused();
});

test('a long press on + opens a new card; a short press only opens the menu @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));

  await add(page).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await page.keyboard.press('Escape');

  await add(page).hover();
  await page.mouse.down();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/new$`), { timeout: 2_000 });
  await page.mouse.up();
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('the ⋯ menu leads to Activity and Settings, whose back returns to the deck @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const menu = bar(page).getByRole('button', { name: 'Menu' });

  await menu.click();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Activity' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/log$`));

  await menu.click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/settings$`));
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
});
