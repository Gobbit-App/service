import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STATS_BASE_PATH } from '../../api/src/public/analytics';

const caddyfile = readFileSync(new URL('../Caddyfile', import.meta.url), 'utf8');

/** The body of `handle <path> { … }` (one level of nested braces). */
function handleBody(path: string): string | undefined {
  const escaped = path.replace(/[.*/]/g, '\\$&');
  return new RegExp(`\\n\\thandle ${escaped} \\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\n\\t\\}`).exec(
    caddyfile,
  )?.[1];
}

/** D54's CSP; the same-origin tracker needs no change (D232). */
const CSP =
  "default-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https://res.cloudinary.com https://api.cloudinary.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'";

describe('Caddyfile analytics proxy (D232, contract §1)', () => {
  const proxied = [`${STATS_BASE_PATH}/script.js`, `${STATS_BASE_PATH}/api/send`];

  it('handles exactly the two Umami paths and 404s the rest of the prefix', () => {
    const statsHandles = [...caddyfile.matchAll(/\n\thandle (\/stats\/\S*) \{/g)].map((m) => m[1]);
    expect(statsHandles).toEqual([...proxied, `${STATS_BASE_PATH}/*`]);
    expect(handleBody(`${STATS_BASE_PATH}/*`)?.trim()).toBe('respond 404');
  });

  it.each(proxied)('%s strips the prefix and goes to ANALYTICS_UPSTREAM', (path) => {
    const body = handleBody(path);
    expect(body).toContain(`uri strip_prefix ${STATS_BASE_PATH}\n`);
    expect(body).toContain('reverse_proxy {$ANALYTICS_UPSTREAM:umami:3000}');
  });

  it('the stats handles come before the SPA fallback', () => {
    expect(caddyfile.indexOf(`handle ${STATS_BASE_PATH}/*`)).toBeLessThan(
      caddyfile.indexOf('\n\thandle {'),
    );
  });

  it('keeps the CSP unchanged', () => {
    expect(caddyfile).toContain(`Content-Security-Policy "${CSP}"`);
  });
});
