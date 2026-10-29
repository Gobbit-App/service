import { CARD_BODY_MAX, EXTRACT_TITLE_TARGET } from '@gobbit/shared';
import type { ProposeCardInput } from './extract-prompt';
import { truncateAtSentence } from './extract-validate';
import type { ExtractCall, ExtractInput, Extractor } from './extractor';

const PHONE_PATTERN = /\+?\d[\d\s-]{6,}\d/g;

/**
 * Test extractor: records every call; returns scripted raw outputs when `script` is given,
 * otherwise a derived valid `propose_card` input.
 */
export function createFakeExtractor(opts?: {
  script?: unknown[];
  confidence?: number;
}): Extractor & { calls: { input: ExtractInput; model: string }[] } {
  const calls: { input: ExtractInput; model: string }[] = [];
  const script = opts?.script;
  return {
    provider: 'fake',
    calls,
    async extract(
      input: ExtractInput,
      callOpts: { model: string; signal?: AbortSignal },
    ): Promise<ExtractCall> {
      calls.push({ input, model: callOpts.model });
      const n = calls.length - 1;
      const raw =
        script && script.length > 0
          ? script[Math.min(n, script.length - 1)]
          : derive(input, opts?.confidence ?? 0.9);
      return { raw, inputTokens: input.source.text.length, outputTokens: 50 };
    },
  };
}

function derive(input: ExtractInput, confidence: number): ProposeCardInput {
  const { source } = input;
  const firstLine = source.text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const rawTitle = source.og?.title ?? source.pageTitle ?? firstLine ?? 'Untitled';
  const type: ProposeCardInput['type'] =
    source.images.length > 0 ? 'image' : source.url ? 'link' : 'text';
  const phones = [...new Set(Array.from(source.text.matchAll(PHONE_PATTERN), (m) => m[0].trim()))];
  const first = input.categories[0];
  const categoryIds = first ? [first.id] : [];
  const link = source.url ? { link: { url: source.url } } : {};
  const entities = phones.length > 0 ? { entities: { phones } } : {};
  return {
    type,
    title: truncateAtSentence(rawTitle.trim(), EXTRACT_TITLE_TARGET),
    body: truncateAtSentence(source.text.trim(), CARD_BODY_MAX),
    ...link,
    ...entities,
    categoryIds,
    newCategory: null,
    language: 'en',
    confidence,
  };
}
