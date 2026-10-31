import type { Deck, IngestToken } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { INGEST_TOKEN_PREFIX } from '@gobbit/shared/ingest-constants';

/** D104: the email-in address is the token without its `ing_` prefix at the inbound domain. */
export function ingestEmailAddress(token: string, domain: string | null): string | null {
  if (!domain || !token.startsWith(INGEST_TOKEN_PREFIX)) return null;
  return `${token.slice(INGEST_TOKEN_PREFIX.length)}@${domain}`;
}

/** A token bound to no deck: shares land in the personal deck unless the request names one. */
export const UNBOUND_SCOPE = 'My personal deck (default)';

/** Where a token's shares land: its bound deck, else the request's deck or the personal one. */
export function tokenScope(token: Pick<IngestToken, 'deckId'>, decks: readonly Deck[]): string {
  if (token.deckId === null) return UNBOUND_SCOPE;
  return decks.find((d) => d.id === token.deckId)?.name ?? 'A deck you left';
}

export function lastUsedLabel(lastUsedAt: string | null, locale?: string): string {
  if (!lastUsedAt) return 'Never used';
  return `Last used ${new Date(lastUsedAt).toLocaleDateString(locale)}`;
}

/** Decks a token may be bound to: the same roles that can share into them. */
export function bindableDecks(decks: readonly Deck[]): Deck[] {
  return decks.filter((d) => can(d.role, 'item.create'));
}
