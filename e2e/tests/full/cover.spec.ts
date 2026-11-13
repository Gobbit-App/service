import type { APIRequestContext, Locator, Page } from '@playwright/test';
import {
  cloudinaryApiSecret,
  photoFile,
  recordAsset,
  routeCloudName,
  routeFakeCloudinary,
  routeImageDelivery,
  TINY_PNG,
} from '../../fixtures/cloudinary';
import { expect, test, webUrl, type WebDeck } from '../../fixtures/web';
import { browseUrl, dockButton, skipHint } from '../smoke/helpers/browse-deck';
import { swipeCard } from '../smoke/helpers/swipe';

/**
 * 044 card cover image (`@full`): the editor field (replace, remove, failed upload, draft, type
 * switch, drop, paste), the bar in the list, the review queue and Browse. The core journey (add a
 * cover, see the bar) is `@smoke` in smoke/editor.spec.ts. Only Cloudinary is faked; the API
 * records the assets and writes the covers for real (D157, D160).
 */
test.skip(!cloudinaryApiSecret, 'CLOUDINARY_API_SECRET is not set (012 confirm step)');

const coverInput = (page: Page) => page.locator('.cover-field input[type="file"]');
const removeImage = (page: Page) => page.getByRole('button', { name: 'Remove image' });
const save = (page: Page) => page.getByRole('button', { name: 'Save' });
const publicIdOf = (deck: WebDeck, name: string) => `gobbit/items/${deck.id}/${name}`;

type Cover = { publicId: string; width?: number; height?: number };

async function createItem(
  api: APIRequestContext,
  deck: WebDeck,
  data: Record<string, unknown>,
): Promise<string> {
  const res = await api.post(`decks/${deck.slug}/items`, { data });
  expect(res.status(), `create ${String(data.title)}`).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function coverOf(api: APIRequestContext, id: string): Promise<Cover | null> {
  const res = await api.get(`items/${id}`);
  expect(res.status(), 'get item').toBe(200);
  return ((await res.json()) as { cover?: Cover | null }).cover ?? null;
}

async function dropFile(target: Locator) {
  await target.evaluate(
    (el, png) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(png)], 'drop.png', { type: 'image/png' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        el.dispatchEvent(
          new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }),
        );
      }
    },
    [...TINY_PNG],
  );
}

async function paste(target: Locator) {
  await target.evaluate(
    (el, png) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(png)], 'image.png', { type: 'image/png' }));
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    },
    [...TINY_PNG],
  );
}

/** Holds every Cloudinary image answer until `release()`, to measure a card before its images load. */
async function holdImageDelivery(page: Page) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route('https://res.cloudinary.com/**', async (route) => {
    await released;
    await route.fulfill({ contentType: 'image/png', body: TINY_PNG });
  });
  return release;
}

test.describe('editor', () => {
  test('a cover is replaced, then removed @full', async ({ page, api, webDeck }) => {
    const first = await recordAsset(api, webDeck.id, 'e2e-cover-a');
    const second = publicIdOf(webDeck, 'e2e-cover-b');
    const id = await createItem(api, webDeck, {
      type: 'text',
      title: `Cover swap ${webDeck.slug}`,
      body: 'Body',
      cover: { publicId: first },
    });
    await routeFakeCloudinary(page, second);

    await page.goto(webUrl(`/i/${id}/edit`));
    await expect(page.locator('.cover-field__preview .card__cover')).toBeVisible();
    await expect(page.getByText('Replace image')).toBeVisible();
    await coverInput(page).setInputFiles(photoFile);
    await expect(page.getByText('Uploading…')).toHaveCount(0);
    await save(page).click();
    await expect(page).toHaveURL(new RegExp(`/i/${id}$`));
    expect((await coverOf(api, id))?.publicId).toBe(second);

    await page.goto(webUrl(`/i/${id}/edit`));
    await removeImage(page).click();
    await expect(page.locator('.cover-field__preview')).toHaveCount(0);
    await expect(page.getByText('Add image')).toBeVisible();
    await save(page).click();
    await expect(page).toHaveURL(new RegExp(`/i/${id}$`));
    expect(await coverOf(api, id)).toBeNull();

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    await expect(page.getByRole('article', { name: `Cover swap ${webDeck.slug}` })).toBeVisible();
    await expect(page.locator('.card__cover')).toHaveCount(0);
  });

  test('a failed upload keeps the old cover and Save still works @full', async ({
    page,
    api,
    webDeck,
  }) => {
    const old = await recordAsset(api, webDeck.id, 'e2e-cover-a');
    const id = await createItem(api, webDeck, {
      type: 'text',
      title: `Cover keep ${webDeck.slug}`,
      body: 'Body',
      cover: { publicId: old },
    });
    await routeFakeCloudinary(page, publicIdOf(webDeck, 'e2e-cover-b'));
    // Registered last, so it wins over the accepting fake above.
    await page.route('https://api.cloudinary.com/**', (route) =>
      route.fulfill({
        status: 400,
        json: { error: { message: 'Resolution too high. Maximum allowed is 25 Megapixels' } },
      }),
    );

    await page.goto(webUrl(`/i/${id}/edit`));
    await coverInput(page).setInputFiles(photoFile);
    await expect(
      page.getByText("This photo's resolution is too high.", { exact: false }),
    ).toBeVisible();
    await expect(page.locator('.cover-field__preview .card__cover')).toBeVisible();

    const title = `Cover kept ${webDeck.slug}`;
    await page.getByLabel('Title', { exact: true }).fill(title);
    await expect(save(page)).toBeEnabled();
    await save(page).click();
    await expect(page).toHaveURL(new RegExp(`/i/${id}$`));
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    expect((await coverOf(api, id))?.publicId).toBe(old);
  });

  test('an unsaved cover comes back after a reload @full', async ({ page, webDeck }) => {
    await routeFakeCloudinary(page, publicIdOf(webDeck, 'e2e-cover'));
    page.on('dialog', (dialog) => void dialog.accept());
    await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
    await page.getByLabel('Title', { exact: true }).fill('Half-written');
    await coverInput(page).setInputFiles(photoFile);
    await expect(removeImage(page)).toBeVisible();
    // Autosave is debounced (500 ms); wait for it before leaving.
    await page.waitForTimeout(800);

    await page.reload();
    await expect(page.getByText('Restore unsaved draft?')).toBeVisible();
    await expect(page.locator('.cover-field__preview')).toHaveCount(0);
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Half-written');
    await expect(page.locator('.cover-field__preview .card__cover')).toBeVisible();
    await expect(removeImage(page)).toBeVisible();
  });

  test('switching a new card to Link drops the cover after a warning; Table keeps it @full', async ({
    page,
    webDeck,
  }) => {
    await routeFakeCloudinary(page, publicIdOf(webDeck, 'e2e-cover'));
    const typeButton = page.getByRole('button', { name: /^Card type/ });
    const pickType = async (name: string) => {
      await typeButton.click();
      await page.getByRole('radio', { name }).click();
    };

    await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
    await coverInput(page).setInputFiles(photoFile);
    await expect(removeImage(page)).toBeVisible();
    await pickType('Link');
    const confirm = page.getByRole('dialog', { name: 'Switch to Link?' });
    await expect(confirm).toContainText('The cover image will be removed too.');
    await confirm.getByRole('button', { name: 'Switch' }).click();
    await expect(page.getByRole('button', { name: 'Card type: Link' })).toBeVisible();
    await expect(page.locator('.cover-field')).toHaveCount(0);

    // Table can carry a cover (no confirmation, nothing is lost).
    await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
    await coverInput(page).setInputFiles(photoFile);
    await expect(removeImage(page)).toBeVisible();
    await pickType('Table');
    await expect(page.getByRole('button', { name: 'Card type: Table' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.cover-field__preview .card__cover')).toBeVisible();
  });

  test('link and photo cards have no cover field @full', async ({ page, webDeck }) => {
    await routeCloudName(page, 'e2e-cloud');
    for (const type of ['link', 'image']) {
      await page.goto(webUrl(`/d/${webDeck.slug}/new?type=${type}`));
      await expect(
        page.getByRole('button', { name: `Card type: ${type}`, exact: false }),
      ).toBeVisible();
      await expect(page.getByText('Add image')).toHaveCount(0);
      await expect(page.locator('.cover-field')).toHaveCount(0);
    }
  });

  test('dropping a file on the field sets the cover @full', async ({ page, webDeck }) => {
    const uploads = await routeFakeCloudinary(page, publicIdOf(webDeck, 'e2e-cover'));
    await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
    await expect(removeImage(page)).toHaveCount(0);

    await dropFile(page.locator('.cover-field'));
    await expect(removeImage(page)).toBeVisible();
    expect(uploads).toHaveLength(1);
    await expect(page.locator('.cover-field__preview .card__cover')).toBeVisible();
  });

  test('on an event a paste goes to the cover field only while it has focus @full', async ({
    page,
    webDeck,
  }) => {
    const uploads = await routeFakeCloudinary(page, publicIdOf(webDeck, 'e2e-cover'));
    await page.goto(webUrl(`/d/${webDeck.slug}/new?type=event`));
    await expect(page.getByRole('button', { name: 'Card type: Event' })).toBeVisible();
    const removePhoto = page.getByRole('button', { name: 'Remove photo' });

    // Focus elsewhere: the link photo takes the paste.
    await paste(page.getByLabel('Where (optional)'));
    await expect(removePhoto).toBeVisible();
    await expect(removeImage(page)).toHaveCount(0);
    expect(uploads).toHaveLength(1);
    await removePhoto.click();

    // Inside the cover field: the cover takes it, the link photo does not.
    await paste(coverInput(page));
    await expect(removeImage(page)).toBeVisible();
    await expect(removePhoto).toHaveCount(0);
    expect(uploads).toHaveLength(2);
  });
});

test.describe('lists', () => {
  test('an event with a link and a cover shows exactly one image @full', async ({
    page,
    api,
    webDeck,
  }) => {
    const title = `Event cover ${webDeck.slug}`;
    const cover = await recordAsset(api, webDeck.id, 'e2e-cover');
    await routeCloudName(page, 'e2e-cloud');
    await routeImageDelivery(page);
    await page.route('https://pics.example.test/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
    );
    await createItem(api, webDeck, {
      type: 'event',
      title,
      cover: { publicId: cover },
      payload: {
        allDay: false,
        start: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        timeZone: 'UTC',
        url: 'https://example.com/tickets',
        preview: { title: 'Tickets', image: 'https://pics.example.test/ticket.png' },
      },
    });

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    const card = page.getByRole('article', { name: title });
    await expect(card.locator('.card__cover .cloud-image__img')).toBeVisible();
    await expect(card.locator('.link-card__image')).toHaveCount(0);
    // The link keeps its title and Open button; only the cover is an image.
    await expect(card.locator('.link-card')).toContainText('Tickets');
    await expect(card.getByRole('link', { name: /open/i })).toBeVisible();
    await expect(card.locator('img:not([aria-hidden="true"])')).toHaveCount(1);
  });

  test('an event whose cover fails shows the link image instead @full', async ({
    page,
    api,
    webDeck,
  }) => {
    const title = `Event cover fails ${webDeck.slug}`;
    const cover = await recordAsset(api, webDeck.id, 'e2e-cover');
    await routeCloudName(page, 'e2e-cloud');
    await page.route('https://res.cloudinary.com/**', (route) =>
      route.fulfill({ status: 404, body: 'not found' }),
    );
    await page.route('https://pics.example.test/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
    );
    await createItem(api, webDeck, {
      type: 'event',
      title,
      cover: { publicId: cover },
      payload: {
        allDay: false,
        start: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        timeZone: 'UTC',
        url: 'https://example.com/tickets',
        preview: { title: 'Tickets', image: 'https://pics.example.test/ticket.png' },
      },
    });

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    const card = page.getByRole('article', { name: title });
    await expect(card.locator('.link-card__image')).toBeVisible();
    await expect(card.locator('.card__cover')).toHaveCount(0);
    await expect(card.locator('.event-card__placeholder')).toHaveCount(0);
  });

  test('an event shows the generic image only when it has no cover and no link image @full', async ({
    page,
    api,
    webDeck,
  }) => {
    const bare = `Event bare ${webDeck.slug}`;
    const covered = `Event covered ${webDeck.slug}`;
    const cover = await recordAsset(api, webDeck.id, 'e2e-cover');
    await routeCloudName(page, 'e2e-cloud');
    await routeImageDelivery(page);
    const payload = {
      allDay: false,
      start: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      timeZone: 'UTC',
    };
    await createItem(api, webDeck, { type: 'event', title: bare, payload });
    await createItem(api, webDeck, {
      type: 'event',
      title: covered,
      cover: { publicId: cover },
      payload,
    });

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    const bareCard = page.getByRole('article', { name: bare });
    await expect(bareCard.locator('.event-card__placeholder')).toBeVisible();
    await expect(bareCard.locator('.card__cover')).toHaveCount(0);
    const coveredCard = page.getByRole('article', { name: covered });
    await expect(coveredCard.locator('.card__cover .cloud-image__img')).toBeVisible();
    await expect(coveredCard.locator('.event-card__placeholder')).toHaveCount(0);
  });

  test('a cover that 404s renders no bar @full', async ({ page, api, webDeck }) => {
    const title = `Cover broken ${webDeck.slug}`;
    const cover = await recordAsset(api, webDeck.id, 'e2e-cover');
    await createItem(api, webDeck, {
      type: 'text',
      title,
      body: 'Body',
      cover: { publicId: cover },
    });
    await routeCloudName(page, 'e2e-cloud');
    await page.route('https://res.cloudinary.com/**', (route) =>
      route.fulfill({ status: 404, body: 'not found' }),
    );

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    const card = page.getByRole('article', { name: title });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Body');
    await expect(card.locator('.card__cover')).toHaveCount(0);
  });

  test('at 360 px the bar keeps its box from before the image loads @full', async ({
    page,
    api,
    webDeck,
  }) => {
    const title = `Cover box ${webDeck.slug}`;
    const cover = await recordAsset(api, webDeck.id, 'e2e-cover');
    await createItem(api, webDeck, {
      type: 'text',
      title,
      body: 'Body',
      cover: { publicId: cover },
    });
    await page.setViewportSize({ width: 360, height: 740 });
    await routeCloudName(page, 'e2e-cloud');
    const release = await holdImageDelivery(page);

    await page.goto(webUrl(`/d/${webDeck.slug}`));
    const bar = page.getByRole('article', { name: title }).locator('.card__cover');
    await expect(bar).toBeVisible();
    const before = await bar.boundingBox();
    expect(before!.height).toBeGreaterThan(20);

    release();
    await expect(bar).toHaveClass(/cloud-image--loaded/);
    const after = await bar.boundingBox();
    expect(after!.height).toBeCloseTo(before!.height, 0);
    expect(after!.width).toBeCloseTo(before!.width, 0);
  });
});

test.describe('review queue', () => {
  test('a proposal with a cover shows it, and the published card keeps it @full', async ({
    page,
    api,
    webDeck,
  }) => {
    const title = `Proposal cover ${webDeck.slug}`;
    const cats = await api.get(`decks/${webDeck.id}/categories`);
    const { data } = (await cats.json()) as { data: { id: string; isDefault: boolean }[] };
    const id = await createItem(api, webDeck, {
      type: 'text',
      title,
      body: 'Shared from the cover test',
      status: 'proposed',
      categoryIds: data.filter((c) => c.isDefault).map((c) => c.id),
    });
    const cover = await recordAsset(api, webDeck.id, 'e2e-cover');
    const patched = await api.patch(`items/${id}`, { data: { cover: { publicId: cover } } });
    expect(patched.status(), 'add the cover to the proposal').toBe(200);
    await routeCloudName(page, 'e2e-cloud');
    await routeImageDelivery(page);

    await page.goto(webUrl(`/d/${webDeck.slug}/review`));
    const proposal = page.getByRole('article', { name: title });
    await expect(proposal.locator('.card__cover')).toBeVisible();
    const heading = await proposal.getByRole('heading', { name: title }).boundingBox();
    const bar = await proposal.locator('.card__cover').boundingBox();
    expect(heading!.y).toBeLessThan(bar!.y);

    await proposal.getByRole('button', { name: 'Publish' }).click();
    await expect(proposal).toHaveCount(0);
    await page.goto(webUrl(`/d/${webDeck.slug}`));
    await expect(page.getByRole('article', { name: title }).locator('.card__cover')).toBeVisible();
  });
});

test.describe('browse', () => {
  test('swiping to a card with a cover shows the bar without a layout shift @full', async ({
    page,
    api,
    webDeck,
  }) => {
    test.setTimeout(60_000);
    const cat = await api.post(`decks/${webDeck.id}/categories`, {
      data: { name: 'Cover browse', slug: 'cover-browse' },
    });
    expect(cat.status(), 'create category').toBe(201);
    const categoryIds = [((await cat.json()) as { id: string }).id];
    const cover = await recordAsset(api, webDeck.id, 'e2e-cover');
    const plain = `Browse plain ${webDeck.slug}`;
    const covered = `Browse covered ${webDeck.slug}`;
    // Lists run newest first: the covered card is created first so the plain one leads.
    await createItem(api, webDeck, {
      type: 'text',
      title: covered,
      body: 'Covered',
      categoryIds,
      cover: { publicId: cover },
    });
    await createItem(api, webDeck, { type: 'text', title: plain, body: 'Plain', categoryIds });
    const list = await api.get(`decks/${webDeck.slug}/items?category=cover-browse&limit=50`);
    const { data } = (await list.json()) as { data: { id: string; title: string }[] };
    expect(data).toHaveLength(2);
    const [first, second] = data as [(typeof data)[0], (typeof data)[0]];
    expect([first.title, second.title]).toEqual([plain, covered]);

    await skipHint(page);
    await routeCloudName(page, 'e2e-cloud');
    const release = await holdImageDelivery(page);
    await page.goto(browseUrl(webDeck.slug, `c=cover-browse&i=${first.id}`));
    const stage = page.locator('.browse__stage');
    await expect(stage.getByRole('heading', { name: plain })).toBeVisible();
    await expect(
      stage
        .getByRole('heading', { name: plain })
        .locator('xpath=ancestor::article[1]')
        .locator('.card__cover'),
    ).toHaveCount(0);

    await swipeCard(page, 'next');
    await expect(page).toHaveURL(new RegExp(`i=${second.id}`));
    const article = stage.getByRole('article', { name: covered });
    const bar = article.locator('.card__cover');
    await expect(bar).toBeVisible();
    const heading = await article.getByRole('heading', { name: covered }).boundingBox();
    const before = await article.boundingBox();
    expect(heading!.y).toBeLessThan((await bar.boundingBox())!.y);

    release();
    await expect(bar).toHaveClass(/cloud-image--loaded/);
    const after = await article.boundingBox();
    expect(after!.height).toBeCloseTo(before!.height, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);

    // The full view shows the bar too.
    await dockButton(page, 'Full view').click();
    const full = page.getByRole('dialog', { name: covered });
    await expect(full.locator('.card__cover')).toBeVisible();
  });
});
