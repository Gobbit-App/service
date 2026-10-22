import type { SafeFetchResult } from './safe-fetch';

/** D164: what one probe of a link says. */
export type LinkProbeClass = 'ok' | 'changed' | 'definite' | 'temporary';

/** Errors that mean the page is gone, not that the site had a bad moment. */
const DEFINITE_ERRORS = new Set(['http_404', 'http_410', 'blocked']);
/** DNS name not found, connection refused (`fetch_failed: …` messages from undici / the lookup). */
const DEFINITE_FETCH_FAILURE = /ENOTFOUND|ECONNREFUSED/;
/** "Article title | Site", "Article - Site", "Article — Site", "Article · Site". */
const SITE_SUFFIX = /\s+[|\-–—·:]{1,2}\s+[^|\-–—·:]+$/u;

/** Case, spacing and punctuation insensitive. */
function normalize(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The normalized title with and without a trailing site name. */
function titleForms(title: string): Set<string> {
  const forms = new Set([normalize(title), normalize(title.replace(SITE_SUFFIX, ''))]);
  forms.delete('');
  return forms;
}

/** True when the titles are the same page title, allowing for a site name suffix on either. */
export function sameTitle(a: string, b: string): boolean {
  const formsA = titleForms(a);
  for (const form of titleForms(b)) {
    if (formsA.has(form)) return true;
  }
  return false;
}

/** The title kept on a check row (normalized, at most `max` code points). */
export function normalizedTitle(title: string | null, max: number): string | null {
  if (!title) return null;
  const n = normalize(title);
  return n ? Array.from(n).slice(0, max).join('') : null;
}

/**
 * D164: 2xx → `ok`, or `changed` when both the page title and the stored preview title exist
 * and differ; 404/410/DNS not found/connection refused/blocked → `definite`; everything else
 * (timeout, 5xx, 429, 403, redirect loops, other failures) → `temporary`.
 */
export function classify(
  result: Pick<SafeFetchResult, 'error'>,
  pageTitle: string | null,
  storedTitle: string | null | undefined,
): LinkProbeClass {
  const { error } = result;
  if (error === null) {
    if (pageTitle && storedTitle && !sameTitle(pageTitle, storedTitle)) return 'changed';
    return 'ok';
  }
  if (DEFINITE_ERRORS.has(error)) return 'definite';
  if (error.startsWith('fetch_failed') && DEFINITE_FETCH_FAILURE.test(error)) return 'definite';
  return 'temporary';
}
