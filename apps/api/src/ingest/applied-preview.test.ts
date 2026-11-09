import { describe, expect, it, vi } from 'vitest';
import type { ItemCreate } from '@gobbit/shared';
import { lockedHostOf } from '@gobbit/shared/links';
import type { ValidateContext } from '../ai/extract-validate';
import { appliedDescriptions, appliedImages, PREVIEW_EVENTS } from '../fetch/preview-events';
import { appliedPreview, logPreviewApplied } from './applied-preview';

const url = 'https://www.instagram.com/p/abc/';

function link(preview: Record<string, unknown>): ItemCreate {
  return { type: 'link', title: 'T', body: '', payload: { url, preview } } as unknown as ItemCreate;
}

const ctx: ValidateContext = {
  categoryIds: [],
  sourceUrl: url,
  lockedHost: lockedHostOf(url),
  sharedText: 'Our sink',
  imagePublicId: 'gobbit/ingest/d/p',
  linkPreview: { title: 'Dan on Instagram', description: 'Page text' },
};

describe('appliedPreview (D352)', () => {
  it('reports the member share image and the caption', () => {
    const applied = appliedPreview(
      link({ publicId: 'gobbit/ingest/d/p', description: 'Our sink' }),
      ctx,
    );
    expect(applied).toEqual({ image: 'member_share', description: 'caption', honestTitle: false });
    expect(appliedImages).toContain(applied?.image);
    expect(appliedDescriptions).toContain(applied?.description);
  });

  it('reports the page image and description', () => {
    expect(
      appliedPreview(link({ image: 'https://cdn.test/a.jpg', description: 'Page text' }), ctx),
    ).toMatchObject({ image: 'page', description: 'page' });
  });

  it('reports an honest title when nothing could be read', () => {
    const bare = { ...ctx, sharedText: url, linkPreview: undefined, imagePublicId: undefined };
    expect(appliedPreview(link({ title: 'Instagram link' }), bare)).toEqual({
      image: 'none',
      description: 'none',
      honestTitle: true,
    });
  });

  it('reports an event card preview like a link card (D372)', () => {
    const event = {
      type: 'event',
      title: 'Fair',
      body: '',
      payload: { allDay: true, start: '2026-12-03', timeZone: 'UTC', url, preview: {} },
    } as unknown as ItemCreate;
    expect(appliedPreview(event, { ...ctx, imagePublicId: undefined })).toMatchObject({
      image: 'none',
      description: 'none',
    });
  });

  it('is null for cards that are not links', () => {
    expect(appliedPreview({ type: 'text' } as ItemCreate, ctx)).toBeNull();
  });

  it('logs ids, host and closed-set values only', () => {
    const log = { info: vi.fn() };
    logPreviewApplied(
      log,
      { image: 'page', description: 'caption', honestTitle: false },
      { jobId: 'j', itemId: 'i', deckId: 'd' },
      ctx,
    );
    const [fields] = log.info.mock.calls[0]!;
    expect(fields).toMatchObject({
      event: PREVIEW_EVENTS.applied,
      host: 'instagram.com',
      lockedHost: 'Instagram',
      itemId: 'i',
    });
    expect(JSON.stringify(fields)).not.toMatch(/sink|Page text|\/p\/abc/);
  });
});
