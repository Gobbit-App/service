import { api, unwrap } from './client';

/** `DELETE /decks/{id}/welcome` (204, idempotent): ends the caller's first-run welcome. */
export const dismissWelcome = (deckId: string): Promise<unknown> =>
  unwrap(api.DELETE('/decks/{id}/welcome', { params: { path: { id: deckId } } }));
