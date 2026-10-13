/** Queue names shared by the API (sender) and the worker (D72, D80). */
export const QUEUES = {
  embedItem: 'embed-item',
  embedSweep: 'embed-sweep',
  pruneSearchQueries: 'prune-search-queries',
} as const;

export interface EmbedItemJob {
  itemId: string;
}

/** The slice of pg-boss the enqueuers need; a recording fake stands in for it in tests. */
export interface JobSender {
  send(
    name: string,
    data: object,
    options?: { singletonKey?: string; retryLimit?: number; retryBackoff?: boolean },
  ): Promise<string | null>;
}

/** D72: retries with exponential backoff for provider blips. */
export const EMBED_ITEM_SEND_OPTIONS = { retryLimit: 3, retryBackoff: true } as const;
