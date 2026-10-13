import { readFileSync } from 'node:fs';

/** D81: one eval pair; `expect` holds `search-cards.ts` keys, empty for "no result" cases. */
export interface SearchEvalCase {
  q: string;
  expect: string[];
  lang: 'he' | 'el' | 'en';
  kind: SearchEvalKind;
}

export const searchEvalKinds = [
  'substring',
  'phone',
  'typo',
  'url',
  'none',
  'cross-lingual',
  'meaning',
] as const;
export type SearchEvalKind = (typeof searchEvalKinds)[number];

/** Kinds the text arm alone must answer; the rest need embeddings. */
export const TEXT_EVAL_KINDS: readonly SearchEvalKind[] = [
  'substring',
  'phone',
  'typo',
  'url',
  'none',
];

export const SEARCH_EVAL_PATH = new URL('./search-eval.json', import.meta.url);
export const SEARCH_EMBEDDINGS_PATH = new URL('./search-embeddings.json', import.meta.url);

function isEvalCase(value: unknown): value is SearchEvalCase {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.q === 'string' &&
    Array.isArray(v.expect) &&
    v.expect.every((k) => typeof k === 'string') &&
    typeof v.lang === 'string' &&
    (searchEvalKinds as readonly unknown[]).includes(v.kind)
  );
}

/** Reads and validates `search-eval.json`. */
export function loadSearchEval(path: URL = SEARCH_EVAL_PATH): SearchEvalCase[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('search-eval.json must be an array');
  return parsed.map((entry, i) => {
    if (!isEvalCase(entry)) throw new Error(`search-eval.json entry ${i} is malformed`);
    return entry;
  });
}
