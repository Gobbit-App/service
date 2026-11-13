import type { Locator, Page } from '@playwright/test';

/** 043 (D380–D382): the deck header's breadcrumb, view switcher and search sheet. */

export const breadcrumb = (page: Page): Locator =>
  page.getByRole('navigation', { name: 'Breadcrumb' });

/** The view crumb's menu button ("Category: <current view>"). */
export const viewSwitcher = (page: Page): Locator =>
  breadcrumb(page).getByRole('button', { name: /^Category: / });

export const searchButton = (page: Page): Locator =>
  page.getByRole('banner').getByRole('button', { name: 'Search', exact: true });

export const searchBox = (page: Page): Locator =>
  page.getByRole('searchbox', { name: 'Search this deck' });

/** Opens the view switcher and picks a view by its name. */
export async function switchView(page: Page, name: string): Promise<void> {
  await viewSwitcher(page).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}

/** Opens the search sheet and runs a search. */
export async function searchDeck(page: Page, q: string): Promise<void> {
  await searchButton(page).click();
  await searchBox(page).fill(q);
  await searchBox(page).press('Enter');
}
