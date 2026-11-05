import { expect, test, webUrl } from '../../fixtures/web';
import {
  banner,
  browseUrl,
  cardHeading,
  categoryButton,
  categoryList,
  createCard,
  expectCategory,
  expectCurrent,
  fullView,
  MAIN,
  OTHER,
  seedBrowseDeck,
  settle,
  skipHint,
  type BrowseDeck,
} from '../smoke/helpers/browse-deck';
import { swipe, swipeUpLong, viewport } from '../smoke/helpers/swipe';

/**
 * 040 Browse (T032, `@full`): detected text (D339/D340), PageDown/PageUp, the start of the
 * categories, the edge strips (D327), swiping the full view out (D334) and every way to dismiss
 * the category list. The core journeys are `@smoke` in smoke/browse.spec.ts.
 */
test.describe('browse rework', () => {
  test.describe.configure({ timeout: 90_000 });

  let deck: BrowseDeck;

  test.beforeEach(async ({ api, page, smokeDeck }) => {
    deck = await seedBrowseDeck(api, smokeDeck);
    await skipHint(page);
  });

  test('phones, emails and numbers in a card are actions @full', async ({ page, context, api }) => {
    const card = { title: 'Plumber', id: '' };
    card.id = await createCard(api, deck.slug, {
      title: card.title,
      body: 'Call +30 697 349 6445 or mail plumber@example.com. Door code 4821, since 2019.',
      categoryIds: [deck.otherId],
    });
    await page.goto(browseUrl(deck.slug, `c=${OTHER.slug}&i=${card.id}`));
    await expectCurrent(page, card);
    const stage = page.locator('.browse__stage');

    await expect(stage.getByRole('link', { name: 'Call +30 697 349 6445' })).toHaveAttribute(
      'href',
      'tel:+306973496445',
    );
    await expect(stage.getByRole('link', { name: 'Email plumber@example.com' })).toHaveAttribute(
      'href',
      'mailto:plumber@example.com',
    );
    // a year stays plain text
    await expect(stage.getByRole('button', { name: 'Copy 2019' })).toHaveCount(0);

    // a number copies, with a short confirmation
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await stage.getByRole('button', { name: 'Copy 4821' }).click();
    await expect(page.getByText('Copied', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('4821');

    // the same card in the list shows plain text (detection is Browse only)
    await page.goto(webUrl(`/d/${deck.slug}/c/${OTHER.slug}`));
    const article = page.getByRole('article', { name: card.title });
    await expect(article).toContainText('+30 697 349 6445');
    await expect(article.getByRole('link', { name: /^Call / })).toHaveCount(0);
  });

  test('PageDown and PageUp move between cards @full', async ({ page }) => {
    const [first, second] = deck.cards;
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expectCurrent(page, first!);
    await page.keyboard.press('PageDown');
    await expectCurrent(page, second!);
    await page.keyboard.press('PageUp');
    await expectCurrent(page, first!);
    await expectCategory(page, MAIN);
  });

  test('All is the first category: before it there is nothing @full', async ({ page }) => {
    await page.goto(browseUrl(deck.slug, 'c=all'));
    await expect(categoryButton(page)).toHaveAccessibleName('Category: All, choose another');
    await page.keyboard.press('ArrowLeft');
    await expect(banner(page)).toHaveText('No previous category');
    await settle(page);
    await expect(page).toHaveURL(/c=all/);
  });

  test('a swipe from the screen edge never changes category @full', async ({ page }) => {
    const [first] = deck.cards;
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expectCurrent(page, first!);
    const { width, height } = viewport(page);

    await swipe(page, {
      x: width - 8,
      y: Math.round(height / 2),
      dx: -Math.round(width * 0.6),
      dy: 0,
      durationMs: 150,
    });
    await settle(page);
    await expectCategory(page, MAIN);
    await expectCurrent(page, first!);

    await swipe(page, {
      x: 8,
      y: Math.round(height / 2),
      dx: Math.round(width * 0.6),
      dy: 0,
      durationMs: 150,
    });
    await settle(page);
    await expectCategory(page, MAIN);
    await expectCurrent(page, first!);
  });

  test('swiping the full view past its end closes it @full', async ({ page }) => {
    const [first] = deck.cards;
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expectCurrent(page, first!);
    await page.keyboard.press('f');
    const full = fullView(page, first!.title);
    await expect(full).toBeVisible();

    await swipeUpLong(page);
    await expect(full).toHaveCount(0);
    await expectCurrent(page, first!);
    await expectCategory(page, MAIN);
  });

  test('the category list closes by Escape, its Close button and the backdrop @full', async ({
    page,
  }) => {
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expect(cardHeading(page, deck.cards[0]!.title)).toBeVisible();
    const list = categoryList(page);

    await categoryButton(page).click();
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);

    await categoryButton(page).click();
    await expect(list).toBeVisible();
    await list.getByRole('button', { name: 'Close categories' }).click();
    await expect(list).toHaveCount(0);

    // the sheet sits at the bottom: the top of the screen is backdrop
    await categoryButton(page).click();
    await expect(list).toBeVisible();
    const { width } = viewport(page);
    await page.mouse.click(Math.round(width / 2), 12);
    await expect(list).toHaveCount(0);

    // none of these changed the category or left Browse
    await expectCategory(page, MAIN);
    await expect(page).toHaveURL(/\/browse\?/);
  });
});
