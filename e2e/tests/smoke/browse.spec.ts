import { expect, test, webUrl } from '../../fixtures/web';
import {
  banner,
  browseUrl,
  cardHeading,
  categoryButton,
  categoryList,
  createCard,
  dockButton,
  expectCategory,
  expectCurrent,
  fullView,
  MAIN,
  MAIN_CARDS,
  OTHER,
  pickCategory,
  seedBrowseDeck,
  settle,
  skipHint,
  type BrowseDeck,
} from './helpers/browse-deck';
import { swipe, swipeCard, swipeCategory, viewport } from './helpers/swipe';

/**
 * 040 Browse (T031, `@smoke`): cards move vertically, categories sideways with a banner, the
 * category list from the top bar, the full view, a card's category from it, and system back.
 * Detected text, every key, the ends, edge strips and swipe-out run nightly (`full/`).
 */
test.describe('browse mode', () => {
  test.describe.configure({ timeout: 90_000 });

  let deck: BrowseDeck;

  test.beforeEach(async ({ api, smokeDeck }) => {
    deck = await seedBrowseDeck(api, smokeDeck);
  });

  test('pages a category vertically @smoke', async ({ page, api }) => {
    await skipHint(page);
    const [first, second, third] = deck.cards;

    // open from the list's Browse button
    await page.goto(webUrl(`/d/${deck.slug}/c/${MAIN.slug}`));
    await expect(page.getByRole('article', { name: first?.title })).toBeVisible();
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/browse\\?.*c=${MAIN.slug}`));
    await expectCurrent(page, first!);
    await expectCategory(page, MAIN);
    const historyLength = await page.evaluate(() => history.length);

    // the dock: Previous is inert on the first card
    await expect(dockButton(page, 'Previous card')).toHaveAttribute('aria-disabled', 'true');

    // next/prev by the dock and by a vertical swipe (D325)
    await dockButton(page, 'Next card').click();
    await expectCurrent(page, second!);
    await swipeCard(page, 'next');
    await expectCurrent(page, third!);
    await swipeCard(page, 'prev');
    await expectCurrent(page, second!);
    await dockButton(page, 'Previous card').click();
    await expectCurrent(page, first!);

    // a vertical swipe never changes the category
    await expectCategory(page, MAIN);

    // reload restores i
    await dockButton(page, 'Next card').click();
    await expectCurrent(page, second!);
    await page.reload();
    await expectCurrent(page, second!);

    // favorite works from the dock
    await page.getByRole('button', { name: 'Add to favorites' }).click();
    await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();
    await expect
      .poll(
        async () =>
          ((await (await api.get(`items/${second!.id}`)).json()) as { isFavorite: boolean })
            .isFavorite,
      )
      .toBe(true);

    // every published card in order (across the 20-card page boundary); the archived one never
    for (const card of deck.cards.slice(2)) {
      await page.keyboard.press('ArrowDown');
      await expectCurrent(page, card);
    }
    await expect(page.getByText(`${MAIN_CARDS} / ${MAIN_CARDS}`)).toBeVisible();
    await expect(page.getByText('Main card archived')).toHaveCount(0);
    const last = deck.cards[MAIN_CARDS - 1]!;

    // one more step: the end page (D248); the address keeps the last card
    await dockButton(page, 'Next card').click();
    await expect(cardHeading(page, `That's all in ${MAIN.name}`)).toBeVisible();
    await expect(page.getByRole('button', { name: `Continue to ${OTHER.name}` })).toBeVisible();
    await expect(dockButton(page, 'Next card')).toHaveCount(0);
    await settle(page);
    await expect(page).toHaveURL(new RegExp(`i=${last.id}`));

    // paging replaced the address: no history entries were added (only the list → Browse push)
    expect(await page.evaluate(() => history.length)).toBe(historyLength);

    // back to the list with the last card visible
    await page.getByRole('button', { name: 'Back to the list' }).click();
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/c/${MAIN.slug}$`));
    await expect(page.getByRole('article', { name: last.title })).toBeInViewport();

    // an unknown (here: archived) card id opens on card 1 with a notice
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}&i=${deck.archivedId}`));
    await expect(
      page.getByRole('status').filter({ hasText: "That card isn't available here" }),
    ).toBeVisible();
    await expect(cardHeading(page, first!.title)).toBeVisible();
  });

  test('categories sideways, the banner and the list @smoke', async ({ page }) => {
    await skipHint(page);
    const [first, second] = deck.cards;
    await page.goto(webUrl(`/d/${deck.slug}/c/${MAIN.slug}`));
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expectCurrent(page, first!);
    // read on a little first, so coming back proves MAIN reset to its first card
    await swipeCard(page, 'next');
    await expectCurrent(page, second!);

    // a sideways swipe moves to the next category at its first card, with the banner (D330)
    await swipeCategory(page, 'next');
    await expectCategory(page, OTHER);
    await expect(cardHeading(page, 'Other card 3')).toBeVisible();
    await expect(banner(page)).toHaveText(`${OTHER.name} · 3 cards`);

    // OTHER is the last category: one more swipe says so and stays (no wrap-around)
    await swipeCategory(page, 'next');
    await expect(banner(page)).toHaveText('No next category');
    await settle(page);
    await expectCategory(page, OTHER);

    // back the other way opens MAIN on its first card again (D328, FR-008): address `c` only
    await swipeCategory(page, 'prev');
    await expectCategory(page, MAIN);
    await expect(cardHeading(page, first!.title)).toBeVisible();

    // the list: current one marked, a pick jumps there and closes it
    await categoryButton(page).click();
    const list = categoryList(page);
    await expect(list).toBeVisible();
    await expect(list.getByRole('button', { name: new RegExp(`^${MAIN.name}`) })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await list.getByRole('button', { name: new RegExp(`^${OTHER.name}`) }).click();
    await expect(list).toHaveCount(0);
    await expectCategory(page, OTHER);

    // system back closes the list without leaving Browse or changing the category
    await categoryButton(page).click();
    await expect(list).toBeVisible();
    await page.goBack();
    await expect(list).toHaveCount(0);
    await expectCategory(page, OTHER);

    // the end page continues into the next category
    const last = deck.cards[MAIN_CARDS - 1]!;
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}&i=${last.id}`));
    await expectCurrent(page, last);
    await dockButton(page, 'Next card').click();
    await page.getByRole('button', { name: `Continue to ${OTHER.name}` }).click();
    await expectCategory(page, OTHER);
    await expect(cardHeading(page, 'Other card 3')).toBeVisible();

    // FR-005: opened from a list, then moved to another category, system back lands on the
    // current category's list (not the one Browse was opened from) with the card in view
    await page.goto(webUrl(`/d/${deck.slug}/c/${MAIN.slug}`));
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/browse\\?.*c=${MAIN.slug}.*i=`));
    await swipeCategory(page, 'next');
    await expectCategory(page, OTHER);
    await dockButton(page, 'Next card').click();
    await expect(cardHeading(page, 'Other card 2')).toBeVisible();
    await expect(page).toHaveURL(/i=/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/c/${OTHER.slug}$`));
    await expect(page.getByRole('article', { name: 'Other card 2' })).toBeInViewport();
  });

  test('full view and a card category @smoke', async ({ page, api }) => {
    await skipHint(page);
    // newest first: this card leads both categories
    const shared = { title: 'Shared card', id: '' };
    shared.id = await createCard(api, deck.slug, {
      title: shared.title,
      categoryIds: [deck.mainId, deck.otherId],
    });
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}&i=${shared.id}`));
    await expectCurrent(page, shared);

    // the dock opens it: the whole card with its details; Close leaves Browse as it was
    await dockButton(page, 'Full view').click();
    const full = fullView(page, shared.title);
    await expect(full).toBeVisible();
    await expect(full.getByRole('region', { name: 'Details' })).toContainText(MAIN.name);
    await full.getByRole('button', { name: 'Close full view' }).click();
    await expect(full).toHaveCount(0);
    await expectCurrent(page, shared);

    // press and hold the card opens it too; system back closes it and stays in Browse
    const { width, height } = viewport(page);
    await swipe(page, {
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      dx: 0,
      dy: 0,
      durationMs: 800,
      steps: 2,
    });
    await expect(full).toBeVisible();
    await page.goBack();
    await expect(full).toHaveCount(0);
    await expectCurrent(page, shared);
    await expectCategory(page, MAIN);

    // a category in the full view browses it, on the same card (D336)
    await dockButton(page, 'Full view').click();
    await full.getByRole('button', { name: `Browse ${OTHER.name}` }).click();
    await expect(full).toHaveCount(0);
    await expectCategory(page, OTHER);
    await expectCurrent(page, shared);
  });

  test('offline cached category @smoke', async ({ page, context }) => {
    await skipHint(page);
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expect(cardHeading(page, deck.cards[0]!.title)).toBeVisible();

    await context.setOffline(true);
    try {
      // a category never opened on this device → the offline state page
      await pickCategory(page, OTHER);
      await expect(page).toHaveURL(new RegExp(`c=${OTHER.slug}`));
      await expect(page.getByText(/You're offline/)).toBeVisible();

      // the visited one still renders from the persisted cache
      await pickCategory(page, MAIN);
      await expect(page).toHaveURL(new RegExp(`c=${MAIN.slug}`));
      await expect(cardHeading(page, deck.cards[0]!.title)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('no gestures needed: first-run hint, dock, list and keyboard @smoke', async ({ page }) => {
    const [first, second] = deck.cards;
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));

    // fresh device → the hint, once
    const hint = page.getByRole('dialog', { name: 'How to browse' });
    await expect(hint).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await expect(hint).toHaveCount(0);

    // card, category and full view by accessible names only
    await dockButton(page, 'Next card').click();
    await expect(cardHeading(page, second!.title)).toBeVisible();
    await dockButton(page, 'Previous card').click();
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await pickCategory(page, OTHER);
    await expectCategory(page, OTHER);
    await pickCategory(page, MAIN);
    await expectCategory(page, MAIN);

    // the same with the keyboard only (D337)
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(cardHeading(page, second!.title)).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expectCategory(page, OTHER);
    await page.keyboard.press('ArrowLeft');
    await expectCategory(page, MAIN);
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await page.keyboard.press('f');
    await expect(fullView(page, first!.title)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(fullView(page, first!.title)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/c/${MAIN.slug}$`));
  });
});
