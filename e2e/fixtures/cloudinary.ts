import { createHash, randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { resolveE2eEnv } from '../lib/env';

/** Fake Cloudinary for e2e (D133): tests never reach the real service. */
export const { cloudinaryApiSecret } = resolveE2eEnv();

export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
export const photoFile = { name: 'photo.png', mimeType: 'image/png', buffer: TINY_PNG };
/** 045: a minimal PDF; the fake Cloudinary answers with its page count, nothing parses it. */
export const pdfFile = {
  name: 'minutes.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
};

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

/** 045: what one recorded file looks like to the confirm step (D390). */
export interface FakeMediaFile {
  kind: 'image' | 'pdf' | 'audio' | 'video';
  format: string;
  width?: number;
  height?: number;
  pages?: number;
  durationMs?: number;
}

const resourceTypeOf = (kind: FakeMediaFile['kind']) =>
  kind === 'audio' || kind === 'video' ? 'video' : 'image';

/**
 * 008: a fake upload permission and Cloudinary; tests never reach the real service (D133).
 * The upload answer is signed when the secret is known; otherwise the confirm step (012) is
 * answered locally too, which is enough for journeys that never save. 045: every upload gets its
 * own public id (`publicId`, then `publicId-2`, …) so a gallery holds distinct photos, and the
 * permission and the answer follow the kind asked for (`file` describes a non-photo upload).
 */
export async function routeFakeCloudinary(page: Page, publicId: string, file?: FakeMediaFile) {
  const cloud = 'e2e-cloud';
  const kind = file?.kind ?? 'image';
  await routeCloudName(page, cloud);
  await page.route('**/api/decks/*/media/sign', (route) =>
    route.fulfill({
      json: {
        kind,
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/${resourceTypeOf(kind)}/upload`,
        apiKey: 'e2e-key',
        timestamp: Math.floor(Date.now() / 1000),
        signature: 'e2e-signature',
        folder: 'gobbit/items/e2e',
        tags: 'editor,deck:e2e',
        allowedFormats: file ? file.format : 'jpg,png,webp,heic,heif',
        maxBytes: 8 * 1024 * 1024,
        expiresAt: new Date(Date.now() + 50 * 60_000).toISOString(),
      },
    }),
  );
  const version = Math.floor(Date.now() / 1000);
  const answerFor = (id: string) => ({
    public_id: id,
    version,
    signature: cloudinaryApiSecret
      ? signUploadAnswer(id, version, cloudinaryApiSecret)
      : 'e2e-signature',
    resource_type: resourceTypeOf(kind),
    bytes: TINY_PNG.length,
    format: file?.format ?? 'png',
    ...(kind === 'audio' ? {} : { width: file?.width ?? 1, height: file?.height ?? 1 }),
    ...(file?.pages ? { pages: file.pages } : {}),
    ...(file?.durationMs ? { duration: file.durationMs / 1000 } : {}),
  });
  const uploads: string[] = [];
  const ids: string[] = [];
  await page.route('https://api.cloudinary.com/**', (route) => {
    uploads.push(route.request().url());
    const id = uploads.length === 1 ? publicId : `${publicId}-${uploads.length}`;
    ids.push(id);
    return route.fulfill({ json: answerFor(id) });
  });
  if (!cloudinaryApiSecret) {
    await page.route('**/api/decks/*/media/assets', (route) => {
      const sent = route.request().postDataJSON() as { publicId?: string };
      return route.fulfill({
        status: 201,
        json: {
          publicId: sent.publicId ?? publicId,
          kind,
          resourceType: resourceTypeOf(kind),
          width: kind === 'audio' ? null : (file?.width ?? 1),
          height: kind === 'audio' ? null : (file?.height ?? 1),
          bytes: TINY_PNG.length,
          format: file?.format ?? 'png',
          durationMs: file?.durationMs ?? null,
          pages: file?.pages ?? null,
          originalFilename: null,
          source: 'editor',
          createdAt: new Date().toISOString(),
        },
      });
    });
  }
  await routeImageDelivery(page);
  return uploads;
}

/**
 * 045: records a file for `deckId` through the real API confirm step, with Cloudinary's answer
 * signed by the API's secret as the editor's upload would be (D157, D390). Nothing reaches
 * Cloudinary. Null when the e2e run has no `CLOUDINARY_API_SECRET` (the caller skips).
 */
export async function recordMediaAsset(
  api: APIRequestContext,
  deckId: string,
  file: FakeMediaFile,
): Promise<string | null> {
  if (!cloudinaryApiSecret) return null;
  const publicId = `gobbit/items/${deckId}/e2e-${file.kind}-${randomUUID().slice(0, 8)}`;
  const version = Math.floor(Date.now() / 1000);
  const res = await api.post(`decks/${deckId}/media/assets`, {
    data: {
      publicId,
      version,
      signature: signUploadAnswer(publicId, version, cloudinaryApiSecret),
      bytes: 1024,
      format: file.format,
      kind: file.kind,
      resourceType: resourceTypeOf(file.kind),
      ...(file.width ? { width: file.width, height: file.height } : {}),
      ...(file.pages ? { pages: file.pages } : {}),
      ...(file.durationMs ? { durationMs: file.durationMs } : {}),
    },
  });
  if (res.status() !== 201) throw new Error(`recording a ${file.kind} answered ${res.status()}`);
  return publicId;
}
