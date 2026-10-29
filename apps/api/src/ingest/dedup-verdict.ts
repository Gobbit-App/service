import {
  DEDUP_POSSIBLE_SIMILARITY,
  DEDUP_TITLE_SIMILARITY,
  DEDUP_UPDATE_SIMILARITY,
  type DedupVerdict,
} from '@gobbit/shared';

/** Signals gathered from the database before deciding how to treat an ingested source. */
export interface DedupSignals {
  /** Item id already holding the same normalized source URL, if any. */
  sourceUrlMatch: string | null;
  /** Nearest item by vector similarity, if semantic search ran. */
  nearest: { itemId: string; similarity: number } | null;
  /** Best title-based match, used when semantic search is unavailable. */
  titleMatch: { itemId: string; similarity: number } | null;
  /** Whether semantic (vector) signals are available for this ingest. */
  semantic: boolean;
}

/** Exact query parameter names that are treated as tracking noise. */
const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref_src',
  'si',
]);

/** A direct proposal that names the card it updates: no similarity search ran. */
export function explicitVerdict(itemId: string): DedupVerdict {
  return { action: 'update', itemId, similarity: null, via: 'explicit' };
}

/**
 * Decide how an incoming source relates to existing items.
 * @param s - Dedup signals collected for the source.
 * @returns The dedup verdict (update, possible duplicate, or new).
 */
export function dedupVerdict(s: DedupSignals): DedupVerdict {
  if (s.sourceUrlMatch !== null) {
    return { action: 'update', itemId: s.sourceUrlMatch, similarity: null, via: 'source_url' };
  }

  if (s.semantic && s.nearest) {
    const sim = s.nearest.similarity;
    if (sim >= DEDUP_UPDATE_SIMILARITY) {
      return { action: 'update', itemId: s.nearest.itemId, similarity: sim, via: 'vector' };
    }
    if (sim >= DEDUP_POSSIBLE_SIMILARITY) {
      return {
        action: 'possible_duplicate',
        itemId: s.nearest.itemId,
        similarity: sim,
        via: 'vector',
      };
    }
  }

  if (!s.semantic && s.titleMatch && s.titleMatch.similarity >= DEDUP_TITLE_SIMILARITY) {
    return {
      action: 'possible_duplicate',
      itemId: s.titleMatch.itemId,
      similarity: s.titleMatch.similarity,
      via: 'title',
    };
  }

  return {
    action: 'new',
    itemId: null,
    similarity: (s.semantic ? s.nearest?.similarity : s.titleMatch?.similarity) ?? null,
    via: 'none',
  };
}

/**
 * Normalize a source URL so equivalent links compare equal.
 * Drops hash, default ports (handled by URL), tracking params, trailing slash; sorts params.
 * Invalid URLs are returned trimmed.
 * @param url - Raw URL string.
 * @returns Normalized URL string.
 */
export function normalizeSourceUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.trim();
  }

  parsed.hash = '';

  const toDelete: string[] = [];
  for (const name of parsed.searchParams.keys()) {
    if (name.startsWith('utm_') || TRACKING_PARAMS.has(name)) {
      toDelete.push(name);
    }
  }
  for (const name of toDelete) {
    parsed.searchParams.delete(name);
  }
  parsed.searchParams.sort();

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  if (parsed.pathname === '/' && parsed.search === '') {
    return `${parsed.protocol}//${parsed.host}`;
  }

  return parsed.href;
}
