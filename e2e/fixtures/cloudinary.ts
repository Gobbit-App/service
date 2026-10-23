import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { resolveE2eEnv } from '../lib/env';

/** Fake Cloudinary for e2e (D133): tests never reach the real service. */
export const { cloudinaryApiSecret } = resolveE2eEnv();

export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
export const photoFile = { name: 'photo.png', mimeType: 'image/png', buffer: TINY_PNG };

/** 008: `/config` as the real API answers it, with the cloud name overridden for this page. */
export async function routeCloudName(page: Page, cloudName: string | null) {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...config, cloudinaryCloudName: cloudName } });
  });
}

/** 008: Cloudinary image delivery, answered locally. */
export async function routeImageDelivery(page: Page) {
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
}

/**
 * 012: Cloudinary's upload answer is signed `sha1("public_id=…&version=…" + api secret)`. With the
 * API's secret the fake answer verifies, so the real API confirms and records the asset (D157).
 */
function signUploadAnswer(publicId: string, version: number, secret: string): string {
  return createHash('sha1')
    .update(`public_id=${publicId}&version=${version}${secret}`)
    .digest('hex');
}

/**
 * 008: a fake upload permission and Cloudinary; tests never reach the real service (D133).
 * The upload answer is signed when the secret is known; otherwise the confirm step (012) is
 * answered locally too, which is enough for journeys that never save.
 */
export async function routeFakeCloudinary(page: Page, publicId: string) {
  const cloud = 'e2e-cloud';
  await routeCloudName(page, cloud);
  await page.route('**/api/decks/*/media/sign', (route) =>
    route.fulfill({
      json: {
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
        apiKey: 'e2e-key',
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
  const answer = {
    public_id: publicId,
    version,
    signature: cloudinaryApiSecret
      ? signUploadAnswer(publicId, version, cloudinaryApiSecret)
      : 'e2e-signature',
    width: 1,
    height: 1,
    bytes: TINY_PNG.length,
    format: 'png',
  };
  const uploads: string[] = [];
  await page.route('https://api.cloudinary.com/**', (route) => {
    uploads.push(route.request().url());
    return route.fulfill({ json: answer });
  });
  if (!cloudinaryApiSecret) {
    await page.route('**/api/decks/*/media/assets', (route) =>
      route.fulfill({
        status: 201,
        json: {
          publicId,
          width: 1,
          height: 1,
          bytes: TINY_PNG.length,
          format: 'png',
          source: 'editor',
          createdAt: new Date().toISOString(),
        },
      }),
    );
  }
  await routeImageDelivery(page);
  return uploads;
}
