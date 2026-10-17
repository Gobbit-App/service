// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleShareTarget, isShareTargetPost, SHARE_PATH } from './share-target';
import type { SharedPayload } from './share-payload';

const ORIGIN = 'https://gobbit.example';

function shareRequest(): Request {
  const form = new FormData();
  form.set('text', 'https://a.example/');
  form.append('files', new File(['x'], 'p.png', { type: 'image/png' }));
  return new Request(ORIGIN + SHARE_PATH, { method: 'POST', body: form });
}

function makeDeps(save: (payload: SharedPayload) => Promise<void>, log = vi.fn()) {
  return { origin: ORIGIN, save, newId: () => 'id1', now: () => 42, log };
}

describe('isShareTargetPost (D98)', () => {
  it('accepts a POST to the share path on our origin', () => {
    expect(isShareTargetPost({ method: 'POST', url: ORIGIN + '/share' }, ORIGIN)).toBe(true);
  });

  it('rejects other methods, paths and origins', () => {
    expect(isShareTargetPost({ method: 'GET', url: ORIGIN + '/share' }, ORIGIN)).toBe(false);
    expect(isShareTargetPost({ method: 'POST', url: ORIGIN + '/share/x' }, ORIGIN)).toBe(false);
    expect(isShareTargetPost({ method: 'POST', url: ORIGIN + '/api/ingest' }, ORIGIN)).toBe(false);
    expect(isShareTargetPost({ method: 'POST', url: 'https://evil.example/share' }, ORIGIN)).toBe(
      false,
    );
  });
});

describe('handleShareTarget (D98)', () => {
  it('stashes the payload and 303s to the confirm screen', async () => {
    const save = vi.fn(async (_payload: SharedPayload) => {});
    const response = await handleShareTarget(shareRequest(), makeDeps(save));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(ORIGIN + '/share?pending=id1');
    expect(save).toHaveBeenCalledTimes(1);

    const saved = save.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      id: 'id1',
      createdAt: 42,
      url: 'https://a.example/',
      text: '',
    });
    expect(saved?.files).toHaveLength(1);
  });

  it('lands on ?failed=1 and logs when save rejects', async () => {
    const save = vi.fn(async (_payload: SharedPayload) => {
      throw new Error('quota');
    });
    const log = vi.fn();
    const response = await handleShareTarget(shareRequest(), makeDeps(save, log));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(ORIGIN + '/share?failed=1');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('lands on ?failed=1 without saving when the body is not form data', async () => {
    const save = vi.fn(async (_payload: SharedPayload) => {});
    const log = vi.fn();
    const request = new Request(ORIGIN + SHARE_PATH, {
      method: 'POST',
      body: 'plain',
      headers: { 'content-type': 'text/plain' },
    });
    const response = await handleShareTarget(request, makeDeps(save, log));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(ORIGIN + '/share?failed=1');
    expect(save).not.toHaveBeenCalled();
  });
});
