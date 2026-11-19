import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { CLOUDINARY_DUMMY } from '../../../lib/stack-config';

// Env-free copy of the fake Cloudinary of fixtures/cloudinary.ts, enough for one image upload.
// The stack's API secret is the checked-in dummy, so the answer verifies and the real API records the asset (D157).

export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Fakes the upload permission and Cloudinary's answer; returns the upload URLs seen. */
export async function routeFakeUpload(page: Page, publicId: string): Promise<string[]> {
  const cloud = CLOUDINARY_DUMMY.cloudName;
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...config, cloudinaryCloudName: cloud } });
  });
  await page.route('**/api/decks/*/media/sign', (route) =>
    route.fulfill({
      json: {
        kind: 'image',
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
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
  const signature = createHash('sha1')
    .update(`public_id=${publicId}&version=${version}${CLOUDINARY_DUMMY.apiSecret}`)
    .digest('hex');
  const uploads: string[] = [];
  await page.route('https://api.cloudinary.com/**', (route) => {
    uploads.push(route.request().url());
    return route.fulfill({
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
    });
  });
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG }),
  );
  return uploads;
}
