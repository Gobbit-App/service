import { describe, expect, it } from 'vitest';
import type { UserRow } from '@gobbit/db';
import { INGEST_IMAGE_MAX_BYTES } from '@gobbit/shared';
import { HttpError } from '../errors/http-errors';
import {
  assertSubmissionShape,
  channelFor,
  classifySubmission,
  type IngestFile,
} from './ingest.service';

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
});

/** A file whose first bytes are `head`, padded to `size`. */
function file(head: number[] | string, mime: string, size = 64, name?: string): IngestFile {
  const bytes = new Uint8Array(size);
  const start = typeof head === 'string' ? [...head].map((c) => c.charCodeAt(0)) : head;
  bytes.set(start);
  return { bytes, mime, ...(name ? { name } : {}) };
}
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const realPng = (size = 64) => file(PNG_HEAD, 'image/png', size);
const pdf = (size = 64) => file('%PDF-1.7', 'application/pdf', size, 'term.pdf');
const m4a = (size = 64) => file('\0\0\0\x20ftypM4A ', 'audio/x-m4a', size);
const limits = { image: 1000, pdf: 1000, audio: 1000, video: 1000 };

describe('classifySubmission (D395, FR-027)', () => {
  it('makes photos a gallery and reports other kinds as extra', () => {
    const out = classifySubmission({ files: [realPng(), pdf(), realPng()] }, limits);
    expect(out.images).toHaveLength(2);
    expect(out.file).toBeNull();
    expect(out.unused).toEqual([{ mime: 'application/pdf', bytes: 64, reason: 'extra_file' }]);
  });

  it('lets the first supported file decide: a PDF wins over later photos', () => {
    const out = classifySubmission({ files: [pdf(), realPng(), m4a()] }, limits);
    expect(out.file).toMatchObject({ kind: 'pdf', format: 'pdf', name: 'term.pdf' });
    expect(out.images).toEqual([]);
    expect(out.unused.map((u) => u.reason)).toEqual(['extra_file', 'extra_file']);
  });

  it('skips a file over its kind limit or that its bytes do not prove', () => {
    const disguised = file('MZ\x90\0', 'application/pdf');
    const out = classifySubmission({ text: 'hi', files: [disguised, pdf(2000), m4a()] }, limits);
    expect(out.file).toMatchObject({ kind: 'audio' });
    expect(out.unused.map((u) => u.reason)).toEqual(['unsupported', 'too_large']);
  });

  it('refuses a share left with nothing, saying why', () => {
    expect(status(() => classifySubmission({ files: [pdf(2000)] }, limits))).toBe(400);
    expect(status(() => classifySubmission({ files: [file('MZ', '')] }, limits))).toBe(400);
    expect(
      status(() => classifySubmission({ text: 'note', files: [pdf(2000)] }, limits)),
    ).toBeNull();
  });

  it('keeps the photo limit of 8 MB by default', () => {
    const big = realPng(INGEST_IMAGE_MAX_BYTES + 1);
    const out = classifySubmission(
      { text: 'x', files: [big] },
      { ...limits, image: INGEST_IMAGE_MAX_BYTES },
    );
    expect(out.unused).toEqual([
      { mime: 'image/png', bytes: INGEST_IMAGE_MAX_BYTES + 1, reason: 'too_large' },
    ]);
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
