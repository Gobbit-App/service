import type { APIRequestContext, Page } from '@playwright/test';
import type { SmokeDeck } from '../../../fixtures/api';
import { expect, webUrl } from '../../../fixtures/web';

/** Data-model §6 key; set before every page load except in the first-run hint test. */
export const HINT_KEY = 'gobbit:browse-hint:v3';
export const MAIN = { name: 'Browse main', slug: 'browse-main' } as const;
export const OTHER = { name: 'Browse other', slug: 'browse-other' } as const;
export const MAIN_CARDS = 25;
export const OTHER_CARDS = 3;

export interface CardRef {
  id: string;
  title: string;
}

export interface BrowseDeck {
  slug: string;
  mainId: string;
  otherId: string;
  /** Published cards of MAIN in list order (what Browse pages through). */
  cards: CardRef[];
  archivedId: string;
}

async function createCategory(
  api: APIRequestContext,
  deck: SmokeDeck,
  cat: { name: string; slug: string },
): Promise<string> {
  const res = await api.post(`decks/${deck.id}/categories`, { data: cat });
  expect(res.status(), `create ${cat.slug}`).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** A published text card in `categoryIds`. */
export async function createCard(
  api: APIRequestContext,
  deckSlug: string,
  card: { title: string; body?: string; categoryIds: string[] },
): Promise<string> {
  const res = await api.post(`decks/${deckSlug}/items`, {
    data: { type: 'text', body: `Body of ${card.title}`, ...card },
  });
  expect(res.status(), `create ${card.title}`).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** T014: 25 cards in one category plus an archived one, and a small second category. */
export async function seedBrowseDeck(api: APIRequestContext, deck: SmokeDeck): Promise<BrowseDeck> {
  const mainId = await createCategory(api, deck, MAIN);
  const otherId = await createCategory(api, deck, OTHER);
  for (let n = 1; n <= MAIN_CARDS; n += 1) {
    const title = `Main card ${String(n).padStart(2, '0')}`;
    await createCard(api, deck.slug, { title, categoryIds: [mainId] });
  }
  for (let n = 1; n <= OTHER_CARDS; n += 1) {
    await createCard(api, deck.slug, { title: `Other card ${n}`, categoryIds: [otherId] });
  }

  const archivedId = await createCard(api, deck.slug, {
    title: 'Main card archived',
    categoryIds: [mainId],
  });
  const archived = await api.post(`items/${archivedId}/archive`);
  expect(archived.status(), 'archive card').toBe(200);

  const list = await api.get(`decks/${deck.slug}/items?category=${MAIN.slug}&limit=50`);
  expect(list.status(), 'list main cards').toBe(200);
  const { data } = (await list.json()) as { data: CardRef[] };
  expect(data).toHaveLength(MAIN_CARDS);
  return {
    slug: deck.slug,
    mainId,
    otherId,
    cards: data.map(({ id, title }) => ({ id, title })),
    archivedId,
  };
}

export const browseUrl = (slug: string, query: string) => webUrl(`/d/${slug}/browse?${query}`);

/** Skips the first-run hint on every load of this page. */
export const skipHint = (page: Page) =>
  page.addInitScript((key) => localStorage.setItem(key, 'dismissed'), HINT_KEY);

/** Only the current card is exposed to assistive tech (the others are inert + aria-hidden). */
export const cardHeading = (page: Page, title: string) =>
  page.locator('.browse__stage').getByRole('heading', { name: title });

/** D336: the top bar's category button names the category Browse is on. */
export const categoryButton = (page: Page) =>
  page.getByRole('button', { name: /^Category: .*, choose another$/ });

export async function expectCategory(page: Page, cat: { name: string; slug: string }) {
  await expect(page).toHaveURL(new RegExp(`c=${cat.slug}`));
  await expect(categoryButton(page)).toHaveAccessibleName(`Category: ${cat.name}, choose another`);
}

/**
 * The card is current and the snap scroll has settled (the address carries its id): the
 * current page flips at 60 % visibility, before a momentum scroll ends, so controls are only
 * clicked once the 300 ms settle has written `i`.
 */
export async function expectCurrent(page: Page, card: CardRef): Promise<void> {
  await expect(cardHeading(page, card.title)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`i=${card.id}`));
}

/** D249: the dock's buttons. */
export const dockButton = (page: Page, label: 'Previous card' | 'Next card' | 'Full view') =>
  page.getByRole('button', { name: label, exact: true });

/** D332: the category list sheet. */
export const categoryList = (page: Page) => page.getByRole('dialog', { name: 'Categories' });

/** Opens the list from the top bar and picks `cat` (its row reads "<name>, N cards"). */
export async function pickCategory(page: Page, cat: { name: string }): Promise<void> {
  await categoryButton(page).click();
  const list = categoryList(page);
  await expect(list).toBeVisible();
  await list.getByRole('button', { name: new RegExp(`^${cat.name}(,|$)`) }).click();
  await expect(list).toHaveCount(0);
}

/** D334: the full view of the card titled `title`. */
export const fullView = (page: Page, title: string) => page.getByRole('dialog', { name: title });

/** D330: the category banner (aria-hidden; its copy is also announced). */
export const banner = (page: Page) => page.locator('.browse-banner');

/** Lets the 300 ms settle (and any stray handler) run before asserting nothing changed. */
export const settle = (page: Page) => page.waitForTimeout(600);
