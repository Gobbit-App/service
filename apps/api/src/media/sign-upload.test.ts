import { createHash } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { describe, expect, it } from 'vitest';
import {
  MEDIA_FORMATS,
  MEDIA_IMAGE_MAX_BYTES,
  mediaEagerParam,
  mediaSignResponseSchema,
} from '@gobbit/shared';
import { signEditorUpload } from './sign-upload';

// Fake credentials: the signature is computed locally, nothing is sent anywhere.
const creds = { cloudName: 'test-cloud', apiKey: 'test-key', apiSecret: 'test-secret' };
const now = new Date('2026-03-01T10:00:00.400Z');
const deckId = '0b6f3a52-5d0e-4c55-9f43-2f1d8f6a7b10';

describe('signEditorUpload (D133, D389)', () => {
  const signed = signEditorUpload(creds, deckId, now, {
    kind: 'image',
    maxBytes: MEDIA_IMAGE_MAX_BYTES,
  });

  it('signs the deck folder, tags, formats and a seconds timestamp', () => {
    expect(signed).toMatchObject({
      uploadUrl: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
      apiKey: 'test-key',
      timestamp: 1_772_359_200,
      folder: `gobbit/items/${deckId}`,
      tags: `editor,deck:${deckId}`,
      allowedFormats: 'jpg,png,webp,heic,heif',
      maxBytes: MEDIA_IMAGE_MAX_BYTES,
    });
  });

  it('expires 50 minutes after the signed timestamp', () => {
    expect(signed.expiresAt).toBe('2026-03-01T10:50:00.000Z');
  });

  it('matches the SDK signature and the documented sha1(sorted params + secret)', () => {
    const params = {
      allowed_formats: signed.allowedFormats,
      folder: signed.folder,
      tags: signed.tags,
      timestamp: signed.timestamp,
    };
    expect(signed.signature).toBe(cloudinary.utils.api_sign_request(params, creds.apiSecret));
    const toSign = `allowed_formats=${params.allowed_formats}&folder=${params.folder}&tags=${params.tags}&timestamp=${params.timestamp}`;
    expect(signed.signature).toBe(
      createHash('sha1')
        .update(toSign + creds.apiSecret)
        .digest('hex'),
    );
  });

  it('never contains the secret and fits the strict response schema', () => {
    expect(JSON.stringify(signed)).not.toContain(creds.apiSecret);
    expect(mediaSignResponseSchema.parse(signed)).toEqual(signed);
  });

  it('signs no eager renditions for photos and PDFs', () => {
    expect(signed.eager).toBeUndefined();
    const pdf = signEditorUpload(creds, deckId, now, { kind: 'pdf', maxBytes: 10 });
    expect(pdf).toMatchObject({
      kind: 'pdf',
      uploadUrl: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
      allowedFormats: 'pdf',
      maxBytes: 10,
    });
    expect(pdf.eager).toBeUndefined();
  });

  it.each(['audio', 'video'] as const)(
    'signs %s as a video resource with its formats and eager renditions',
    (kind) => {
      const out = signEditorUpload(creds, deckId, now, { kind, maxBytes: 99 });
      expect(out.uploadUrl).toBe('https://api.cloudinary.com/v1_1/test-cloud/video/upload');
      expect(out.allowedFormats).toBe(MEDIA_FORMATS[kind].join(','));
      expect(out.eager).toBe(mediaEagerParam(kind));
      expect(out.eagerAsync).toBe(true);
      const params = {
        allowed_formats: out.allowedFormats,
        eager: out.eager!,
        eager_async: true,
        folder: out.folder,
        tags: out.tags,
        timestamp: out.timestamp,
      };
      expect(out.signature).toBe(cloudinary.utils.api_sign_request(params, creds.apiSecret));
      expect(mediaSignResponseSchema.parse(out)).toEqual(out);
    },
  );
});
