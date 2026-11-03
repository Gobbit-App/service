import type { Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

/** A small but common phone width; narrower than the Pixel 7 project default. */
const PHONE = { width: 360, height: 780 };

/** Pages with forms whose long <select> options used to push the page wider than the phone. */
const FORM_PAGES = (slug: string): string[] => [
  `/d/${slug}/settings`,
  `/d/${slug}/import`,
  '/settings',
  '/share?url=https%3A%2F%2Fexample.com%2Fa-very-long-path-that-should-wrap',
];

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * Escaped bug: on a phone, deck Settings (invite role select) and other grid forms scrolled
 * sideways and cut off controls, the bottom bar included. Every form page fits the viewport.
 */
test('form pages fit a 360px phone without sideways scrolling @full', async ({ page, webDeck }) => {
  await page.setViewportSize(PHONE);
  for (const path of FORM_PAGES(webDeck.slug)) {
    await page.goto(webUrl(path));
    await expect(page.locator('main select').first()).toBeVisible();
    expect(await horizontalOverflow(page), `${path} scrolls sideways`).toBe(0);
  }
});
