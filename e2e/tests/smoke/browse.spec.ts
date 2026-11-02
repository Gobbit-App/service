import type { APIRequestContext, Page } from '@playwright/test';
import type { SmokeDeck } from '../../fixtures/api';
import { expect, test, webUrl } from '../../fixtures/web';
import { swipeCard, swipeUp } from './helpers/swipe';

/** Data-model §4 key; set before every page load except in the first-run hint test. */
const HINT_KEY = 'gobbit:browse-hint:v2';
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
const rail = (page: Page) => page.getByRole('navigation', { name: 'Categories' });
const chip = (page: Page, name: string) => rail(page).getByRole('button', { name, exact: true });

/**
 * The card is current and the snap scroll has settled (the address carries its id): the
 * current page flips at 60 % visibility, before a momentum scroll ends, so controls are only
 * clicked once the 300 ms settle has written `i`.
 */
async function expectCurrent(page: Page, card: { id: string; title: string }): Promise<void> {
  await expect(cardHeading(page, card.title)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`i=${card.id}`));
}

/** D249: the dock's Previous/Next card buttons. */
const dockButton = (page: Page, label: 'Previous card' | 'Next card') =>
  page.getByRole('button', { name: label });

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

    // the dock: Previous is inert on the first card
    await expect(dockButton(page, 'Previous card')).toHaveAttribute('aria-disabled', 'true');

    // next/prev by the dock and by a sideways swipe (D244)
    await dockButton(page, 'Next card').click();
    await expectCurrent(page, second!);
    await swipeCard(page, 'next');
    await expectCurrent(page, third!);
    await dockButton(page, 'Previous card').click();
    await expectCurrent(page, second!);

    // reload restores i
    await page.reload();
    await expectCurrent(page, second!);
    await swipeCard(page, 'prev');
    await expectCurrent(page, first!);

    // details and source sit under the card: scrolling the page reveals them (D246)
    const details = currentPage(page).getByRole('region', { name: 'Details' });
    await swipeUp(page);
    await expect(details).toBeInViewport();
    await expect(details).toContainText(MAIN.name);
    await expect(page).toHaveURL(new RegExp(`i=${first!.id}`));

    // favorite works from the dock
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
      await page.keyboard.press('ArrowRight');
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

    // system back does the same (Browse opens on the first card visible in the list)
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expect(page).toHaveURL(/\/browse\?.*i=/);
    const opened = deck.cards.findIndex((c) => c.id === new URL(page.url()).searchParams.get('i'));
    expect(opened, 'opened on a card of the list').toBeGreaterThan(0);
    await expectCurrent(page, deck.cards[opened]!);
    await page.keyboard.press('ArrowLeft');
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
      // a category never opened on this device → the offline state page
      await chip(page, OTHER.name).click();
      await expect(page).toHaveURL(new RegExp(`c=${OTHER.slug}`));
      await expect(page.getByText(/You're offline/)).toBeVisible();

      // the visited one still renders from the persisted cache
      await chip(page, MAIN.name).click();
      await expect(page).toHaveURL(new RegExp(`c=${MAIN.slug}`));
      await expect(cardHeading(page, deck.cards[0]!.title)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('category rail and end page @smoke', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'dismissed'), HINT_KEY);
    await page.goto(browseUrl(deck.slug, 'c=all'));
    await expect(chip(page, 'All')).toHaveAttribute('aria-current', 'true');
    await dockButton(page, 'Next card').click();
    await expect(page).toHaveURL(/i=/);

    // sideways moves change the card, never the category (D247)
    await swipeCard(page, 'prev');
    await settle(page);
    await expect(page).toHaveURL(/c=all/);

    // a chip moves to that category at card 1, `c` updated and `i` cleared
    await chip(page, MAIN.name).click();
    await expect(page).toHaveURL(new RegExp(`c=${MAIN.slug}`));
    await expect(page).not.toHaveURL(/i=/);
    await expect(chip(page, MAIN.name)).toHaveAttribute('aria-current', 'true');
    await expect(cardHeading(page, deck.cards[0]!.title)).toBeVisible();

    // the last category's end page offers only the way back (OTHER: 3 cards, then the end)
    await chip(page, OTHER.name).click();
    await expect(cardHeading(page, 'Other card 3')).toBeVisible();
    for (let n = 0; n < 3; n += 1) {
      await page.keyboard.press('ArrowRight');
      await settle(page);
    }
    await expect(cardHeading(page, `That's all in ${OTHER.name}`)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Continue to / })).toHaveCount(0);

    // FR-005: opened from a list, then moved to another category, system back lands on the
    // current category's list (not the one Browse was opened from) with the card in view
    await page.goto(webUrl(`/d/${deck.slug}/c/${MAIN.slug}`));
    await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/browse\\?.*c=${MAIN.slug}.*i=`));
    await chip(page, OTHER.name).click();
    await expect(cardHeading(page, 'Other card 3')).toBeVisible();
    await dockButton(page, 'Next card').click();
    await expect(cardHeading(page, 'Other card 2')).toBeVisible();
    await expect(page).toHaveURL(/i=/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/c/${OTHER.slug}$`));
    await expect(page.getByRole('article', { name: 'Other card 2' })).toBeInViewport();
  });

  test('no gestures needed: first-run hint, dock and keyboard @smoke', async ({ page }) => {
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

    // card and category by accessible names only
    await dockButton(page, 'Next card').click();
    await expect(cardHeading(page, second!.title)).toBeVisible();
    await dockButton(page, 'Previous card').click();
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await chip(page, OTHER.name).click();
    await expect(page).toHaveURL(new RegExp(`c=${OTHER.slug}`));
    await chip(page, MAIN.name).click();
    await expect(page).toHaveURL(new RegExp(`c=${MAIN.slug}`));

    // the same with the keyboard only
    await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}`));
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await page.keyboard.press('PageDown');
    await expect(cardHeading(page, second!.title)).toBeVisible();
    await page.keyboard.press('PageUp');
    await expect(cardHeading(page, first!.title)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/d/${deck.slug}/c/${MAIN.slug}$`));
  });
});
