import { describe, expect, it, vi } from 'vitest';
import { lockedHostOf } from '@gobbit/shared/links';
import type { ValidateContext } from '../ai/extract-validate';
import {
  PREVIEW_FALLBACK_EVENT,
  hasPreviewDetails,
  logPreviewFallback,
  previewFallback,
} from './preview-fallback';

const STORY = 'https://news.example/story';
const base: ValidateContext = { categoryIds: ['c1'], sourceUrl: STORY };

describe('previewFallback (D355)', () => {
  it('builds a link card from the preview title, description and image', () => {
    const linkPreview = {
      title: 'A story',
      description: 'What happened',
      image: 'https://i.example/a.jpg',
    };
    const out = previewFallback({ ...base, linkPreview }, 'en');
    expect(out?.item).toMatchObject({
      type: 'link',
      status: 'proposed',
      title: 'A story',
      body: 'What happened',
      categoryIds: [],
      sourceUrl: STORY,
      payload: { url: STORY, preview: linkPreview },
    });
    expect(out?.summary).toMatchObject({
      fallback: 'preview',
      escalated: false,
      confidence: 0,
      categoryIds: [],
      type: 'link',
      language: 'en',
    });
  });

  it('uses the host as the title when the preview has only an image', () => {
    const out = previewFallback(
      {
        ...base,
        sourceUrl: 'https://www.shop.example/p/1',
        linkPreview: { image: 'https://i.example/b.jpg' },
      },
      'und',
    );
    expect(out?.item.title).toBe('shop.example');
  });

  it('keeps the locked-host rules: the shared image and the real page title', () => {
    const url = 'https://www.instagram.com/p/abc/';
    const out = previewFallback(
      {
        categoryIds: [],
        sourceUrl: url,
        lockedHost: lockedHostOf(url),
        imagePublicId: 'gobbit/items/d/shared',
        imageDimensions: { width: 1080, height: 1350 },
        linkPreview: { title: 'Pasta night by @cook', description: 'Recipe in the caption' },
      },
      'en',
    );
    expect(out?.item).toMatchObject({
      type: 'link',
      title: 'Pasta night by @cook',
      payload: {
        url,
        preview: { title: 'Pasta night by @cook', publicId: 'gobbit/items/d/shared', width: 1080 },
      },
    });
  });

  it('returns null without a URL or preview details', () => {
    expect(previewFallback({ categoryIds: [], linkPreview: { title: 'x' } }, 'en')).toBeNull();
    expect(previewFallback(base, 'en')).toBeNull();
    expect(previewFallback({ ...base, linkPreview: {} }, 'en')).toBeNull();
  });

  it('hasPreviewDetails needs a URL and a title, description or image', () => {
    expect(hasPreviewDetails({ ...base, linkPreview: { description: 'd' } })).toBe(true);
    expect(hasPreviewDetails({ ...base, linkPreview: {} })).toBe(false);
    expect(hasPreviewDetails({ categoryIds: [], linkPreview: { title: 't' } })).toBe(false);
  });
});

describe('logPreviewFallback (D355)', () => {
  it('logs the decision event with ids, reason and detail only', () => {
    const log = { warn: vi.fn() };
    logPreviewFallback(log, { jobId: 'j', deckId: 'd', itemId: 'i' }, 'unreadable_answer', 'x: y');
    expect(log.warn).toHaveBeenCalledWith(
      {
        event: PREVIEW_FALLBACK_EVENT,
        outcome: 'proposed',
        reason: 'unreadable_answer',
        jobId: 'j',
        deckId: 'd',
        itemId: 'i',
        detail: 'x: y',
      },
      expect.any(String),
    );
  });
});
