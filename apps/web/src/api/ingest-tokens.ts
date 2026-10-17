import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { IngestTokenCreate, IngestTokenCreated, IngestTokenList } from '@pb/shared';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/** D99: the user's live ingest tokens (labels and prefixes only, never the secret). */
export const ingestTokensQuery = () =>
  queryOptions({
    queryKey: queryKeys.ingestTokens,
    queryFn: ({ signal }): Promise<IngestTokenList> =>
      unwrap(api.GET('/me/ingest-tokens', { signal })),
  });

/** Mints a token; the response carries the plain token, shown once. */
export function useCreateIngestToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IngestTokenCreate): Promise<IngestTokenCreated> =>
      unwrap(api.POST('/me/ingest-tokens', { body: input })),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ingestTokens }),
  });
}

export function useRevokeIngestToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await unwrap(api.DELETE('/me/ingest-tokens/{id}', { params: { path: { id } } }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ingestTokens }),
  });
}
