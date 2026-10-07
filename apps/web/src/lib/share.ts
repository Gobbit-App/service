/** Constructs a shareable URL for an item. */
export function shareUrl(origin: string, itemId: string): string {
  const trimmedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${trimmedOrigin}/s/${encodeURIComponent(itemId)}`;
}

/** Navigator-like interface for sharing functionality. */
export type ShareNavigator = {
  share?: (data: { url: string; title?: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

/** Outcome of attempting to share an item. */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Attempts to share an item using Web Share API or clipboard fallback. */
export async function shareItem(
  data: { url: string; title?: string },
  nav: ShareNavigator,
): Promise<ShareOutcome> {
  if (nav.share) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return 'cancelled';
      }
      // Fall through to clipboard
    }
  }

  if (nav.clipboard) {
    try {
      await nav.clipboard.writeText(data.url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}
