/** Returns `next` when it is a safe relative path, otherwise undefined (open-redirect guard). */
export function safeNextPath(next: string | null | undefined): string | undefined {
  if (typeof next !== 'string') {
    return undefined;
  }

  // Bare '/' is not safe
  if (next === '/') {
    return undefined;
  }

  // Must be <= 512 chars
  if (next.length > 512) {
    return undefined;
  }

  // Must match /^\/[^/\\]/ - starts with / and second char is neither / nor \
  if (next.length < 2 || next[0] !== '/' || next[1] === '/' || next[1] === '\\') {
    return undefined;
  }

  // No ASCII control characters (U+0000-U+001F, U+007F)
  for (const char of next) {
    const code = char.charCodeAt(0);
    if (code <= 0x001f || code === 0x007f) {
      return undefined;
    }
  }

  return next;
}
