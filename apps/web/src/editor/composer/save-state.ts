/** Why Save can't run right now (D308), or null when it can. */
export function saveBlockedReason(errorCount: number, calcReady: boolean): string | null {
  if (errorCount > 0) return errorCount === 1 ? 'Fix 1 field' : `Fix ${errorCount} fields`;
  if (!calcReady) return 'Loading the calculator…';
  return null;
}

/**
 * D308: the reason shows under the top bar only once it is news to the person: after they changed
 * something, or after they tried to save. A fresh card does not open with "Fix 1 field".
 */
export function showSaveReason(
  reason: string | null,
  { changed, attempted }: { changed: boolean; attempted: boolean },
): boolean {
  return reason !== null && (changed || attempted);
}
