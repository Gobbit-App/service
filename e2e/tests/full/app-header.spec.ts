import type { Locator, Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

/** A small but common phone width (the header tightens at ≤ 400 px, D198). */
const PHONE = { width: 360, height: 780 };
/** Sub-pixel rounding and the chevron's round cap. */
const TOLERANCE = 2;

const left = async (locator: Locator): Promise<number> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element is not rendered');
  return box.x;
};

/** Left edge of the title's text (the h1 box spans the free space); deck pages (D380) title with the breadcrumb's h1. */
const titleTextLeft = (page: Page, title = '.app-header__title'): Promise<number> =>
  page.locator(title).evaluate((h1) => {
    const range = document.createRange();
    range.selectNodeContents(h1);
    return range.getBoundingClientRect().left;
  });

/**
 * Escaped design bug (D322): the deck list's header had an empty back slot, so "Decks" sat
 * ~56 px right of the content, and Back was centred in its hit area, indenting the chevron
 * and spreading it from the title. The lead now starts on the content's edge on every page.
 */
test.describe('app header lead @full', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test('the deck list shows the logo in line with the deck cards', async ({ page, webDeck }) => {
    await page.goto(webUrl('/?all=true'));
    const card = page.getByRole('link', { name: `Smoke ${webDeck.slug}` });
    await expect(card).toBeVisible();
    const logo = page.locator('header img.app-header__logo');
    await expect(logo).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back' })).toHaveCount(0);

    const logoLeft = await left(logo);
    expect(Math.abs(logoLeft - (await left(card)))).toBeLessThanOrEqual(TOLERANCE);
    // Title one --gap (16 px since D383) after the 32 px tile.
    expect((await titleTextLeft(page)) - logoLeft).toBeCloseTo(48, 0);
  });

  test('Back sits on the content edge, close to the title, with a full hit area', async ({
    page,
    webDeck,
  }) => {
    await page.goto(webUrl(`/d/${webDeck.slug}`));
    const back = page.getByRole('link', { name: 'Back' });
    await expect(back).toBeVisible();
    await expect(page.locator('header img.app-header__logo')).toHaveCount(0);

    const chevron = back.locator('svg path');
    const tip = await left(chevron);
    // The phone gutter (20 px since D383).
    expect(Math.abs(tip - 20)).toBeLessThanOrEqual(TOLERANCE);
    const chevronBox = await chevron.boundingBox();
    const gap =
      (await titleTextLeft(page, '.deck-crumbs__title')) -
      ((chevronBox?.x ?? 0) + (chevronBox?.width ?? 0));
    expect(gap).toBeGreaterThanOrEqual(8);
    expect(gap).toBeLessThanOrEqual(16);

    // The 44 px hit area reaches past the visible box, so a tap at the screen edge goes Back.
    const box = await back.boundingBox();
    await page.mouse.click(1, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await expect(page).not.toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  });
});
