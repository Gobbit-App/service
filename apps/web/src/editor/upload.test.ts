import { describe, expect, it, vi } from 'vitest';
import type { MediaSignResponse } from '@pb/shared';
import {
  cachedSigner,
  failureMessage,
  signAndUpload,
  uploadFailureReport,
  uploadForm,
  uploadImage,
  UploadError,
} from './upload';

function signed(overrides: Partial<MediaSignResponse> = {}): MediaSignResponse {
  return {
    uploadUrl: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
    apiKey: 'key123',
    timestamp: 1_700_000_000,
    signature: 'sig',
    folder: 'gobbit/items/deck-1',
    tags: 'editor,deck:deck-1',
    allowedFormats: 'jpg,png,webp,heic,heif',
    maxBytes: 8 * 1024 * 1024,
    expiresAt: '2030-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Cloudinary's signed 200 answer for `public_id` and the confirm body it becomes. */
const answer = (id: string) => ({
  public_id: id,
  version: 1_700_000_001,
  signature: 'resp-sig',
  width: 1200,
  height: 900,
  bytes: 2048,
  format: 'jpg',
  secure_url: 'https://res.cloudinary.com/x.jpg',
});
const uploaded = (publicId: string) => ({
  publicId,
  version: 1_700_000_001,
  signature: 'resp-sig',
  width: 1200,
  height: 900,
  bytes: 2048,
  format: 'jpg',
});

/** Just enough XMLHttpRequest for `uploadImage`; the test drives its events. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  status = 0;
  responseText = '';
  method = '';
  url = '';
  body: FormData | null = null;
  aborted = false;
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

function fakeXhr() {
  FakeXhr.instances = [];
  return () => new FakeXhr() as unknown as XMLHttpRequest;
}

const last = () => FakeXhr.instances[FakeXhr.instances.length - 1]!;
const file = new Blob(['x'], { type: 'image/jpeg' });

describe('uploadForm', () => {
  it('sends the file and every signed parameter, never a secret', () => {
    const form = uploadForm(file, signed());
    expect([...form.keys()].sort()).toEqual(
      ['allowed_formats', 'api_key', 'file', 'folder', 'signature', 'tags', 'timestamp'].sort(),
    );
    expect(form.get('timestamp')).toBe('1700000000');
  });
});

describe('uploadImage', () => {
  it('reports progress and resolves with the signed answer', async () => {
    const onProgress = vi.fn<(p: number) => void>();
    const promise = uploadImage(file, signed(), { onProgress, createXhr: fakeXhr() });
    const xhr = last();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe(signed().uploadUrl);
    xhr.progress(25, 100);
    xhr.progress(50, 100);
    xhr.respond(200, answer('gobbit/items/deck-1/abc'));
    await expect(promise).resolves.toEqual(uploaded('gobbit/items/deck-1/abc'));
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([25, 50, 100]);
  });

  it('aborting rejects as aborted and leaves no photo', async () => {
    const controller = new AbortController();
    const promise = uploadImage(file, signed(), {
      signal: controller.signal,
      createXhr: fakeXhr(),
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ reason: 'aborted' });
    expect(last().aborted).toBe(true);
  });

  it('an already aborted signal never opens a request', async () => {
    const controller = new AbortController();
    controller.abort();
    const create = fakeXhr();
    await expect(
      uploadImage(file, signed(), { signal: controller.signal, createXhr: create }),
    ).rejects.toMatchObject({ reason: 'aborted' });
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('a non-200 answer is a retryable failure', async () => {
    const promise = uploadImage(file, signed(), { createXhr: fakeXhr() });
    last().respond(500, { error: { message: 'Server error' } });
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect(error).toMatchObject({ reason: 'failed', status: 500, detail: 'Server error' });
    expect((error as UploadError).message).toBe("The photo couldn't be uploaded (Server error).");
  });

  it("keeps Cloudinary's refusal on the error", async () => {
    const promise = uploadImage(file, signed(), { createXhr: fakeXhr() });
    last().respond(401, { error: { message: 'Invalid Signature 0123. String to sign - x' } });
    await expect(promise).rejects.toMatchObject({
      reason: 'failed',
      status: 401,
      detail: 'Invalid Signature 0123. String to sign - x',
    });
  });

  it('a 200 without a public_id is a failure', async () => {
    const promise = uploadImage(file, signed(), { createXhr: fakeXhr() });
    last().respond(200, {});
    await expect(promise).rejects.toMatchObject({ reason: 'failed' });
  });

  it('a 200 without the signed version is a failure (nothing to confirm)', async () => {
    const promise = uploadImage(file, signed(), { createXhr: fakeXhr() });
    const { version: _v, ...unsigned } = answer('p1');
    last().respond(200, unsigned);
    await expect(promise).rejects.toMatchObject({ reason: 'failed' });
  });

  it('a network error is a retryable failure', async () => {
    const promise = uploadImage(file, signed(), { createXhr: fakeXhr() });
    last().onerror?.();
    await expect(promise).rejects.toMatchObject({ reason: 'failed', status: 0, detail: null });
  });

  it('a stale-timestamp refusal is reported as stale', async () => {
    const promise = uploadImage(file, signed(), { createXhr: fakeXhr() });
    last().respond(401, { error: { message: 'Stale request - reported time is too old' } });
    await expect(promise).rejects.toMatchObject({ reason: 'stale' });
  });
});

describe('cachedSigner', () => {
  it('reuses an unexpired permission and re-signs after expiry or when fresh', async () => {
    let now = Date.parse('2029-12-31T23:00:00.000Z');
    const sign = vi.fn<() => Promise<MediaSignResponse>>(async () => signed());
    const signer = cachedSigner(sign, () => now);
    await signer({ fresh: false });
    await signer({ fresh: false });
    expect(sign).toHaveBeenCalledTimes(1);
    await signer({ fresh: true });
    expect(sign).toHaveBeenCalledTimes(2);
    now = Date.parse('2030-01-01T00:00:01.000Z');
    await signer({ fresh: false });
    expect(sign).toHaveBeenCalledTimes(3);
  });
});

describe('signAndUpload', () => {
  it('signs again and retries exactly once on a stale refusal', async () => {
    const signer = vi.fn<(o: { fresh: boolean }) => Promise<MediaSignResponse>>(async () =>
      signed(),
    );
    const createXhr = fakeXhr();
    const promise = signAndUpload(file, signer, { createXhr });
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    last().respond(401, { error: { message: 'Stale request' } });
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    last().respond(200, answer('p1'));
    await expect(promise).resolves.toEqual(uploaded('p1'));
    expect(signer.mock.calls.map(([o]) => o.fresh)).toEqual([false, true]);
  });

  it('gives up after the second stale refusal', async () => {
    const signer = vi.fn<(o: { fresh: boolean }) => Promise<MediaSignResponse>>(async () =>
      signed(),
    );
    const promise = signAndUpload(file, signer, { createXhr: fakeXhr() });
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    last().respond(401, { error: { message: 'Stale request' } });
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    last().respond(401, { error: { message: 'Stale request' } });
    await expect(promise).rejects.toMatchObject({ reason: 'stale' });
    expect(signer).toHaveBeenCalledTimes(2);
  });

  it('does not re-sign on other failures', async () => {
    const signer = vi.fn<(o: { fresh: boolean }) => Promise<MediaSignResponse>>(async () =>
      signed(),
    );
    const promise = signAndUpload(file, signer, { createXhr: fakeXhr() });
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    last().respond(500, {});
    await expect(promise).rejects.toMatchObject({ reason: 'failed' });
    expect(signer).toHaveBeenCalledTimes(1);
  });
});

describe('failureMessage', () => {
  it.each([
    [0, null, /connection/],
    [400, 'File size too large. Got 12000000. Maximum is 10485760.', /too large/],
    [400, 'Resolution too high. Max is 25 megapixels', /resolution is too high/],
    [400, 'Image file format bmp not allowed', /file type isn't supported/],
    [401, 'Invalid Signature abc. String to sign - x', /misconfigured/],
    [401, 'Invalid api_key 123', /misconfigured/],
    [500, null, /^The photo couldn't be uploaded\.$/],
  ])('status %i / %s', (status, detail, expected) => {
    expect(failureMessage(status, detail)).toMatch(expected);
  });

  it('shows an unknown refusal, cut to length', () => {
    const message = failureMessage(400, 'x'.repeat(300));
    expect(message.length).toBeLessThan(160);
    expect(message).toContain('…');
  });
});

describe('uploadFailureReport', () => {
  it("carries Cloudinary's status and message plus the file's type and size", () => {
    const error = new UploadError('failed', 'shown', 400, 'Resolution too high');
    expect(uploadFailureReport(error, file)).toEqual({
      status: 400,
      message: 'Resolution too high',
      fileType: 'image/jpeg',
      fileBytes: 1,
    });
  });

  it('cuts long messages and reports a missing type as null', () => {
    const error = new UploadError('failed', 'shown', 400, 'x'.repeat(900));
    const report = uploadFailureReport(error, new Blob(['ab']));
    expect(report?.message).toHaveLength(500);
    expect(report?.fileType).toBeNull();
  });

  it('skips cancels, stale refusals and non-upload errors', () => {
    expect(uploadFailureReport(new UploadError('aborted', 'x'), file)).toBeNull();
    expect(
      uploadFailureReport(new UploadError('stale', 'x', 401, 'Stale request'), file),
    ).toBeNull();
    expect(uploadFailureReport(new Error('sign failed'), file)).toBeNull();
  });
});
