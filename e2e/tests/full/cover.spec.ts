import type { APIRequestContext, Locator, Page } from '@playwright/test';
import {
  cloudinaryApiSecret,
  photoFile,
  recordMediaAsset,
  routeCloudName,
  routeFakeCloudinary,
  TINY_PNG,
} from '../../fixtures/cloudinary';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';
import {
  browseUrl,
  expectCurrent,
  fullView,
  MAIN,
  seedBrowseDeck,
  skipHint,
} from '../smoke/helpers/browse-deck';

/**
 * 044 card cover image (`@full`): the variants and edge cases around the smoke journey in
 * smoke/editor.spec.ts. Cloudinary is replaced at the network edge (`routeFakeCloudinary`); cards
 * with a cover are created through the API with an asset recorded for the deck (D160).
 */

// The service worker answers Cloudinary images itself, past `page.route`; block it so the fake serves.
test.use({ serviceWorkers: 'block' });

test.beforeEach(() => {
  test.skip(!cloudinaryApiSecret, 'CLOUDINARY_API_SECRET is not set (012 confirm step)');
});

const save = (page: Page) => page.getByRole('button', { name: 'Save' });
const coverField = (page: Page) => page.locator('.cover-field');
const closeLink = (page: Page) => page.getByRole('link', { name: 'Close' });

async function recordCover(api: APIRequestContext, deck: WebDeck): Promise<string> {
  const publicId = await recordMediaAsset(api, deck.id, {
    kind: 'image',
    format: 'png',
    width: 1200,
    height: 675,
  });
  if (!publicId) throw new Error('recording the cover asset needs CLOUDINARY_API_SECRET');
  return publicId;
}

async function createCovered(
  api: APIRequestContext,
  deck: WebDeck,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; publicId: string }> {
  const publicId = await recordCover(api, deck);
  const res = await api.post(`decks/${deck.slug}/items`, {
    data: { type: 'text', title, body: 'A card with a cover', cover: { publicId }, ...extra },
  });
  expect(res.status(), 'create covered card').toBe(201);
  return { id: ((await res.json()) as { id: string }).id, publicId };
}

async function readItem(api: APIRequestContext, id: string) {
  const res = await api.get(`items/${id}`);
  expect(res.status(), 'read item').toBe(200);
  return (await res.json()) as {
    status: string;
    title: string;
    cover: { publicId: string } | null;
  };
}

/** Holds Cloudinary image delivery until `release()`, so a test can measure before the load. */
async function gateDelivery(page: Page): Promise<() => void> {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://res.cloudinary.com/**', async (route) => {
    await gate;
    await route.fulfill({ contentType: 'image/png', body: TINY_PNG });
  });
  return release;
}

/**
 * D161: `.card__cover` is the CloudImage wrapper; its sharp image's `load` adds `--loaded`.
 * Not `naturalWidth`: the fake 1×1 PNG answers a `w_1080` srcset candidate, so it reports 0.
 */
const loaded = (cover: Locator) => expect(cover).toHaveClass(/\bcloud-image--loaded\b/);

/** A drop or paste carrying one image, dispatched on `target`. */
async function transfer(target: Locator, kind: 'drop' | 'paste') {
  await target.evaluate(
    (el, { png, kind }) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(png)], 'image.png', { type: 'image/png' }));
      const init = { bubbles: true, cancelable: true };
      el.dispatchEvent(
        kind === 'drop'
          ? new DragEvent('drop', { ...init, dataTransfer: data })
          : new ClipboardEvent('paste', { ...init, clipboardData: data }),
      );
    },
    { png: [...TINY_PNG], kind },
  );
}

test('a cover is replaced and then removed from the editor @full', async ({
  page,
  api,
  webDeck,
}) => {
  const { id, publicId } = await createCovered(api, webDeck, `Replace ${webDeck.slug}`);
  const next = `gobbit/items/${webDeck.id}/e2e-replaced`;
  await routeFakeCloudinary(page, next);

  await page.goto(webUrl(`/i/${id}/edit`));
  await page.getByLabel('Replace cover image').setInputFiles(photoFile);
  await expect(page.getByRole('button', { name: 'Remove cover image' })).toBeVisible();
  await save(page).click();
  await expect.poll(async () => (await readItem(api, id)).cover?.publicId).toBe(next);
  expect(next).not.toBe(publicId);

  await page.goto(webUrl(`/i/${id}/edit`));
  await page.getByRole('button', { name: 'Remove cover image' }).click();
  await expect(page.getByLabel('Add cover image')).toBeAttached();
  await save(page).click();
  await expect.poll(async () => (await readItem(api, id)).cover).toBeNull();
});

test('a failed upload keeps the old cover and Save still works @full', async ({
  page,
  api,
  webDeck,
}) => {
  const { id, publicId } = await createCovered(api, webDeck, `Failing ${webDeck.slug}`);
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-never`);
  // Registered last, so it wins over the fake upload answer.
  await page.route('https://api.cloudinary.com/**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );

  await page.goto(webUrl(`/i/${id}/edit`));
  await page.getByLabel('Replace cover image').setInputFiles(photoFile);
  await expect(coverField(page).getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove cover image' })).toBeVisible();

  const title = `Failing, renamed ${webDeck.slug}`;
  await page.getByLabel('Title', { exact: true }).fill(title);
  await save(page).click();
  await expect.poll(async () => (await readItem(api, id)).title).toBe(title);
  expect((await readItem(api, id)).cover?.publicId).toBe(publicId);
});

test('a restored draft keeps its cover @full', async ({ page, webDeck }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-draft`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  await page.getByLabel('Title', { exact: true }).fill('Draft with a cover');
  await page.getByLabel('Add cover image').setInputFiles(photoFile);
  await expect(page.getByRole('button', { name: 'Remove cover image' })).toBeVisible();

  // The attempt to leave writes the draft at once (D204); Escape keeps editing.
  await closeLink(page).click();
  await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove cover image' })).toBeVisible();
});

test('switching to a type without a cover warns and drops it @full', async ({ page, webDeck }) => {
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-switch`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  await page.getByLabel('Title', { exact: true }).fill('Switching');
  await page.getByLabel('Add cover image').setInputFiles(photoFile);
  await expect(page.getByRole('button', { name: 'Remove cover image' })).toBeVisible();

  await page.getByRole('button', { name: 'Card type: Text' }).click();
  await page.getByRole('radio', { name: /^Link/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Switch to Link?' });
  await expect(confirm).toContainText('cover image');
  await confirm.getByRole('button', { name: 'Switch' }).click();
  await expect(page.getByLabel('Add cover image')).toHaveCount(0);

  await page.getByRole('button', { name: 'Card type: Link' }).click();
  await page.getByRole('radio', { name: /^Text/ }).click();
  // D303: the Link card is empty, so there is nothing to lose and no confirmation.
  await expect(page.getByRole('dialog', { name: 'Switch to Text?' })).toHaveCount(0);
  // Back on Text: the cover did not come back.
  await expect(page.getByLabel('Add cover image')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Remove cover image' })).toHaveCount(0);
});

test('link and media cards offer no cover image @full', async ({ page, webDeck }) => {
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-none`);
  for (const type of ['link', 'media']) {
    await page.goto(webUrl(`/d/${webDeck.slug}/new?type=${type}`));
    await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Add cover image')).toHaveCount(0);
    await expect(page.getByText('Add image')).toHaveCount(0);
  }
});

test('Browse and the full view show the cover without the card moving @full', async ({
  page,
  api,
  smokeDeck,
}) => {
  const deck = await seedBrowseDeck(api, smokeDeck);
  const title = `Browse cover ${deck.slug}`;
  const publicId = await recordCover(api, { ...smokeDeck, items: [] });
  const res = await api.post(`decks/${deck.slug}/items`, {
    data: { type: 'text', title, body: 'Covered', categoryIds: [deck.mainId], cover: { publicId } },
  });
  expect(res.status(), 'create covered card').toBe(201);
  const card = { id: ((await res.json()) as { id: string }).id, title };

  await skipHint(page);
  await routeCloudName(page, 'e2e-cloud');
  const release = await gateDelivery(page);
  await page.goto(browseUrl(deck.slug, `c=${MAIN.slug}&i=${card.id}`));
  await expectCurrent(page, card);

  const cover = page.locator('.browse__stage .card__cover');
  await expect(cover).toBeAttached();
  const before = await cover.boundingBox();
  release();
  await loaded(cover);
  expect(await cover.boundingBox()).toEqual(before);

  await page.getByRole('button', { name: 'Full view', exact: true }).click();
  const full = fullView(page, title);
  await expect(full.locator('.card__cover')).toBeVisible();
});

test('a proposal gets a cover in review and publishes with it @full', async ({
  page,
  api,
  webDeck,
}) => {
  const cats = await api.get(`decks/${webDeck.id}/categories`);
  const { data } = (await cats.json()) as { data: { id: string; isDefault: boolean }[] };
  const title = `Proposed cover ${webDeck.slug}`;
  const res = await api.post(`decks/${webDeck.slug}/items`, {
    data: {
      type: 'text',
      title,
      body: 'Proposed by the e2e test',
      status: 'proposed',
      categoryIds: data.filter((c) => c.isDefault).map((c) => c.id),
    },
  });
  expect(res.status(), 'create proposal').toBe(201);
  const { id } = (await res.json()) as { id: string };
  const uploaded = `gobbit/items/${webDeck.id}/e2e-review`;
  await routeFakeCloudinary(page, uploaded);

  await page.goto(webUrl(`/d/${webDeck.slug}/review`));
  // "Edit fully" lives in the card's More actions menu; the bar's Edit edits in place.
  await page
    .getByRole('article', { name: title })
    .getByRole('button', { name: 'More actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Edit fully' }).click();
  await page.getByLabel('Add cover image').setInputFiles(photoFile);
  await expect(page.getByRole('button', { name: 'Remove cover image' })).toBeVisible();
  await save(page).click();
  await expect(page).toHaveURL(new RegExp(`/d/${webDeck.slug}/review$`));

  await page.getByRole('article', { name: title }).getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('article', { name: title })).toHaveCount(0);
  const item = await readItem(api, id);
  expect(item.status).toBe('published');
  expect(item.cover?.publicId).toBe(uploaded);
});

test('an image dropped on the cover field becomes the cover @full', async ({ page, webDeck }) => {
  const uploads = await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-drop`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  await transfer(coverField(page), 'drop');
  await expect(page.getByRole('button', { name: 'Remove cover image' })).toBeVisible();
  expect(uploads).toHaveLength(1);
});

test('a paste on the cover field is the cover; elsewhere it is the link photo @full', async ({
  page,
  webDeck,
}) => {
  const uploads = await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-paste`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=event`));
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/event');

  const picker = coverField(page).locator('input[type="file"]');
  await picker.focus();
  await transfer(picker, 'paste');
  await expect(page.getByRole('button', { name: 'Remove cover image' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);
  expect(uploads).toHaveLength(1);

  await transfer(page.getByLabel('Title', { exact: true }), 'paste');
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  expect(uploads).toHaveLength(2);
});

test('an event with a link and a cover shows one image @full', async ({ page, api, webDeck }) => {
  const title = `Event cover ${webDeck.slug}`;
  const publicId = await recordCover(api, webDeck);
  const start = new Date(Math.ceil((Date.now() + 5 * 86_400_000) / 60_000) * 60_000);
  const res = await api.post(`decks/${webDeck.slug}/items`, {
    data: {
      type: 'event',
      title,
      cover: { publicId },
      payload: {
        allDay: false,
        start: start.toISOString(),
        timeZone: 'UTC',
        url: 'https://example.com/event',
        preview: { title: 'The event page', image: 'https://example.com/event.png' },
      },
    },
  });
  expect(res.status(), 'create event').toBe(201);
  await routeFakeCloudinary(page, publicId);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(card.locator('.card__cover')).toBeVisible();
  await expect(card.locator('img')).toHaveCount(1);
});

test('a broken cover image leaves the card without the bar @full', async ({
  page,
  api,
  webDeck,
}) => {
  const title = `Broken cover ${webDeck.slug}`;
  await createCovered(api, webDeck, title);
  await routeCloudName(page, 'e2e-cloud');
  await page.route('https://res.cloudinary.com/**', (route) => route.abort());

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.locator('.card__cover')).toHaveCount(0);
});

/** SC-002: the box comes from the stored dimensions, so the image arriving moves nothing. */
test('at 360px a covered card keeps its box while the image loads @full', async ({
  page,
  api,
  webDeck,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const covered = `Covered ${webDeck.slug}`;
  const plain = webDeck.items.find((item) => item.type === 'text')!.title;
  await createCovered(api, webDeck, covered);
  await routeCloudName(page, 'e2e-cloud');
  const release = await gateDelivery(page);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const coveredCard = page.getByRole('article').filter({ hasText: covered });
  const plainCard = page.getByRole('article').filter({ hasText: plain });
  const cover = coveredCard.locator('.card__cover');
  await expect(cover).toBeAttached();
  // The calc card above the plain one shows its result block (about 150 px) only once the lazily loaded
  // calc code arrives. Wait for it, or that growth lands between the two measurements and moves the plain card.
  await expect(page.getByText('Total grams')).toBeVisible();
  const before = { covered: await coveredCard.boundingBox(), plain: await plainCard.boundingBox() };
  expect(before.covered).not.toBeNull();

  release();
  await loaded(cover);
  expect(await coveredCard.boundingBox()).toEqual(before.covered);
  expect(await plainCard.boundingBox()).toEqual(before.plain);
});
