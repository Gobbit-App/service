/** Structural equality for JSON-like values; object key order is ignored (jsonb reorders keys). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => jsonEqual(value, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const aKeys = definedKeys(a);
    const bKeys = definedKeys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => jsonEqual(a[key], b[key]));
  }
  return false;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Keys whose value survives JSON.stringify (undefined is dropped). */
function definedKeys(o: Record<string, unknown>): string[] {
  return Object.keys(o).filter((key) => o[key] !== undefined);
}

/** Same members, any order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
