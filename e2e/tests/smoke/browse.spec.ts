import type { APIRequestContext, Page } from '@playwright/test';
import type { SmokeDeck } from '../../fixtures/api';
import { expect, test, webUrl } from '../../fixtures/web';
import { swipeBand, swipeCard, viewport } from './helpers/swipe';

/** Data-model §4 key; set before every page load except in the first-run hint test. */
const HINT_KEY = 'gobbit:browse-hint:v1';
const MAIN = { name: 'Browse main', slug: 'browse-main' } as const;
const OTHER = { name: 'Browse other', slug: 'browse-other' } as const;
const MAIN_CARDS = 25;

interface BrowseDeck {
  slug: string;
  /** Published cards of MAIN in list order (what Browse pages through). */
  cards: { id: string; title: string }[];
  archivedId: string;
}

async function createCategory(
  api: APIRequestContext,
  deck: SmokeDeck,
  cat: { name: string; slug: string },
) {
  const res = await api.post(`decks/${deck.id}/categories`, { data: cat });
  expect(res.status(), `create ${cat.slug}`).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function createCard(
  api: APIRequestContext,
  deck: SmokeDeck,
  title: string,
  categoryId: string,
): Promise<string> {
  const res = await api.post(`decks/${deck.slug}/items`, {
    data: { type: 'text', title, body: `Body of ${title}`, categoryIds: [categoryId] },
  });
  expect(res.status(), `create ${title}`).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** T014: 25 cards in one category plus an archived one, and a small second category. */
async function seedBrowseDeck(api: APIRequestContext, deck: SmokeDeck): Promise<BrowseDeck> {
  const mainId = await createCategory(api, deck, MAIN);
  const otherId = await createCategory(api, deck, OTHER);
  for (let n = 1; n <= MAIN_CARDS; n += 1) {
    await createCard(api, deck, `Main card ${String(n).padStart(2, '0')}`, mainId);
  }
  for (let n = 1; n <= 3; n += 1) await createCard(api, deck, `Other card ${n}`, otherId);

  const archivedId = await createCard(api, deck, 'Main card archived', mainId);
  const archived = await api.post(`items/${archivedId}/archive`);
  expect(archived.status(), 'archive card').toBe(200);

  const list = await api.get(`decks/${deck.slug}/items?category=${MAIN.slug}&limit=50`);
  expect(list.status(), 'list main cards').toBe(200);
  const { data } = (await list.json()) as { data: { id: string; title: string }[] };
  expect(data).toHaveLength(MAIN_CARDS);
  return { slug: deck.slug, cards: data.map(({ id, title }) => ({ id, title })), archivedId };
}

const browseUrl = (slug: string, query: string) => webUrl(`/d/${slug}/browse?${query}`);

/** Only the current page is exposed to assistive tech (the others are inert + aria-hidden). */
const cardHeading = (page: Page, title: string) => page.getByRole('heading', { name: title });
const currentPage = (page: Page) => page.locator('section.browse-page:not([inert])');

async function bandY(page: Page, band: 'header' | 'footer'): Promise<number> {
  const box = await currentPage(page).locator(`.browse-band--${band}`).boundingBox();
  if (!box) throw new Error(`no ${band} band on the current page`);
  return Math.round(box.y + box.height * 0.6);
}

/**
 * The card is current and the snap scroll has settled (the address carries its id): paging
 * flips the current page at 60 % visibility, before a momentum scroll ends, so controls are
 * only clicked once the 300 ms settle has written `i`.
 */
async function expectCurrent(page: Page, card: { id: string; title: string }): Promise<void> {
  await expect(cardHeading(page, card.title)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`i=${card.id}`));
}

/** D215: the position menu ("Card n of N") replaces the previous/next card buttons. */
async function moveCard(page: Page, label: 'Previous card' | 'Next card'): Promise<void> {
  await page.getByRole('button', { name: /^Card \d+/ }).click();
  await page.getByRole('menuitem', { name: label }).click();
}

/** The position menu's item is there but `aria-disabled` (first/last card). */
async function expectMoveDisabled(page: Page, label: 'Previous card' | 'Next card') {
  await page.getByRole('button', { name: /^Card \d+/ }).click();
  await expect(page.getByRole('menuitem', { name: label })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Lets the 300 ms settle (and any stray handler) run before asserting nothing changed. */
const settle = (page: Page) => page.waitForTimeout(600);

test.describe('browse mode', () => {
  test.describe.configure({ timeout: 90_000 });

  let deck: BrowseDeck;

  test.beforeEach(async ({ api, smokeDeck }) => {
    deck = await seedBrowseDeck(api, smokeDeck);
  });

  test('pages a category @smoke', async ({ page, api }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'dismissed'), HINT_KEY);
    const [first, second, third] = deck.cards;

    // open from the list's Browse button
    await page.goto(webUrl(`/d/${deck.slug}/c/${MAIN.slug}`));
    await expect(page.getByRole('article', { name: first?.title })).toBeVisible();
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/browse\\?.*c=${MAIN.slug}`));
    await expectCurrent(page, first!);
    const historyLength = await page.evaluate(() => history.length);

    // D215: no arrow buttons; the position control names the card
    await expect(
      page.getByRole('button', { name: /^(Previous|Next) (card|category|view)/ }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Card 1( of \d+)?$/ })).toBeVisible();

    // next/prev by the position menu and by swipe
    await moveCard(page, 'Next card');
    await expectCurrent(page, second!);
    await swipeCard(page, 'next');
    await expectCurrent(page, third!);
    await moveCard(page, 'Previous card');
    await expectCurrent(page, second!);

    // reload restores i
    await page.reload();
    await expectCurrent(page, second!);
    await swipeCard(page, 'prev');
    await expectCurrent(page, first!);

    // favorite works in Browse
    await page.getByRole('button', { name: 'Add to favorites' }).click();
    await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            (await (await api.get(`items/${first!.id}`)).json()) as {
              isFavorite: boolean;
            }
          ).isFavorite,
      )
      .toBe(true);

    // every published card in order (across the 20-card page boundary); the archived one never
    for (const card of deck.cards.slice(1)) {
      await page.keyboard.press('PageDown');
      await expectCurrent(page, card);
    }
    await expect(
      page.getByRole('button', { name: `Card ${MAIN_CARDS} of ${MAIN_CARDS}` }),
    ).toBeVisible();
    await expectMoveDisabled(page, 'Next card');
    await expect(page.getByText('Main card archived')).toHaveCount(0);
    const last = deck.cards[MAIN_CARDS - 1]!;

    // paging replaced the address: no history entries were added (only the list → Browse push)
    expect(await page.evaluate(() => history.length)).toBe(historyLength);

    // close returns to the list with the current card visible
    await page.getByRole('button', { name: 'Close browse' }).click();
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/c/${MAIN.slug}$`));
    await expect(page.getByRole('article', { name: last.title })).toBeInViewport();

    // system back does the same (Browse opens on the first card visible in the list)
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expect(page).toHaveURL(/\/browse\?.*i=/);
    const opened = deck.cards.findIndex((c) => c.id === new URL(page.url()).searchParams.get('i'));
    expect(opened, 'opened on a card of the list').toBeGreaterThan(0);
    await expectCurrent(page, deck.cards[opened]!);
    await page.keyboard.press('PageUp');
    const back = deck.cards[opened - 1]!;
    await expectCurrent(page, back);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/c/${MAIN.slug}$`));
    await expect(page.getByRole('article', { name: back.title })).toBeInViewport();

    // an unknown (here: archived) card id opens on card 1 with a notice
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}&i=${deck.archivedId}`));
    await expect(
      page.getByRole('status').filter({ hasText: "That card isn't available here" }),
    ).toBeVisible();
    await expect(cardHeading(page, first!.title)).toBeVisible();
  });

  test('offline cached category @smoke', async ({ page, context }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'dismissed'), HINT_KEY);
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expect(cardHeading(page, deck.cards[0]!.title)).toBeVisible();

    await context.setOffline(true);
    try {
      // a category never opened on this device → the offline state page (keys, D215)
      await page.keyboard.press('ArrowRight');
      await expect(page).not.toHaveURL(new RegExp(`c=${MAIN.slug}`));
      await expect(page.getByText(/You're offline/)).toBeVisible();

      // the visited one still renders from the persisted cache
      await page.keyboard.press('ArrowLeft');
      await expect(page).toHaveURL(new RegExp(`c=${MAIN.slug}`));
      await expect(cardHeading(page, deck.cards[0]!.title)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('header changes category @smoke', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'dismissed'), HINT_KEY);
    const { width, height } = viewport(page);
    await page.goto(browseUrl(deck.slug, 'c=all'));
    await expect(page.getByRole('button', { name: 'Category: All' })).toBeVisible();
    await moveCard(page, 'Next card');
    await expect(page).toHaveURL(/i=/);

    // a swipe at the first category does nothing
    await swipeBand(page, await bandY(page, 'header'), 'prev');
    await settle(page);
    await expect(page).toHaveURL(/c=all/);

    // a header swipe moves to the next category at card 1, `c` updated and `i` cleared
    await swipeBand(page, await bandY(page, 'header'), 'next');
    await expect(page).not.toHaveURL(/c=all/);
    await expect(page.getByRole('button', { name: 'Category: All' })).toHaveCount(0);
    const next = await page.getByRole('button', { name: /^Category: / }).getAttribute('aria-label');
    const nextName = next!.replace('Category: ', '');
    await expect(page).not.toHaveURL(/i=/);
    const url = page.url();

    // a horizontal swipe in the middle zone does nothing
    await swipeBand(page, Math.round(height / 2), 'prev');
    await settle(page);
    await expect(page.getByRole('button', { name: `Category: ${nextName}` })).toBeVisible();

    // a header swipe starting in the 24 px edge guard does nothing (system back owns it)
    await swipeBand(page, await bandY(page, 'header'), 'prev', 10);
    await settle(page);
    await swipeBand(page, await bandY(page, 'header'), 'next', width - 10);
    await settle(page);
    await expect(page.getByRole('button', { name: `Category: ${nextName}` })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('c')).toBe(new URL(url).searchParams.get('c'));

    // FR-005: opened from a list, then moved to another category, system back lands on the
    // current category's list (not the one Browse was opened from) with the card in view
    await page.goto(webUrl(`/d/${deck.slug}/c/${MAIN.slug}`));
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/browse\\?.*c=${MAIN.slug}.*i=`));
    await page.getByRole('button', { name: `Category: ${MAIN.name}` }).click();
    await page.getByRole('menuitemradio', { name: OTHER.name }).click();
    await expect(cardHeading(page, 'Other card 3')).toBeVisible();
    await moveCard(page, 'Next card');
    await expect(cardHeading(page, 'Other card 2')).toBeVisible();
    await expect(page).toHaveURL(/i=/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/c/${OTHER.slug}$`));
    await expect(page.getByRole('article', { name: 'Other card 2' })).toBeInViewport();
  });

  test('footer panes @smoke', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'dismissed'), HINT_KEY);
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expect(cardHeading(page, deck.cards[0]!.title)).toBeVisible();

    // a footer swipe → Details
    await swipeBand(page, await bandY(page, 'footer'), 'next');
    await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page).toHaveURL(/pane=details/);
    await expect(page.getByRole('tabpanel', { name: 'Details' })).toContainText(MAIN.name);

    // the next card keeps the pane
    await moveCard(page, 'Next card');
    await expectCurrent(page, deck.cards[1]!);
    await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // reload keeps it too
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page).toHaveURL(/pane=details/);
  });

  test('no gestures needed: first-run hint, menus and keyboard @smoke', async ({ page }) => {
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

    // card, pane and category by accessible names only (D215: position and category menus)
    await expectMoveDisabled(page, 'Previous card');
    await moveCard(page, 'Next card');
    await expect(cardHeading(page, second!.title)).toBeVisible();
    await moveCard(page, 'Previous card');
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await page.getByRole('tab', { name: 'Source' }).click();
    await expect(page).toHaveURL(/pane=source/);
    await page.getByRole('button', { name: `Category: ${MAIN.name}` }).click();
    await page.getByRole('menuitemradio', { name: OTHER.name }).click();
    await expect(page).toHaveURL(new RegExp(`c=${OTHER.slug}`));
    await expect(page.getByRole('button', { name: `Category: ${OTHER.name}` })).toBeVisible();
    await page.getByRole('button', { name: `Category: ${OTHER.name}` }).click();
    await page.getByRole('menuitemradio', { name: MAIN.name }).click();
    await expect(page).toHaveURL(new RegExp(`c=${MAIN.slug}`));

    // the same with the keyboard only
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await page.keyboard.press('PageDown');
    await expect(cardHeading(page, second!.title)).toBeVisible();
    await page.keyboard.press('PageUp');
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page).not.toHaveURL(new RegExp(`c=${MAIN.slug}`));
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(`c=${MAIN.slug}`));
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await page.getByRole('tab', { name: 'Content' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/pane=details/);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/c/${MAIN.slug}$`));
  });
});
