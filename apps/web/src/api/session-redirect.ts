/** Validates and returns a safe redirect path or null. */
export function safeNext(next: unknown): string | null {
  if (typeof next !== 'string') {
    return null;
  }

  if (next.length > 512) {
    return null;
  }

  if (!/^\/[^/\\]/.test(next)) {
    return null;
  }

  // Check for control chars (code < 0x20 or >= 0x7f)
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i);
    if (code < 0x20 || code >= 0x7f) {
      return null;
    }
  }

  if (next.startsWith('/sign-in') || next.startsWith('/auth/')) {
    return null;
  }

  return next;
}

/** Returns the sign-in href for the current path. */
export function signInHref(currentPath: string): string {
  const safe = safeNext(currentPath);
  if (safe === null) {
    return '/sign-in';
  }
  return `/sign-in?next=${encodeURIComponent(safe)}`;
}

/** Returns the target path after sign-in. */
export function postSignInTarget(next: unknown): string {
  return safeNext(next) ?? '/';
}
