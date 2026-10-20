import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';

interface SearchHit {
  item: { id: string };
}

/** A card with a word no other smoke card uses, so search hits are unambiguous. */
async function createCard(api: APIRequestContext, deck: WebDeck, word: string) {
  const title = `Lifecycle ${word} ${deck.slug}`;
  const res = await api.post(`decks/${deck.slug}/items`, {
    data: { type: 'text', title, body: `A card about ${word}` },
  });
  expect(res.status(), 'create lifecycle card').toBe(201);
  const { id } = (await res.json()) as { id: string };
  return { id, title };
}

async function searchIds(api: APIRequestContext, deck: WebDeck, q: string): Promise<string[]> {
  const res = await api.get(`decks/${deck.slug}/search`, { params: { q } });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { data: SearchHit[] }).data.map((hit) => hit.item.id);
}

async function itemState(api: APIRequestContext, id: string): Promise<string> {
  const res = await api.get(`items/${id}`);
  if (res.status() === 404) return 'gone';
  return ((await res.json()) as { status: string }).status;
}

const toast = (page: Page) => page.locator('.toast');

test('demo 2: archive, undo, archive, search misses, restore, search hits @smoke', async ({
  api,
  page,
  webDeck,
}) => {
  const card = await createCard(api, webDeck, 'quetzal');
  const heading = page.getByRole('heading', { name: card.title });

  // archive from the card view, back on the deck with Undo
  await page.goto(webUrl(`/i/${card.id}`));
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(toast(page)).toContainText('Card archived');
  await expect(heading).toHaveCount(0);

  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(heading).toBeVisible();
  await expect.poll(() => itemState(api, card.id)).toBe('published');

  // archive again: search no longer finds it
  await page.goto(webUrl(`/i/${card.id}`));
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(toast(page)).toContainText('Card archived');
  await expect.poll(() => itemState(api, card.id)).toBe('archived');
  expect(await searchIds(api, webDeck, 'quetzal')).not.toContain(card.id);

  // Archived → Restore
  await page.goto(webUrl(`/d/${webDeck.slug}/archived`));
  await expect(heading).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(toast(page)).toContainText('Card restored');
  await expect(heading).toHaveCount(0);
  await expect.poll(() => itemState(api, card.id)).toBe('published');

  // search finds it again, in the UI too
  await page.goto(webUrl(`/d/${webDeck.slug}/search?q=quetzal`));
  await expect(heading).toBeVisible();
});

test('links to a deck or card the user cannot see show unavailable @smoke', async ({ page }) => {
  await page.goto(webUrl('/d/smoke-no-such-deck'));
  await expect(page.getByRole('heading', { name: 'Pocketbook unavailable' })).toBeVisible();

  await page.goto(webUrl('/i/00000000-0000-4000-8000-00000000dead'));
  await expect(page.getByRole('heading', { name: 'Card unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0);
});

test('delete asks first, undoes, and undeletes from Recently deleted @smoke', async ({
  api,
  page,
  webDeck,
}) => {
  const card = await createCard(api, webDeck, 'axolotl');
  const heading = page.getByRole('heading', { name: card.title });

  // cancelling the confirm keeps the card
  await page.goto(webUrl(`/i/${card.id}`));
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${card.id}$`));
  expect(await itemState(api, card.id)).toBe('published');

  // delete → Undo
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  await expect(toast(page)).toContainText('Card deleted');
  await expect(heading).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(heading).toBeVisible();
  await expect.poll(() => itemState(api, card.id)).toBe('published');

  // delete again → Recently deleted (D132 floors the days left, so seconds later it may read 29)
  await page.goto(webUrl(`/i/${card.id}`));
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(toast(page)).toContainText('Card deleted');
  await expect.poll(() => itemState(api, card.id)).toBe('gone');

  await page.goto(webUrl(`/d/${webDeck.slug}/archived`));
  const deleted = page.getByRole('region', { name: 'Recently deleted' });
  await expect(deleted.getByText(card.title)).toBeVisible();
  await expect(deleted.getByText(/^(30|29) days left$/)).toBeVisible();

  await deleted.getByRole('button', { name: 'Undelete' }).click();
  await expect(toast(page)).toContainText('Card restored');
  await expect.poll(() => itemState(api, card.id)).toBe('published');

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(heading).toBeVisible();
});
