/**
 * D205: the one rule every URL input follows. The server still requires a full http(s) address
 * (`httpUrlSchema`); this only fills in what a member would otherwise have to type.
 */

/** What an empty URL input shows on focus. */
export const URL_PREFIX = 'https://';

const WEB_SCHEME_RE = /^(https?):\/\//i;
const ONLY_SCHEME_RE = /^https?:\/\/$/i;
const DOUBLED_SCHEME_RE = /^https?:\/\/(?=https?:\/\/)/i;
/** Another scheme (`mailto:`, `javascript:`): letters then `:` not followed by a digit (a port). */
const OTHER_SCHEME_RE = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** `https://https://x` → `https://x`: a full address pasted over the prefill. */
export function collapseDoubledScheme(value: string): string {
  let out = value;
  while (DOUBLED_SCHEME_RE.test(out)) out = out.replace(DOUBLED_SCHEME_RE, '');
  return out;
}

/**
 * Normalises what a member typed: trimmed; only a scheme → ''; doubled scheme collapsed;
 * http(s) kept with the scheme lowercased; `//host` and bare hosts get `https://`; any other
 * scheme is left as typed so validation refuses it.
 */
export function normalizeUrlInput(raw: string): string {
  const value = collapseDoubledScheme(raw.trim());
  if (value === '' || ONLY_SCHEME_RE.test(value)) return '';
  const web = WEB_SCHEME_RE.exec(value);
  if (web) return `${web[1]!.toLowerCase()}://${value.slice(web[0].length)}`;
  if (value.startsWith('//')) return `${URL_PREFIX}${value.slice(2)}`;
  if (OTHER_SCHEME_RE.test(value)) return value;
  return `${URL_PREFIX}${value}`;
}
