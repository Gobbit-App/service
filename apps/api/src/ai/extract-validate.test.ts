import { describe, expect, it } from 'vitest';
import { CARD_BODY_MAX, codePointLength } from '@gobbit/shared';
import { LOCKED_CAPTION_MAX, lockedHostOf } from '@gobbit/shared/links';
import {
  correctionMessage,
  honestLockedText,
  needsHonestLockedText,
  shouldEscalate,
  truncateAtSentence,
  validateProposal,
  type ValidateContext,
  type ValidatedProposal,
} from './extract-validate';

type OkResult = Extract<ValidatedProposal, { ok: true }>;

const defaultCtx: ValidateContext = {
  categoryIds: ['00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2'],
};

const baseRaw: Record<string, unknown> = {
  type: 'text',
  title: 'Plumber',
  body: 'Call before 9.',
  categoryIds: ['00000000-0000-4000-8000-0000000000c1', 'zzz'],
  language: 'en',
  confidence: 0.9,
  entities: { phones: ['03-555-0199', ' '], colors: ['red'] },
};

/** Validates and throws if the proposal is rejected, narrowing to the ok variant. */
function okResult(raw: unknown, ctx: ValidateContext = defaultCtx): OkResult {
  const result = validateProposal(raw, ctx);
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${result.error}`);
  }
  return result;
}

describe('extract-validate (D100)', () => {
  it('accepts a valid proposal, dropping unknown categories and invalid entities', () => {
    const r = okResult(baseRaw);
    expect(r.item.type).toBe('text');
    expect(r.item.status).toBe('proposed');
    expect(r.item.categoryIds).toEqual(['00000000-0000-4000-8000-0000000000c1']);
    expect(r.item.entities).toEqual({ phones: ['03-555-0199'] });
    expect(r.summary.confidence).toBe(0.9);
  });

  it('accepts null for the optional fields a model leaves unused (photo share)', () => {
    const raw = {
      ...baseRaw,
      type: 'image',
      link: null,
      entities: { phones: null, people: ['Dana'] },
      categoryIds: null,
      newCategory: null,
    };
    const r = okResult(raw, { ...defaultCtx, imagePublicId: 'gobbit/ingest/d/photo' });
    expect(r.item.type).toBe('image');
    expect(r.item.payload).toEqual({ publicId: 'gobbit/ingest/d/photo', alt: 'Plumber' });
    expect(r.item.categoryIds).toEqual([]);
    expect(r.item.entities).toEqual({ people: ['Dana'] });
    expect(r.summary.newCategory).toBeNull();
  });

  it('D288: unwraps style directives the agent writes, keeping the words', () => {
    const r = okResult({ ...baseRaw, body: 'Call :color[before 9]{.red}, :u[Re:Plan] **now**.' });
    expect(r.item.body).toBe('Call before 9, Re:Plan **now**.');
  });

  it('truncates a long body at a sentence end within CARD_BODY_MAX', () => {
    const raw = { ...baseRaw, body: 'a. '.repeat(700) };
    const r = okResult(raw);
    expect(codePointLength(r.item.body)).toBeLessThanOrEqual(600);
    expect(r.item.body.endsWith('.')).toBe(true);
  });

  it('truncateAtSentence handles sentence cuts, short text, hard cuts and Hebrew', () => {
    expect(truncateAtSentence('Hello world. Second sentence here.', 20)).toBe('Hello world.');
    expect(truncateAtSentence('short', 10)).toBe('short');
    expect(truncateAtSentence('a'.repeat(50), 10).length).toBe(10);

    const hebrew = 'שלום עולם. '.repeat(70);
    const cut = truncateAtSentence(hebrew, CARD_BODY_MAX);
    expect(codePointLength(cut)).toBeLessThanOrEqual(600);
    expect(codePointLength(cut)).toBeGreaterThan(0);
  });

  it('narrows link to text when there is no link and no sourceUrl', () => {
    const raw = { ...baseRaw, type: 'link' };
    const r = okResult(raw);
    expect(r.summary.type).toBe('text');
    expect(r.item.type).toBe('text');
  });

  it('keeps link when ctx.sourceUrl is present', () => {
    const raw = { ...baseRaw, type: 'link' };
    const r = okResult(raw, {
      categoryIds: ['00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2'],
      sourceUrl: 'https://e.com/x',
    });
    expect(r.item.type).toBe('link');
    expect(r.item).toMatchObject({
      payload: { url: 'https://e.com/x' },
      sourceUrl: 'https://e.com/x',
    });
  });

  it('D163: a link to the shared page carries its OG preview', () => {
    const preview = { title: 'Dan the Plumber', image: 'https://e.com/og.jpg' };
    const ctx = { ...defaultCtx, sourceUrl: 'https://e.com/x', linkPreview: preview };
    const r = okResult({ ...baseRaw, type: 'link' }, ctx);
    expect(r.item.payload).toEqual({ url: 'https://e.com/x', preview });

    const other = okResult({ ...baseRaw, type: 'link', link: { url: 'https://other.test/' } }, ctx);
    expect(other.item.payload).toEqual({ url: 'https://other.test/' });
  });

  it('narrows image to text when there is no imagePublicId', () => {
    const raw = { ...baseRaw, type: 'image' };
    const r = okResult(raw);
    expect(r.item.type).toBe('text');
    expect(r.summary.type).toBe('text');
  });

  it('keeps image with publicId and alt set to the title', () => {
    const raw = { ...baseRaw, type: 'image' };
    const r = okResult(raw, {
      categoryIds: ['00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2'],
      imagePublicId: 'gobbit/ingest/d/x',
    });
    expect(r.item).toMatchObject({
      type: 'image',
      payload: { publicId: 'gobbit/ingest/d/x', alt: 'Plumber' },
    });
  });

  it('rejects a proposal missing the title, mentioning title in the error', () => {
    const { title: _omitted, ...raw } = baseRaw;
    const result = validateProposal(raw, defaultCtx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('title');
  });

  it('rejects confidence above 1', () => {
    const result = validateProposal({ ...baseRaw, confidence: 2 }, defaultCtx);
    expect(result.ok).toBe(false);
  });

  it('shouldEscalate flags confidence below EXTRACT_CONFIDENCE_MIN only', () => {
    expect(shouldEscalate(0.59)).toBe(true);
    expect(shouldEscalate(0.6)).toBe(false);
  });

  it('correctionMessage includes the error and the tool name', () => {
    const message = correctionMessage('x');
    expect(message).toContain('x');
    expect(message).toContain('propose_card');
  });

  it('keeps only the first EXTRACT_MAX_CATEGORIES valid category ids', () => {
    const raw = {
      ...baseRaw,
      categoryIds: [
        '00000000-0000-4000-8000-0000000000c1',
        '00000000-0000-4000-8000-0000000000c2',
        '00000000-0000-4000-8000-0000000000c3',
      ],
    };
    const r = okResult(raw, {
      categoryIds: [
        '00000000-0000-4000-8000-0000000000c1',
        '00000000-0000-4000-8000-0000000000c2',
        '00000000-0000-4000-8000-0000000000c3',
      ],
    });
    expect(r.summary.categoryIds).toEqual([
      '00000000-0000-4000-8000-0000000000c1',
      '00000000-0000-4000-8000-0000000000c2',
    ]);
    expect(r.item.categoryIds).toEqual([
      '00000000-0000-4000-8000-0000000000c1',
      '00000000-0000-4000-8000-0000000000c2',
    ]);
  });

  it('trims newCategory into summary', () => {
    const raw = { ...baseRaw, newCategory: '  Recipes  ' };
    const r = okResult(raw);
    expect(r.summary.newCategory).toBe('Recipes');
  });
});

describe('extract-validate for locked hosts (D167)', () => {
  const sourceUrl = 'https://www.instagram.com/p/abc/';
  const lockedCtx: ValidateContext = {
    ...defaultCtx,
    sourceUrl,
    lockedHost: lockedHostOf(sourceUrl),
    sharedText: `Dan fixed our sink in an hour ${sourceUrl}`,
  };

  it('turns an image or text proposal into a link to the shared post', () => {
    for (const type of ['image', 'text'] as const) {
      const r = okResult({ ...baseRaw, type }, lockedCtx);
      expect(r.item.type).toBe('link');
      expect(r.item.payload).toEqual({
        url: sourceUrl,
        preview: { title: 'Plumber', description: 'Dan fixed our sink in an hour' },
      });
    }
  });

  it('links to the shared post even when the model proposes another URL', () => {
    const r = okResult(
      { ...baseRaw, type: 'link', link: { url: 'https://other.test/' } },
      lockedCtx,
    );
    expect((r.item.payload as { url: string }).url).toBe(sourceUrl);
  });

  it('ignores an OG preview that only names the site', () => {
    const ctx = {
      ...lockedCtx,
      linkPreview: { title: 'Instagram', image: 'https://cdn.test/logo.png' },
    };
    const r = okResult(baseRaw, ctx);
    expect(r.item.payload).toEqual({
      url: sourceUrl,
      preview: { title: 'Plumber', description: 'Dan fixed our sink in an hour' },
    });
  });

  const og = {
    title: 'Dan on Instagram: "Sink"',
    description: 'Sink done',
    image: 'https://cdn.test/p.jpg',
  };

  it('keeps a real OG title and image, with the caption before the page description (D347)', () => {
    const r = okResult(baseRaw, { ...lockedCtx, linkPreview: og });
    expect(r.item.payload).toEqual({
      url: sourceUrl,
      preview: { ...og, description: 'Dan fixed our sink in an hour' },
    });
  });

  it('uses the page description when the share has no caption', () => {
    const r = okResult(baseRaw, { ...lockedCtx, sharedText: sourceUrl, linkPreview: og });
    expect(r.item.payload).toEqual({ url: sourceUrl, preview: og });
    expect(r.item.title).toBe('Plumber');
  });

  describe('honest text (D348)', () => {
    const bare = { ...lockedCtx, sharedText: `  ${sourceUrl} ` };

    it('writes the title and body itself when nothing could be read', () => {
      const r = okResult({ ...baseRaw, title: 'Instagram Reel by User' }, bare);
      expect(r.item.title).toBe('Instagram link');
      expect(r.item.body).toBe("Shared from Instagram; its content couldn't be read.");
      expect(r.item.payload).toEqual({ url: sourceUrl, preview: { title: 'Instagram link' } });
      expect(needsHonestLockedText(bare)).toBe(true);
    });

    it('treats a generic page title as nothing read', () => {
      const ctx = { ...bare, linkPreview: { title: 'Log in • Instagram' } };
      expect(okResult(baseRaw, ctx).item.title).toBe('Instagram link');
    });

    it('keeps the model text when there is a caption or a real title', () => {
      expect(okResult(baseRaw, lockedCtx).item.title).toBe('Plumber');
      expect(okResult(baseRaw, { ...bare, linkPreview: og }).item.title).toBe('Plumber');
      expect(needsHonestLockedText(lockedCtx)).toBe(false);
    });

    it('never applies to other hosts', () => {
      const ctx = { ...defaultCtx, sourceUrl: 'https://e.com/x', lockedHost: null };
      expect(needsHonestLockedText(ctx)).toBe(false);
      expect(honestLockedText('TikTok').title).toBe('TikTok link');
    });
  });

  it('uses the shared image as the stored copy with its dimensions', () => {
    const ctx = {
      ...lockedCtx,
      imagePublicId: 'gobbit/ingest/d1/p',
      imageDimensions: { width: 1080, height: 1350 },
      linkPreview: { title: 'Dan on Instagram', image: 'https://cdn.test/p.jpg' },
    };
    const r = okResult(baseRaw, ctx);
    const preview = (r.item.payload as { preview: Record<string, unknown> }).preview;
    expect(preview).toMatchObject({ publicId: 'gobbit/ingest/d1/p', width: 1080, height: 1350 });
    expect(preview.image).toBeUndefined();
  });

  it('trims a long caption to LOCKED_CAPTION_MAX', () => {
    const r = okResult(baseRaw, { ...lockedCtx, sharedText: 'Word. '.repeat(200) });
    const preview = (r.item.payload as { preview: { description: string } }).preview;
    expect(codePointLength(preview.description)).toBeLessThanOrEqual(LOCKED_CAPTION_MAX);
  });

  it('leaves other hosts alone', () => {
    const ctx = { ...defaultCtx, sourceUrl: 'https://e.com/x', lockedHost: null };
    expect(okResult(baseRaw, ctx).item.type).toBe('text');
  });
});
