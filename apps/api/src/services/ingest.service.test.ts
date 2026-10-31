import { describe, expect, it } from 'vitest';
import type { UserRow } from '@gobbit/db';
import { INGEST_IMAGE_MAX_BYTES } from '@gobbit/shared';
import { HttpError } from '../errors/http-errors';
import { assertSubmissionShape, channelFor, type IngestFile } from './ingest.service';

const user = { id: 'u1' } as UserRow;
const png = (bytes = 8): IngestFile => ({ bytes: new Uint8Array(bytes), mime: 'image/png' });

function status(fn: () => void): number | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof HttpError ? err.status : -1;
  }
}

describe('assertSubmissionShape (D93, D101)', () => {
  it('accepts text, a url, or an image on its own', () => {
    expect(status(() => assertSubmissionShape({ text: 'hi', files: [] }))).toBeNull();
    expect(status(() => assertSubmissionShape({ url: 'https://x.test', files: [] }))).toBeNull();
    expect(status(() => assertSubmissionShape({ files: [png()] }))).toBeNull();
  });

  it('rejects an empty or whitespace-only share', () => {
    expect(status(() => assertSubmissionShape({ files: [] }))).toBe(400);
    expect(status(() => assertSubmissionShape({ text: '   ', files: [] }))).toBe(400);
  });

  it('rejects more than 3 images', () => {
    expect(status(() => assertSubmissionShape({ files: [png(), png(), png()] }))).toBeNull();
    expect(status(() => assertSubmissionShape({ files: [png(), png(), png(), png()] }))).toBe(400);
  });

  it('rejects unsupported or missing mime types', () => {
    const pdf = { bytes: new Uint8Array(4), mime: 'application/pdf' };
    expect(status(() => assertSubmissionShape({ files: [pdf] }))).toBe(400);
    expect(status(() => assertSubmissionShape({ files: [{ ...pdf, mime: '' }] }))).toBe(400);
  });

  it('rejects an image over the size limit', () => {
    expect(
      status(() => assertSubmissionShape({ files: [png(INGEST_IMAGE_MAX_BYTES)] })),
    ).toBeNull();
    expect(status(() => assertSubmissionShape({ files: [png(INGEST_IMAGE_MAX_BYTES + 1)] }))).toBe(
      400,
    );
  });
});

describe('channelFor', () => {
  it('token callers are always shortcut, whatever they ask for', () => {
    expect(channelFor({ user, via: 'token' }, 'pwa')).toBe('shortcut');
  });

  it('email callers are email', () => {
    expect(channelFor({ user, via: 'email' })).toBe('email');
  });

  it('session callers get what they asked for, defaulting to paste', () => {
    expect(channelFor({ user, via: 'session' }, 'pwa')).toBe('pwa');
    expect(channelFor({ user, via: 'session' })).toBe('paste');
  });
});
