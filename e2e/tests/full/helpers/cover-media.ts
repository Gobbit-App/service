import { createHash, randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { CLOUDINARY_DUMMY } from '../../../lib/stack-config';

/**
 * Env-free copy of the fake-Cloudinary bits the cover spec needs (fixtures/cloudinary.ts reads the
 * environment until T032/T034 fix it). The stack's API holds `CLOUDINARY_DUMMY.apiSecret`, so the
 * signed upload answers verify and the real API records the assets.
 */
const secret = CLOUDINARY_DUMMY.apiSecret;

export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
export const photoFile = { name: 'photo.png', mimeType: 'image/png', buffer: TINY_PNG };

/** `/config` as the real API answers it, with the cloud name overridden for this page. */
export async function routeCloudName(page: Page, cloudName: string | null) {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...config, cloudinaryCloudName: cloudName } });
  });
}

async function routeImageDelivery(page: Page) {
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
}

const signUploadAnswer = (publicId: string, version: number): string =>
  createHash('sha1').update(`public_id=${publicId}&version=${version}${secret}`).digest('hex');

/** A fake upload permission and Cloudinary (images only); tests never reach the real service. */
export async function routeFakeCloudinary(page: Page, publicId: string) {
  await routeCloudName(page, CLOUDINARY_DUMMY.cloudName);
  await page.route('**/api/decks/*/media/sign', (route) =>
    route.fulfill({
      json: {
        kind: 'image',
        uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_DUMMY.cloudName}/image/upload`,
        apiKey: CLOUDINARY_DUMMY.apiKey,
        timestamp: Math.floor(Date.now() / 1000),
        signature: 'e2e-signature',
        folder: 'gobbit/items/e2e',
        tags: 'editor,deck:e2e',
        allowedFormats: 'jpg,png,webp,heic,heif',
        maxBytes: 8 * 1024 * 1024,
        expiresAt: new Date(Date.now() + 50 * 60_000).toISOString(),
      },
    }),
  );
  const version = Math.floor(Date.now() / 1000);
  const uploads: string[] = [];
  await page.route('https://api.cloudinary.com/**', (route) => {
    uploads.push(route.request().url());
    const id = uploads.length === 1 ? publicId : `${publicId}-${uploads.length}`;
    return route.fulfill({
      json: {
        public_id: id,
        version,
        signature: signUploadAnswer(id, version),
        resource_type: 'image',
        bytes: TINY_PNG.length,
        format: 'png',
        width: 1,
        height: 1,
      },
    });
  });
  await routeImageDelivery(page);
  return uploads;
}

/** Records an image for `deckId` through the real API confirm step (D157); returns its public id. */
export async function recordImageAsset(
  api: APIRequestContext,
  deckId: string,
  file: { format: string; width: number; height: number },
): Promise<string> {
  const publicId = `gobbit/items/${deckId}/e2e-image-${randomUUID().slice(0, 8)}`;
  const version = Math.floor(Date.now() / 1000);
  const res = await api.post(`decks/${deckId}/media/assets`, {
    data: {
      publicId,
      version,
      signature: signUploadAnswer(publicId, version),
      bytes: 1024,
      format: file.format,
      kind: 'image',
      resourceType: 'image',
      width: file.width,
      height: file.height,
    },
  });
  if (!res.ok()) throw new Error(`record media asset: ${res.status()} ${await res.text()}`);
  return publicId;
}
