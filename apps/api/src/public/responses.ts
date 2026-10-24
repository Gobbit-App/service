import { badRequestPage, notFoundPage } from './pages';

/** D180: pages and permanent redirects; edits reach readers within five minutes. */
export const PAGE_CACHE_CONTROL = 'public, max-age=300';
/** D182: search result pages are short-lived in shared caches and never in the page cache. */
export const SEARCH_PAGE_CACHE_CONTROL = 'public, max-age=60';
/** A page that becomes public should not stay "not found" for long. */
export const NOT_FOUND_CACHE_CONTROL = 'public, max-age=60';
/** D178: member redirects and `?view=public` answers are per caller. */
export const PRIVATE_CACHE_CONTROL = 'private, no-store';

/** What a public route answers; the route copies it onto the response unchanged. */
export type PageResponse = {
  status: 200 | 301 | 302 | 400 | 404;
  /** HTML body; empty for redirects. */
  html: string;
  headers: Record<string, string>;
};

const NOINDEX = { 'X-Robots-Tag': 'noindex' };

export function htmlPage(html: string, cacheControl: string, noindex: boolean): PageResponse {
  return {
    status: 200,
    html,
    headers: { 'Cache-Control': cacheControl, ...(noindex ? NOINDEX : {}) },
  };
}

export function redirect(status: 301 | 302, location: string, cacheControl: string): PageResponse {
  return { status, html: '', headers: { Location: location, 'Cache-Control': cacheControl } };
}

/** One answer for every "not public" reason (D174). */
export function notFound(): PageResponse {
  return {
    status: 404,
    html: notFoundPage(),
    headers: { 'Cache-Control': NOT_FOUND_CACHE_CONTROL, ...NOINDEX },
  };
}

export function badRequest(): PageResponse {
  return {
    status: 400,
    html: badRequestPage(),
    headers: { 'Cache-Control': 'no-store', ...NOINDEX },
  };
}
