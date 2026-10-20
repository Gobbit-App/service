import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INGEST_IMAGE_MAX_BYTES, INGEST_IMAGE_MIMES } from '../ingest/constants';
import { linkPayloadSchema } from '../schemas/payloads';
import {
  LINK_PREVIEW_DESCRIPTION_MAX,
  LINK_PREVIEW_TITLE_MAX,
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_IMAGE_MIMES,
  MEDIA_SIGN_TTL_MS,
  linkPreviewRequestSchema,
  linkPreviewResponseSchema,
  mediaSignResponseSchema,
} from './index';

const srcDir = dirname(fileURLToPath(import.meta.url));

const signed = {
  uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
  apiKey: '123',
  timestamp: 1_700_000_000,
  signature: 'abc',
  folder: 'gobbit/items/d1',
  tags: 'editor,deck:d1',
  allowedFormats: 'jpg,png,webp,heic,heif',
  maxBytes: MEDIA_IMAGE_MAX_BYTES,
  expiresAt: '2023-11-14T23:03:20.000Z',
};

describe('media limits', () => {
  it('uses the same size cap and types as ingest (D133)', () => {
    expect(MEDIA_IMAGE_MAX_BYTES).toBe(INGEST_IMAGE_MAX_BYTES);
    expect(MEDIA_IMAGE_MIMES).toEqual(INGEST_IMAGE_MIMES);
  });

  it('re-signs before Cloudinary’s one-hour signature window ends', () => {
    expect(MEDIA_SIGN_TTL_MS).toBeLessThan(60 * 60_000);
  });

  it('keeps the constants module free of zod', () => {
    const source = readFileSync(resolve(srcDir, 'constants.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]zod['"]/);
    const ingest = readFileSync(resolve(srcDir, '../ingest/constants.ts'), 'utf8');
    expect(ingest).not.toMatch(/from\s+['"]/);
  });
});

describe('mediaSignResponseSchema', () => {
  it('accepts the signed parameters', () => {
    expect(mediaSignResponseSchema.parse(signed)).toEqual(signed);
  });

  it('is strict, so a secret field can never pass through', () => {
    expect(mediaSignResponseSchema.safeParse({ ...signed, apiSecret: 's' }).success).toBe(false);
  });
});

describe('linkPreviewRequestSchema', () => {
  it('accepts http(s) URLs only', () => {
    expect(linkPreviewRequestSchema.safeParse({ url: 'https://example.com/a' }).success).toBe(true);
    expect(linkPreviewRequestSchema.safeParse({ url: 'ftp://example.com/a' }).success).toBe(false);
    expect(linkPreviewRequestSchema.safeParse({ url: 'not a url' }).success).toBe(false);
  });
});

describe('linkPreviewResponseSchema', () => {
  it('accepts a preview or null', () => {
    expect(linkPreviewResponseSchema.safeParse({ preview: null }).success).toBe(true);
    const preview = { title: 'T', description: 'D', image: 'https://example.com/i.png' };
    expect(linkPreviewResponseSchema.parse({ preview })).toEqual({ preview });
  });

  it('caps the title and description', () => {
    const title = 'x'.repeat(LINK_PREVIEW_TITLE_MAX);
    const description = 'y'.repeat(LINK_PREVIEW_DESCRIPTION_MAX);
    expect(linkPreviewResponseSchema.safeParse({ preview: { title, description } }).success).toBe(
      true,
    );
    expect(linkPreviewResponseSchema.safeParse({ preview: { title: `${title}x` } }).success).toBe(
      false,
    );
    expect(
      linkPreviewResponseSchema.safeParse({ preview: { description: `${description}y` } }).success,
    ).toBe(false);
  });

  it('drops nothing silently: unknown preview fields (siteName) and failure reasons are rejected', () => {
    expect(linkPreviewResponseSchema.safeParse({ preview: { siteName: 'S' } }).success).toBe(false);
    expect(linkPreviewResponseSchema.safeParse({ preview: null, reason: 'timeout' }).success).toBe(
      false,
    );
  });

  it('produces previews the link payload accepts', () => {
    const preview = { title: 'T', image: 'https://example.com/i.png' };
    expect(linkPayloadSchema.safeParse({ url: 'https://example.com', preview }).success).toBe(true);
  });
});
