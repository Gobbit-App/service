import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

/**
 * D354 About (`@full`): opened from the bottom bar's ⋯ menu, it shows the build's version and
 * credits, closes by Close, Escape and the backdrop, and its notices link serves the generated
 * licenses file rather than the SPA shell (the service worker's navigation denylist).
 */

const openAbout = async (page: Page) => {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'Gobbit' });
  await expect(about).toBeVisible();
  return about;
};

test('About shows the version, release date, credits and links @full', async ({
  page,
  webDeck,
}) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const about = await openAbout(page);

  await expect(about.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(about.locator('dt', { hasText: 'Version' })).toBeVisible();
  await expect(about.locator('dt', { hasText: 'Released' })).toBeVisible();
  await expect(about.getByRole('region', { name: 'Services we use' })).toContainText(
    'YouTube, TikTok and Vimeo',
  );
  await expect(about.getByRole('link', { name: 'Open-source notices' })).toHaveAttribute(
    'href',
    '/licenses.txt',
  );

  const results = await new AxeBuilder({ page })
    .include('dialog.about')
    .withRules(['button-name', 'link-name', 'color-contrast', 'definition-list', 'dlitem'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('About closes by Close, Escape and the backdrop @full', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}`));

  await (await openAbout(page)).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await openAbout(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await openAbout(page);
  await page.mouse.click(4, 4);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the notices link serves the licenses file, not the app shell @full', async ({
  page,
  webDeck,
}) => {
  // Visit the app first so the service worker controls the page that follows the link.
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await page.goto(webUrl('/licenses.txt'));
  await expect(page.locator('body')).toContainText('License: MIT');
  await expect(page.locator('#root')).toHaveCount(0);
});
