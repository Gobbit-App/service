/** D186 (ADR-057): what happened to a card. */
export const itemEventKinds = [
  'created',
  'proposed',
  'published',
  'updated',
  'archived',
  'restored',
  'deleted',
  'undeleted',
  'discarded',
  'merged',
] as const;
export type ItemEventKind = (typeof itemEventKinds)[number];

/**
 * D186: the kind of client behind a change. `session` = the web app or an API script, `ingest` =
 * a proposal made from a share. Phase 13 adds `mcp`.
 */
export const actorVias = ['session', 'ingest'] as const;
export type ActorVia = (typeof actorVias)[number];

/** D186: the card fields a `changes` list names. */
export const itemEventFields = [
  'title',
  'body',
  'payload',
  'categories',
  'sourceUrl',
  'entities',
  'verifiedAt',
  'type',
  'status',
] as const;
export type ItemEventField = (typeof itemEventFields)[number];

/** D186: the only kinds that carry a `changes` list (DB CHECK `item_events_changes_chk`). */
export const itemEventKindsWithChanges = ['updated', 'merged'] as const;

/** Longest title snapshot kept on an event (`item_events.title`). */
export const ITEM_EVENT_TITLE_MAX = 200;
/** D188: page size of `GET /decks/{id}/events`. */
export const ITEM_EVENT_PAGE_DEFAULT = 30;
export const ITEM_EVENT_PAGE_MAX = 50;
