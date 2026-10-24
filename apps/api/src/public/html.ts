import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

/** A fragment produced by `h` (escaped) or `raw` (trusted markup only). */
export type Html = HtmlEscapedString;

/**
 * D177: `hono/html` tagged template that escapes every interpolation. Public pages never
 * interpolate promises, so the result is always synchronous; anything else is a bug.
 */
export function h(strings: TemplateStringsArray, ...values: unknown[]): Html {
  const out = html(strings, ...values);
  if (out instanceof Promise) {
    throw new Error('public pages render synchronously; a promise was interpolated');
  }
  return out;
}

/** Only for micromark output and fragments built with `h` (D177). */
export { raw };
