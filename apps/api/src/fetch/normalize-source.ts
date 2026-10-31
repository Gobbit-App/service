import { INGEST_TEXT_MAX, type IngestRaw, type NormalizedSource } from '@gobbit/shared';
import type { ExtractedPage } from './extract-page';

/** Result of fetching the raw URL. Absent when no fetch was attempted. */
export interface FetchOutcome {
  status: number | null;
  finalUrl: string | null;
  ms: number;
  error?: string | null;
  page?: ExtractedPage | null;
}

/** Joins non-empty trimmed parts with a blank line, capped at INGEST_TEXT_MAX chars. */
function join(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join('\n\n')
    .slice(0, INGEST_TEXT_MAX);
}

/**
 * Builds the normalized source used for extraction, choosing the richest
 * text available from the raw input and the fetched page.
 */
export function buildNormalizedSource(input: {
  raw: IngestRaw;
  imageUrls: string[];
  fetch?: FetchOutcome;
}): NormalizedSource {
  const { raw, imageUrls, fetch } = input;
  const urlField = raw.url ? { url: raw.url } : {};

  if (!raw.url || !fetch) {
    return {
      text: join([raw.title, raw.text]),
      ...urlField,
      images: imageUrls,
      fetch: {
        status: null,
        finalUrl: null,
        ms: 0,
        fallback: 'skipped',
        error: fetch?.error ?? null,
      },
    };
  }

  const page = fetch.page ?? null;
  const fetchField = {
    status: fetch.status,
    finalUrl: fetch.finalUrl,
    ms: fetch.ms,
    error: fetch.error ?? null,
  };
  const pageFields = page ? { pageTitle: page.title, og: page.og, lang: page.lang } : {};

  if (page && page.text.trim().length > 0) {
    return {
      text: join([raw.text, page.text]),
      ...urlField,
      ...pageFields,
      images: imageUrls,
      fetch: { ...fetchField, fallback: 'none' },
    };
  }

  if (page && (page.og.title || page.og.description)) {
    return {
      text: join([raw.text, page.og.title, page.og.description]),
      ...urlField,
      ...pageFields,
      images: imageUrls,
      fetch: { ...fetchField, fallback: 'og' },
    };
  }

  return {
    text: join([raw.title, raw.text]),
    ...urlField,
    ...pageFields,
    images: imageUrls,
    fetch: { ...fetchField, fallback: 'shared_text' },
  };
}
