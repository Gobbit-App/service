import { describe, expect, it } from 'vitest';
import {
  LINK_PREVIEW_DESCRIPTION_MAX,
  LINK_PREVIEW_IMAGE_URL_MAX,
  LINK_PREVIEW_TITLE_MAX,
} from '@pb/shared';
import { toLinkPreview } from './link-preview';

const og = (o: Partial<Record<'title' | 'description' | 'image' | 'siteName', string>> = {}) => ({
  title: o.title ?? null,
  description: o.description ?? null,
  image: o.image ?? null,
  siteName: o.siteName ?? null,
});

describe('toLinkPreview (D134)', () => {
  it('prefers og:title and falls back to the page title', () => {
    expect(toLinkPreview({ title: 'Page', og: og({ title: 'OG' }) })).toEqual({ title: 'OG' });
    expect(toLinkPreview({ title: 'Page', og: og() })).toEqual({ title: 'Page' });
  });

  it('collapses whitespace and caps title/description by code points', () => {
    const emoji = '😀'.repeat(LINK_PREVIEW_TITLE_MAX + 5);
    const preview = toLinkPreview({
      title: null,
      og: og({
        title: emoji,
        description: `  a\n\n  b ${'x'.repeat(LINK_PREVIEW_DESCRIPTION_MAX)}`,
      }),
    });
    expect(Array.from(preview!.title!)).toHaveLength(LINK_PREVIEW_TITLE_MAX);
    expect(preview!.description!.startsWith('a b x')).toBe(true);
    expect(Array.from(preview!.description!)).toHaveLength(LINK_PREVIEW_DESCRIPTION_MAX);
  });

  it('keeps only an absolute http(s) image under the URL cap', () => {
    expect(toLinkPreview({ title: null, og: og({ image: 'https://x.test/a.png' }) })).toEqual({
      image: 'https://x.test/a.png',
    });
    expect(toLinkPreview({ title: 'T', og: og({ image: 'data:image/png;base64,AA' }) })).toEqual({
      title: 'T',
    });
    const long = `https://x.test/${'a'.repeat(LINK_PREVIEW_IMAGE_URL_MAX)}`;
    expect(toLinkPreview({ title: 'T', og: og({ image: long }) })).toEqual({ title: 'T' });
  });

  it('drops siteName and returns null when there is nothing to show', () => {
    expect(toLinkPreview({ title: '  ', og: og({ siteName: 'Site' }) })).toBeNull();
  });
});
