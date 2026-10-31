import { describe, expect, it } from 'vitest';
import type { NormalizedSource } from '@gobbit/shared';
import { createFakeExtractor } from './fake-extractor';
import type { ExtractInput } from './extractor';
import { validateProposal } from './extract-validate';

function src(over: Partial<NormalizedSource> = {}): NormalizedSource {
  return {
    text: 'Dana the plumber\nCall 03-555-0199 any time.',
    images: [],
    fetch: { status: null, finalUrl: null, ms: 0, fallback: 'skipped' },
    ...over,
  };
}

function makeInput(
  over: Partial<NormalizedSource> = {},
  categories = [] as ExtractInput['categories'],
): ExtractInput {
  return { source: src(over), categories, examples: [] };
}

const validObj = {
  type: 'text',
  title: 'T',
  body: 'B',
  categoryIds: [],
  language: 'en',
  confidence: 0.9,
};

describe('createFakeExtractor (fake-extractor)', () => {
  it('derived output passes validateProposal with title, category and phone entity', async () => {
    const extractor = createFakeExtractor();
    const call = await extractor.extract(
      makeInput({}, [{ id: '00000000-0000-4000-8000-0000000000c1', name: 'Home' }]),
      {
        model: 'm',
      },
    );

    const result = validateProposal(call.raw, {
      categoryIds: ['00000000-0000-4000-8000-0000000000c1'],
    });
    expect(result).toMatchObject({
      ok: true,
      item: {
        title: 'Dana the plumber',
        categoryIds: ['00000000-0000-4000-8000-0000000000c1'],
        entities: { phones: ['03-555-0199'] },
      },
    });
  });

  it('derives type link when the source has a url and image when it has images', async () => {
    const extractor = createFakeExtractor();

    const linkCall = await extractor.extract(makeInput({ url: 'https://example.com/a' }), {
      model: 'm',
    });
    expect(linkCall.raw).toMatchObject({ type: 'link', link: { url: 'https://example.com/a' } });

    const imageCall = await extractor.extract(makeInput({ images: ['https://x/y.jpg'] }), {
      model: 'm',
    });
    expect(imageCall.raw).toMatchObject({ type: 'image' });
  });

  it('prefers og.title over the first text line for the title', async () => {
    const extractor = createFakeExtractor();
    const call = await extractor.extract(
      makeInput({
        og: { title: 'Plumber Dana', description: null, image: null, siteName: null },
      }),
      { model: 'm' },
    );

    expect(call.raw).toMatchObject({ title: 'Plumber Dana' });
  });

  it('honors the confidence option', async () => {
    const extractor = createFakeExtractor({ confidence: 0.42 });
    const call = await extractor.extract(makeInput(), { model: 'm' });

    expect(call.raw).toMatchObject({ confidence: 0.42 });
  });

  it('returns scripted outputs in order and repeats the last one', async () => {
    const extractor = createFakeExtractor({ script: [{ bad: true }, validObj] });
    const first = await extractor.extract(makeInput(), { model: 'm' });
    const second = await extractor.extract(makeInput(), { model: 'm' });
    const third = await extractor.extract(makeInput(), { model: 'm' });

    expect(first.raw).toEqual({ bad: true });
    expect(second.raw).toEqual(validObj);
    expect(third.raw).toEqual(validObj);
  });

  it('records the model passed in opts on each call', async () => {
    const extractor = createFakeExtractor();
    await extractor.extract(makeInput(), { model: 'claude-x' });

    expect(extractor.calls).toHaveLength(1);
    expect(extractor.calls[0]).toMatchObject({ model: 'claude-x' });
  });

  it('reports provider fake', () => {
    const extractor = createFakeExtractor();
    expect(extractor.provider).toBe('fake');
  });

  it('reports inputTokens equal to the source text length', async () => {
    const extractor = createFakeExtractor();
    const input = makeInput();
    const call = await extractor.extract(input, { model: 'm' });

    expect(call.inputTokens).toBe(input.source.text.length);
    expect(call.outputTokens).toBe(50);
  });
});
