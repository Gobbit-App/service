import { useMutation } from '@tanstack/react-query';
import { fetchLinkPreview } from '../api/media';

/** D134: one preview lookup per click; never cached on the client (the API caches for an hour). */
export function useLinkPreview(deckId: string) {
  return useMutation({
    mutationFn: (url: string) => fetchLinkPreview(deckId, url),
    retry: false,
  });
}
