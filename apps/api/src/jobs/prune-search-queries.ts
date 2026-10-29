import { SEARCH_QUERY_RETENTION_DAYS } from '@gobbit/shared';
import type { SearchQueriesRepo } from '../repositories/search-queries.repo';

const DAY_MS = 86_400_000;

/** D80: drops query-log rows older than the retention window; returns the count removed. */
export function createPruneSearchQueries(deps: {
  searchQueries: Pick<SearchQueriesRepo, 'pruneBefore'>;
  now?: () => Date;
  retentionDays?: number;
}) {
  const {
    searchQueries,
    now = () => new Date(),
    retentionDays = SEARCH_QUERY_RETENTION_DAYS,
  } = deps;

  return async function prune(): Promise<number> {
    return await searchQueries.pruneBefore(new Date(now().getTime() - retentionDays * DAY_MS));
  };
}
