import { expect, test, webUrl } from '../../fixtures/web';

/**
 * D383 Appearance (`@full`): the theme picked in Settings applies at once, survives a reload
 * (applied before first paint by `/theme-init.js`) and beats the device's scheme; "Match device"
 * hands back to it, and a stored value the app doesn't know is ignored.
 */

const THEME_KEY = 'gobbit:theme';

const rootTheme = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

const pageBackground = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('a picked theme applies at once, persists and wins over the device @full', async ({
  page,
  webDeck,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const lightBackground = await pageBackground(page);

  await page.goto(webUrl('/settings'));
  const theme = page.getByRole('group', { name: 'Theme' });
  await expect(theme.getByRole('radio', { name: 'Match device' })).toBeChecked();

  await theme.getByRole('radio', { name: 'Dark' }).check();
  await expect(theme.getByRole('radio', { name: 'Dark' })).toBeChecked();
  expect(await rootTheme(page)).toBe('dark');
  const darkBackground = await pageBackground(page);
  expect(darkBackground).not.toBe(lightBackground);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    'content',
    '#0e1b2e',
  );

  await page.reload();
  expect(await rootTheme(page)).toBe('dark');
  expect(await pageBackground(page)).toBe(darkBackground);
  await expect(
    page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }),
  ).toBeChecked();

  await page
    .getByRole('group', { name: 'Theme' })
    .getByRole('radio', { name: 'Match device' })
    .check();
  expect(await rootTheme(page)).toBeNull();
  expect(await pageBackground(page)).toBe(lightBackground);
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBeNull();
});

test('an unknown stored theme is ignored and the device decides @full', async ({
  page,
  webDeck,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript((key) => localStorage.setItem(key, 'sepia'), THEME_KEY);
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  expect(await rootTheme(page)).toBeNull();

  await page.goto(webUrl('/settings'));
  await expect(
    page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Match device' }),
  ).toBeChecked();
});
