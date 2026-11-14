import type { Page } from '@playwright/test';
import {
  cloudinaryApiSecret,
  photoFile,
  recordMediaAsset,
  routeFakeCloudinary,
  routeImageDelivery,
} from '../../fixtures/cloudinary';
import { expect, test, webUrl } from '../../fixtures/web';

/**
 * 045 (T043, `@full`): the media editor and reader beyond the smoke journeys — gallery editing
 * (reorder, remove, the 8-photo cap, a failed photo retried), refusals before upload, offline,
 * and file cards that load nothing until asked (D398–D400). Nothing reaches Cloudinary.
 */

const save = (page: Page) => page.getByRole('button', { name: 'Save' });
const photos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...photoFile, name: `photo-${i + 1}.png` }));

test('a gallery is reordered and trimmed before saving, in that order @full', async ({
  page,
  webDeck,
}) => {
  test.skip(!cloudinaryApiSecret, 'CLOUDINARY_API_SECRET is not set (012 confirm step)');
  const base = `gobbit/items/${webDeck.id}/e2e-order`;
  await routeFakeCloudinary(page, base);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));
  await page.getByLabel('Title', { exact: true }).fill(`Gallery order ${webDeck.slug}`);

  await page.getByLabel('Choose photos').setInputFiles(photos(3));
  await expect(page.getByText('3 of 8 photos')).toBeVisible();
  // Photos join in the order their uploads finish; name each by the public id it shows.
  const order = async () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.gallery-fields__list img.cloud-image__img')).map(
        (img) => /e2e-order(-\d)?/.exec((img as HTMLImageElement).src)?.[0] ?? '',
      ),
    );
  const before = await order();
  await page.getByRole('button', { name: 'Move photo 3 earlier' }).click();
  await page.getByRole('button', { name: 'Remove photo 1' }).click();
  await expect(page.getByText('2 of 8 photos')).toBeVisible();
  const after = await order();
  expect(after).toEqual([before[2], before[1]]);

  const created = page.waitForResponse(
    (res) => /\/api\/decks\/[^/]+\/items$/.test(res.url()) && res.request().method() === 'POST',
  );
  await save(page).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const saved = (await response.json()) as { payload: { images: { publicId: string }[] } };
  expect(saved.payload.images).toHaveLength(2);
});

test('a gallery stops at 8 photos and says how many were left out @full', async ({
  page,
  webDeck,
}) => {
  const uploads = await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-cap`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));
  await page.getByLabel('Choose photos').setInputFiles(photos(9));
  await expect(
    page.getByText('A card holds at most 8 photos; 1 photo was not added.'),
  ).toBeVisible();
  await expect(page.getByText('8 of 8 photos')).toBeVisible();
  expect(uploads).toHaveLength(8);
  await expect(page.getByLabel('Add photos')).toHaveCount(0);
});

test('a failed photo stays out of the gallery until it is retried @full', async ({
  page,
  webDeck,
}) => {
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-retry`);
  let refuse = true;
  // Registered last, so it answers first; it hands over once the first upload has failed.
  await page.route('https://api.cloudinary.com/**', (route) => {
    if (!refuse) return route.fallback();
    refuse = false;
    return route.fulfill({ status: 500, json: { error: { message: 'Server busy' } } });
  });
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));
  await page.getByLabel('Title', { exact: true }).fill('Retry');
  await page.getByLabel('Choose photos').setInputFiles(photos(1));
  await expect(page.getByRole('button', { name: 'Retry upload' })).toBeVisible();
  await expect(page.getByText('Add a photo')).toBeVisible();
  await page.getByRole('button', { name: 'Retry upload' }).click();
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  await expect(save(page)).toBeEnabled();
});

test('an oversized video is refused before any upload (FR-008) @full', async ({
  page,
  webDeck,
}) => {
  const uploads = await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-big`);
  let signed = 0;
  page.on('request', (req) => {
    if (req.url().includes('/media/sign')) signed += 1;
  });
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));
  await page.getByLabel('Choose file').setInputFiles({
    name: 'concert.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.alloc(26 * 1024 * 1024),
  });
  await expect(page.getByText(/The video must be at most 25 MB/)).toBeVisible();
  expect(uploads).toHaveLength(0);
  expect(signed).toBe(0);
});

test('offline, nothing can be picked and the editor says why @full', async ({
  page,
  webDeck,
  context,
}) => {
  await routeFakeCloudinary(page, `gobbit/items/${webDeck.id}/e2e-offline`);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=media`));
  await expect(page.getByLabel('Choose photos')).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByLabel('Choose photos')).toBeDisabled();
  await expect(page.getByLabel('Choose file')).toBeDisabled();
  await expect(
    page.getByText('Photos and files can be added once you are back online.'),
  ).toBeVisible();
  await context.setOffline(false);
});

test('video and audio cards load no media until Play (D400) @full', async ({
  page,
  api,
  webDeck,
}) => {
  const video = await recordMediaAsset(api, webDeck.id, {
    kind: 'video',
    format: 'mp4',
    width: 720,
    height: 1280,
    durationMs: 65_000,
  });
  test.skip(video === null, 'needs CLOUDINARY_API_SECRET to sign confirms');
  const audio = await recordMediaAsset(api, webDeck.id, {
    kind: 'audio',
    format: 'm4a',
    durationMs: 4_000,
  });
  const category = await api.post(`decks/${webDeck.slug}/categories`, {
    data: { name: 'Media full' },
  });
  expect(category.status()).toBe(201);
  const { id: categoryId } = (await category.json()) as { id: string };
  for (const [title, payload] of [
    ['Recital clip', { kind: 'video', publicId: video }],
    ['Voice memo', { kind: 'audio', publicId: audio }],
  ] as const) {
    const res = await api.post(`decks/${webDeck.slug}/items`, {
      data: { type: 'media', title, payload, categoryIds: [categoryId] },
    });
    expect(res.status(), title).toBe(201);
  }

  const fetched: string[] = [];
  await routeImageDelivery(page);
  await page.route('https://res.cloudinary.com/**/video/upload/**', (route) => {
    fetched.push(route.request().url());
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const recital = page.getByRole('article').filter({ hasText: 'Recital clip' });
  await expect(recital.getByText('1:05')).toBeVisible();
  await expect(page.locator('video, audio')).toHaveCount(0);
  // Only the still and the waveform picture were asked for: no stream, no audio, before Play.
  expect(fetched.filter((url) => !/\.(jpg|png)($|\?)/.test(url))).toEqual([]);

  await recital.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('video')).toHaveCount(1);
  // One player at a time: starting the memo releases the video.
  const memo = page.getByRole('article').filter({ hasText: 'Voice memo' });
  await memo.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('audio')).toHaveCount(1);
  await expect(page.locator('video')).toHaveCount(0);
});
