/** An http(s) source as `{ href, host }`, or null for anything else (never a `javascript:` link). */
export function sourceLink(url: string | null): { href: string; host: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return { href: parsed.href, host: parsed.host };
  } catch {
    return null;
  }
}
