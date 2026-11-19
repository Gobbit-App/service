import { createHash } from 'node:crypto';
import {
  devices,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { expect, type Identity, type SmokeDeck } from '../../../fixtures/identity';
import { CLOUDINARY_DUMMY } from '../../../lib/stack-config';
import { stack, webUrl } from '../../../lib/stack';

// Helpers of profile.spec.ts. The browse and Cloudinary pieces mirror smoke/helpers/browse-deck.ts and
// fixtures/cloudinary.ts, which still read process.env through the old fixtures; dedupe when T030/T032
// convert those.

const { defaultBrowserType: _ignored, ...PIXEL_7 } = devices['Pixel 7'];

/** A Pixel 7 context signed in as `identity` (the identity's own context is not device-emulated). */
export async function phoneContext(
  browser: Browser,
  identity: Identity,
  serviceWorkers: 'allow' | 'block',
): Promise<BrowserContext> {
  return browser.newContext({
    ...PIXEL_7,
    baseURL: stack.webUrl,
    serviceWorkers,
    storageState: await identity.api.storageState(),
  });
}

/* ------------------------------------ browse deck ------------------------------------------- */

const HINT_KEY = 'gobbit:browse-hint:v3';
export const MAIN = { name: 'Browse main', slug: 'browse-main' } as const;
const OTHER = { name: 'Browse other', slug: 'browse-other' } as const;
const MAIN_CARDS = 25;
const OTHER_CARDS = 3;

export interface CardRef {
  id: string;
  title: string;
}

export interface BrowseDeck {
  slug: string;
  mainId: string;
  cards: CardRef[];
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
  card: { title: string; categoryIds: string[] },
): Promise<string> {
  const res = await api.post(`decks/${deckSlug}/items`, {
    data: { type: 'text', body: `Body of ${card.title}`, ...card },
  });
  expect(res.status(), `create ${card.title}`).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** 25 cards in one category and a small second one (the archived card of the smoke helper is not needed). */
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
  const list = await api.get(`decks/${deck.slug}/items?category=${MAIN.slug}&limit=50`);
  expect(list.status(), 'list main cards').toBe(200);
  const { data } = (await list.json()) as { data: CardRef[] };
  expect(data).toHaveLength(MAIN_CARDS);
  return { slug: deck.slug, mainId, cards: data.map(({ id, title }) => ({ id, title })) };
}

export const browseUrl = (slug: string, query: string) => webUrl(`/d/${slug}/browse?${query}`);

export const skipHint = (page: Page) =>
  page.addInitScript((key) => localStorage.setItem(key, 'dismissed'), HINT_KEY);

export async function expectCurrent(page: Page, card: CardRef): Promise<void> {
  await expect(
    page.locator('.browse__stage').getByRole('heading', { name: card.title }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`i=${card.id}`));
}

export const dockButton = (page: Page, label: 'Previous card' | 'Next card' | 'Full view') =>
  page.getByRole('button', { name: label, exact: true });

export const fullView = (page: Page, title: string) => page.getByRole('dialog', { name: title });

/* ------------------------------------ fake Cloudinary --------------------------------------- */

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
export const photoFile = { name: 'photo.png', mimeType: 'image/png', buffer: TINY_PNG };

const AVATAR_SIGN = {
  kind: 'image',
  uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_DUMMY.cloudName}/image/upload`,
  apiKey: CLOUDINARY_DUMMY.apiKey,
  signature: 'e2e-signature',
  tags: 'profile',
  allowedFormats: 'jpg,png,webp,heic,heif',
  maxBytes: 8 * 1024 * 1024,
};

/**
 * Cloudinary and the profile-photo permission, answered locally (D133). The upload answer is signed
 * with the stack's dummy secret, so the real confirm verifies it and records the asset (the id must
 * sit in the member's folder). Returns the public id the upload answers with.
 */
export async function routeFakeAvatar(
  page: Page,
  api: APIRequestContext,
  name: string,
): Promise<string> {
  const me = (await (await api.get('me')).json()) as { user: { id: string } };
  const folder = `gobbit/profiles/${me.user.id}`;
  const publicId = `${folder}/e2e-${name}`;
  const version = Math.floor(Date.now() / 1000);
  const signature = createHash('sha1')
    .update(`public_id=${publicId}&version=${version}${CLOUDINARY_DUMMY.apiSecret}`)
    .digest('hex');

  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      json: { ...config, cloudinaryCloudName: CLOUDINARY_DUMMY.cloudName },
    });
  });
  await page.route('**/api/me/avatar/sign', (route) =>
    route.fulfill({
      json: {
        ...AVATAR_SIGN,
        timestamp: Math.floor(Date.now() / 1000),
        folder,
        expiresAt: new Date(Date.now() + 50 * 60_000).toISOString(),
      },
    }),
  );
  await page.route('https://api.cloudinary.com/**', (route) =>
    route.fulfill({
      json: {
        public_id: publicId,
        version,
        signature,
        resource_type: 'image',
        bytes: TINY_PNG.length,
        format: 'png',
        width: 1,
        height: 1,
      },
    }),
  );
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
  return publicId;
}
