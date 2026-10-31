import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IngestAccepted } from '@gobbit/shared';
import { trackContent } from '../analytics/analytics';
import { buildIngestForm, type IngestDraft } from '../share/share-payload';
import { api, unwrap } from './client';
import { REVIEW_KEY } from './query-keys';

/** D108: `POST /ingest` as multipart (the API takes JSON too, but images need a form). */
export function useSubmitShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: IngestDraft): Promise<IngestAccepted> =>
      unwrap(
        api.POST('/ingest', {
          // openapi-fetch passes FormData through and lets the browser set the boundary.
          body: buildIngestForm(draft) as never,
        }),
      ),
    // The proposal shows up once the worker is done; the pill refetches on focus as well.
    onSuccess: (_accepted, draft) => {
      trackContent('card-shared', { deckId: draft.deckId || undefined, channel: 'share-target' });
      return qc.invalidateQueries({ queryKey: [REVIEW_KEY] });
    },
  });
}
