import { describe, expect, it } from 'vitest';
import { CARD_BODY_MAX, CARD_TITLE_MAX, codePointLength } from '@gobbit/shared';
import type { IngestChannel, IngestRaw } from '@gobbit/shared';
import { honestLockedText, validateProposal } from '../ai/extract-validate';
import { bestEffort, bestEffortContext } from './best-effort';

const URL1 = 'https://news.example/story';
const photo = (n: number) => ({ publicId: `gobbit/items/d/p${n}`, bytes: 10, mime: 'image/jpeg' });
const raw = (r: Partial<IngestRaw>): IngestRaw => ({ images: [], ...r });
const build = (r: Partial<IngestRaw>, channel: IngestChannel = 'pwa') => {
  const out = bestEffort(raw(r), channel);
  if (!out) throw new Error('expected a best-effort card');
  return out;
};

describe('bestEffort: link (app, paste, Shortcut)', () => {
  it('is a link card; the share title is the title, the sender text without the address the body', () => {
    const out = build({ url: URL1, title: 'Read this', text: `Worth a look ${URL1}` });
    expect(out).toMatchObject({
      kind: 'link',
      cut: false,
      unusedPhotos: 0,
      needsPreview: true,
      input: {
        type: 'link',
        title: 'Read this',
        body: 'Worth a look',
        categoryIds: [],
        confidence: 0,
        language: 'und',
      },
    });
    expect(out.input.link?.url ?? URL1).toBe(URL1);
    expect(out.input.body).not.toContain(URL1);
  });

  it('falls back to the site name (host without www) when there is no share title', () => {
    const out = build({
      url: 'https://www.shop.example/p/1',
      text: 'https://www.shop.example/p/1',
    });
    expect(out.input.title).toBe('shop.example');
    expect(out.input.body).toBe('');
  });

  it('takes the address from the sourceUrl argument when the share has no url field', () => {
    const out = bestEffort(raw({ text: `see ${URL1}` }), 'paste', URL1);
    expect(out?.kind).toBe('link');
    expect(out?.input.body).toBe('see');
  });

  it('the address wins over photos, and the photos are counted as unused', () => {
    const out = build({ url: URL1, text: URL1, images: [photo(1), photo(2), photo(3)] });
    expect(out.kind).toBe('link');
    expect(out.unusedPhotos).toBe(3);
  });

  it('a body that is only the address with surrounding whitespace is still a link card', () => {
    const out = build({ url: URL1, text: `  \n ${URL1}\t\n` });
    expect(out.kind).toBe('link');
    expect(out.input.body).toBe('');
  });

  it('an event page is a link card and no event context is passed', () => {
    const out = build({ url: 'https://tickets.example/e/42', title: 'Spring fair' });
    expect(out.kind).toBe('link');
    expect(out.input.type).toBe('link');
    const ctx = bestEffortContext('link', raw({ url: 'https://tickets.example/e/42' }), {
      categoryIds: ['c1'],
      sourceUrl: 'https://tickets.example/e/42',
      event: { structured: { name: 'Fair', startDate: '2027-05-01' } } as never,
    });
    expect(ctx.event).toBeUndefined();
    expect(ctx.categoryIds).toEqual([]);
  });
});

describe('bestEffort: photos (app, paste, Shortcut)', () => {
  it('photos with no address become a media card with the share title and the rest of the text', () => {
    const out = build({
      images: [photo(1), photo(2)],
      title: 'Garden day',
      text: 'Tomatoes are in',
    });
    expect(out).toMatchObject({
      kind: 'media',
      unusedPhotos: 0,
      needsPreview: false,
      input: { type: 'image', title: 'Garden day', body: 'Tomatoes are in' },
    });
  });

  it('title is the first line when there is no share title; the rest is the body', () => {
    const out = build({ images: [photo(1)], text: 'Garden day\nTomatoes are in\nPeas too' });
    expect(out.input.title).toBe('Garden day');
    expect(out.input.body).toBe('Tomatoes are in\nPeas too');
  });

  it('title is "Shared image" with no title and no text', () => {
    const out = build({ images: [photo(1)] });
    expect(out.input.title).toBe('Shared image');
    expect(out.input.body).toBe('');
  });

  it('the context carries the first photo as cover and the others in order, only for media', () => {
    const r = raw({ images: [photo(1), photo(2), photo(3)] });
    const base = { categoryIds: ['c1'], sourceUrl: URL1, imageDimensions: { width: 4, height: 3 } };
    const ctx = bestEffortContext('media', r, base);
    expect(ctx).toMatchObject({
      categoryIds: [],
      imagePublicId: 'gobbit/items/d/p1',
      morePublicIds: ['gobbit/items/d/p2', 'gobbit/items/d/p3'],
    });
    expect(ctx.sourceUrl).toBeUndefined();
    expect(ctx.linkPreview).toBeUndefined();
    expect(ctx.event).toBeUndefined();
  });

  it('validates into a gallery with every photo', () => {
    const r = raw({ images: [photo(1), photo(2)], title: 'Garden day' });
    const out = bestEffort(r, 'pwa')!;
    const v = validateProposal(out.input, bestEffortContext('media', r, { categoryIds: [] }));
    expect(v).toMatchObject({
      ok: true,
      item: { type: 'media', status: 'proposed', title: 'Garden day' },
    });
    if (v.ok) expect((v.item.payload as { images: unknown[] }).images).toHaveLength(2);
  });
});

describe('bestEffort: text (app, paste, Shortcut)', () => {
  it('text only becomes a text card: share title, rest of the text as the body', () => {
    const out = build({ title: 'Soup', text: 'Onions, stock, salt' });
    expect(out).toMatchObject({
      kind: 'text',
      needsPreview: false,
      input: { type: 'text', title: 'Soup', body: 'Onions, stock, salt' },
    });
  });

  it('title is the first line when there is no share title', () => {
    const out = build({ text: 'Soup\nOnions, stock, salt' });
    expect(out.input).toMatchObject({ title: 'Soup', body: 'Onions, stock, salt' });
  });

  it('a one-line text is the title and the body stays empty', () => {
    const out = build({ text: 'Buy more salt' });
    expect(out.input.title).toBe('Buy more salt');
    expect(out.input.body).toBe('');
  });

  it('the context has no link, photo or event fields', () => {
    const ctx = bestEffortContext('text', raw({ text: 'hi' }), {
      categoryIds: ['c1'],
      sourceUrl: URL1,
    });
    expect(ctx).toEqual({ categoryIds: [] });
  });
});

describe('bestEffort: email', () => {
  it('photo attachments become a media card: subject, else first line, else "Shared image"', () => {
    const withSubject = build(
      { images: [photo(1)], title: 'Trip photos', text: 'From the lake' },
      'email',
    );
    expect(withSubject).toMatchObject({
      kind: 'media',
      input: { type: 'image', title: 'Trip photos', body: 'From the lake' },
    });
    const noSubject = build({ images: [photo(1)], text: 'Lake day\nWe swam' }, 'email');
    expect(noSubject.input).toMatchObject({ title: 'Lake day', body: 'We swam' });
    expect(build({ images: [photo(1)] }, 'email').input.title).toBe('Shared image');
  });

  it('photos win over an address in the email', () => {
    const out = build({ images: [photo(1)], url: URL1, text: URL1, title: 'Look' }, 'email');
    expect(out.kind).toBe('media');
    expect(out.unusedPhotos).toBe(0);
  });

  it('a body that is only an address is a link card with no body', () => {
    const out = build({ url: URL1, title: 'Fwd: story', text: `\n ${URL1} \n` }, 'email');
    expect(out).toMatchObject({
      kind: 'link',
      needsPreview: true,
      input: { type: 'link', body: '' },
    });
  });

  it('an empty body with the address in the subject is a link card', () => {
    const out = build({ url: URL1, title: URL1, text: '' }, 'email');
    expect(out.kind).toBe('link');
    expect(out.input.body).toBe('');
  });

  it('an address among other text is a text card, the address stays plain text, no sourceUrl', () => {
    const r = raw({ url: URL1, title: 'Lunch spot', text: `Try this place ${URL1} on Friday` });
    const out = bestEffort(r, 'email')!;
    expect(out).toMatchObject({
      kind: 'text',
      needsPreview: false,
      input: { type: 'text', title: 'Lunch spot', body: `Try this place ${URL1} on Friday` },
    });
    expect(
      bestEffortContext('text', r, { categoryIds: [], sourceUrl: URL1 }).sourceUrl,
    ).toBeUndefined();
  });

  it('subject missing: the first line of the text is the title', () => {
    const out = build({ text: 'Lunch spot\nTry it' }, 'email');
    expect(out.input).toMatchObject({ title: 'Lunch spot', body: 'Try it' });
  });
});

describe('bestEffort: limits', () => {
  it('a long title is cut at CARD_TITLE_MAX once validated', () => {
    const r = raw({ title: 'word '.repeat(80) });
    const v = validateProposal(
      bestEffort({ ...r, text: 'body' }, 'pwa')!.input,
      bestEffortContext('text', r, { categoryIds: [] }),
    );
    expect(v.ok).toBe(true);
    if (v.ok) expect(codePointLength(v.item.title)).toBeLessThanOrEqual(CARD_TITLE_MAX);
  });

  it('a body over CARD_BODY_MAX sets cut and is shortened by the validator', () => {
    const text = 'A sentence that goes on. '.repeat(120);
    expect(codePointLength(text)).toBeGreaterThan(CARD_BODY_MAX);
    const r = raw({ title: 'Long', text });
    const out = bestEffort(r, 'pwa')!;
    expect(out.cut).toBe(true);
    const v = validateProposal(out.input, bestEffortContext('text', r, { categoryIds: [] }));
    expect(v.ok).toBe(true);
    if (v.ok) expect(codePointLength(v.item.body)).toBeLessThanOrEqual(CARD_BODY_MAX);
  });

  it('a body exactly at the limit is not cut', () => {
    const out = build({ title: 'Edge', text: 'x'.repeat(CARD_BODY_MAX) });
    expect(out.cut).toBe(false);
  });
});

describe('bestEffort: nothing usable and locked hosts', () => {
  it('returns null with no address, no photos and no text', () => {
    expect(bestEffort(raw({}), 'pwa')).toBeNull();
    expect(bestEffort(raw({ text: '  \n ' }), 'paste')).toBeNull();
    expect(bestEffort(raw({ title: 'Just a title' }), 'email')).toBeNull();
  });

  it('a locked host with no readable page and no caption gets the honest text (D348)', () => {
    const url = 'https://www.instagram.com/p/abc/';
    const r = raw({ url, text: url });
    const out = bestEffort(r, 'pwa')!;
    const ctx = bestEffortContext('link', r, { categoryIds: [], sourceUrl: url });
    expect(ctx.lockedHost).toBeTruthy();
    expect(ctx.sharedText).toBe(url);
    const v = validateProposal(out.input, ctx);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const honest = honestLockedText(ctx.lockedHost!.label);
      expect(v.item).toMatchObject({ type: 'link', title: honest.title, body: honest.body });
    }
  });

  it('a link context keeps the page preview and the address', () => {
    const linkPreview = { title: 'A story' };
    const ctx = bestEffortContext('link', raw({ url: URL1, text: 'hi' }), {
      categoryIds: ['c1'],
      sourceUrl: URL1,
      linkPreview,
    });
    expect(ctx).toMatchObject({ categoryIds: [], sourceUrl: URL1, linkPreview, sharedText: 'hi' });
    expect(ctx.imagePublicId).toBeUndefined();
  });
});
