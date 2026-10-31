import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importInChunks, type ImportRowDraft, type ImportRunResult } from '@gobbit/shared/import';
import { deckIdFromCache, trackContent } from '../analytics/analytics';
import { isApiError } from '../api/api-error';
import { api, unwrap } from '../api/client';
import { problemMessages } from '../api/problem-messages';
import { queryKeys } from '../api/query-keys';

export type ImportNotesVars = { label: string; drafts: readonly ImportRowDraft[] };

/** A failed later chunk: its rows are reported with the problem the API (or network) gave. */
function describeError(err: unknown) {
  return {
    problem: (isApiError(err) && err.problem?.type) || '/problems/request-failed',
    detail: problemMessages(err)[0],
  };
}

/**
 * D190: sends the ticked rows in chunks of `IMPORT_ROWS_PER_REQUEST`; lives in the lazy
 * import chunk with the parser. The queue and its pill refetch afterwards.
 */
export function useImportNotes(deckSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, drafts }: ImportNotesVars): Promise<ImportRunResult> =>
      importInChunks(
        drafts,
        (rows) =>
          unwrap(
            api.POST('/decks/{id}/imports', {
              params: { path: { id: deckSlug } },
              body: { label, rows },
            }),
          ),
        { describeError },
      ),
    onSuccess: ({ imported }) => {
      // D248: proposals made from notes, counted on their own channel.
      if (imported > 0) {
        trackContent('card-created', {
          deckId: deckIdFromCache(qc, deckSlug),
          count: imported,
          channel: 'import',
        });
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.review(deckSlug) }),
  });
}
