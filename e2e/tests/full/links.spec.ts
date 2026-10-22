import type { Page, Route } from '@playwright/test';
import { cloudinaryApiSecret, photoFile, routeFakeCloudinary } from '../../fixtures/cloudinary';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';

/**
 * D165 link flags (014 T042, `@full`). A real flag needs two failed daily checks, so the flag is
 * seeded at the network layer: the card's API responses gain `linkHealth`, `flag=link` lists it,
 * and `DELETE …/link-check/flag` is answered here. Everything else is the real API.
 */
const HEALTH = { status: 'dead', checkedAt: '2026-10-20T06:30:00.000Z' } as const;

type Json = Record<string, unknown>;

interface FlagSeed {
  dismissed: () => boolean;
}

function linkCard(deck: WebDeck) {
  const card = deck.items.find((item) => item.type === 'link');
  if (!card) throw new Error('the web deck has no link card');
  return card;
}

async function patchJson(route: Route, edit: (body: Json) => Json): Promise<void> {
  const response = await route.fetch();
  const body = (await response.json()) as Json;
  await route.fulfill({ response, json: edit(body) });
}

/** Flags `itemId` in every API response the page reads until it is dismissed. */
async function seedFlag(page: Page, itemId: string, { role }: { role?: string } = {}) {
  let dismissed = false;
  const flag = (item: Json): Json =>
    item.id === itemId && !dismissed ? { ...item, linkHealth: HEALTH } : item;

  await page.route(new RegExp(`/api/items/${itemId}$`), (route) =>
    route.request().method() === 'GET' ? patchJson(route, flag) : route.fallback(),
  );
  await page.route(new RegExp(`/api/items/${itemId}/link-check/flag$`), async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    dismissed = true;
    await route.fulfill({ status: 204 });
  });
  await page.route(/\/api\/decks\/[^/]+\/items(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const flagged = new URL(route.request().url()).searchParams.get('flag') === 'link';
    if (!flagged) {
      return patchJson(route, (page) => ({ ...page, data: (page.data as Json[]).map(flag) }));
    }
    // The real flagged list is empty; it holds the seeded card while the flag is active.
    const unfiltered = new URL(route.request().url());
    unfiltered.searchParams.delete('flag');
    const response = await route.fetch({ url: unfiltered.toString() });
    const all = (await response.json()) as { data: Json[] };
    const data = dismissed ? [] : all.data.filter((item) => item.id === itemId).map(flag);
    await route.fulfill({ response, json: { data, nextCursor: null } });
  });
  if (role) {
    await page.route(/\/api\/decks\/[^/?]+(\?.*)?$/, (route) =>
      route.request().method() === 'GET'
        ? patchJson(route, (deck) => ({ ...deck, role }))
        : route.fallback(),
    );
  }
  return { dismissed: () => dismissed } satisfies FlagSeed;
}

test('a flagged link shows its note; Dismiss clears it from "Links to check" @full', async ({
  page,
  webDeck,
}) => {
  const card = linkCard(webDeck);
  const seed = await seedFlag(page, card.id);

  await page.goto(webUrl(`/d/${webDeck.slug}/links`));
  await expect(page.getByRole('link', { name: 'Links to check' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText(card.title)).toBeVisible();
  await expect(page.getByText('Link may be dead')).toBeVisible();

  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.toast')).toContainText('Note dismissed');
  expect(seed.dismissed()).toBe(true);
  await expect(page.getByText('No links to check')).toBeVisible();
  await expect(page.getByText('Link may be dead')).toHaveCount(0);
});

test('"Links to check" is empty when nothing is flagged @full', async ({ page, webDeck }) => {
  await page.goto(webUrl(`/d/${webDeck.slug}/links`));
  await expect(page.getByText('No links to check')).toBeVisible();
});

test('a reader sees the note but no actions and no "Links to check" @full', async ({
  page,
  webDeck,
}) => {
  const card = linkCard(webDeck);
  await seedFlag(page, card.id, { role: 'reader' });

  await page.goto(webUrl(`/i/${card.id}`));
  await expect(page.getByText('Link may be dead')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check again' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect(page.getByText('Link may be dead')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Links to check' })).toHaveCount(0);
});

/** 015 locked social hosts (T050, `@full`). */
const INSTAGRAM_URL = 'https://www.instagram.com/p/e2e-locked/';

test('a link to a locked host shows the host label instead of the domain @full', async ({
  page,
  api,
  webDeck,
}) => {
  const title = `Locked ${webDeck.slug}`;
  const res = await api.post(`decks/${webDeck.slug}/items`, {
    data: { type: 'link', title, payload: { url: INSTAGRAM_URL, preview: { title: 'A reel' } } },
  });
  expect(res.status()).toBe(201);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(card.locator('.link-card__host')).toHaveText('Instagram');
  await expect(card).not.toContainText('instagram.com');
});

test('Add photo on a locked-host link is saved; Remove photo takes it off @full', async ({
  page,
  webDeck,
}) => {
  // Saving needs the asset recorded by the real API (D160), so the upload answer must verify.
  test.skip(!cloudinaryApiSecret, 'CLOUDINARY_API_SECRET is not set (012 confirm step)');
  const title = `Locked photo ${webDeck.slug}`;
  const uploads = await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-link-photo`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=link`));

  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('URL', { exact: true }).fill(INSTAGRAM_URL);
  await page.getByLabel('Preview title', { exact: true }).fill('A reel');
  await page.getByLabel('Add photo').setInputFiles(photoFile);
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  expect(uploads).toHaveLength(1);

  const created = page.waitForResponse(
    (r) => /\/api\/decks\/[^/]+\/items$/.test(r.url()) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save card' }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const item = (await response.json()) as { id: string; payload: { preview?: Json } };
  expect(item.payload.preview).toMatchObject({
    publicId: `gobbit/items/${webDeck.id}/e2e-link-photo`,
  });

  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}$`));
  const listed = page.getByRole('article').filter({ hasText: title });
  await expect(listed.locator('img.cloud-image__img')).toBeVisible();

  await page.goto(webUrl(`/i/${item.id}/edit`));
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByLabel('Add photo')).toBeAttached();
  await page.getByRole('button', { name: 'Save card' }).click();
  await expect(page).toHaveURL(new RegExp(`/i/${item.id}$`));
  await expect(page.locator('.link-card img')).toHaveCount(0);
});
