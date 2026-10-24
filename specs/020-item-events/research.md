# Research: Deck activity log

Decisions continue the project-wide D numbering. Phase 8 reserves D174–D191. This feature owns **D186–D188**; D186 and D187 are recorded in **ADR-057**.

## What exists today

- `Actor { user, via: 'session' }` (D130, ADR-050) reaches every `items.service` method; Phase 13 adds `'mcp'` and a connection id.
- `items.created_by` is the only authorship record; edits, archives and reviews leave no trace of who did them.
- Card writes happen in `items.service` (create, update, archive, restore, delete, undelete), `review.service` (publish, discard, merge into a target) and `ingest/propose.ts` (proposals from sharing and `proposeDirect`).

## D186 — `item_events` table

- **Decision**: one append-only table per the plan's table; enums `actor_via` and `item_event_kind`; `title` snapshot; `changes` as field names; FKs: deck cascade, item and actor set null; CHECK `changes IS NULL OR kind IN ('updated', 'merged')`.
- **Rationale**: a narrow, typed table answers "who did what" cheaply and survives purges and account deletion. Field names give enough to investigate without copying content (privacy, size).
- **Alternatives considered**:
  - **Full before/after JSON**: doubles storage, copies private content into a second place that needs its own GDPR handling.
  - **Generic `audit_log` for all entities**: no other entity needs it in Phase 8; a `kind` enum per entity is clearer when it does.
  - **Reuse `ingest_jobs`**: covers proposals only.

## D187 — Writing events

- **Decision**: repository writes take `event?: ItemEventInput` and insert it inside their transaction (`softDelete`/`undelete` gain a transaction). Services build the input from the `Actor` (`actorUserId`, `via`) plus `kind`, the title after the change, and `diffFields(before, after)` for updates. `review.service.publish/discard` take an `Actor`. `proposeItem` logs `proposed` with `via: 'ingest'` and the job's user. No line when `diffFields` is empty or for system writes.
- **Rationale**: the same transaction guarantees "one line iff committed" without outbox machinery. Explicit arguments keep the actor and `via` visible where they are known.
- **Alternatives considered**:
  - **Postgres trigger**: atomic, but can't know the actor or `via` without session variables (`SET LOCAL`) on every connection, which is fragile with pooling.
  - **Fire-and-forget after commit** (like search logs): loses lines on crashes; acceptable for analytics, not for an audit log.
  - **pg-boss job**: same problem, more moving parts.

## D188 — Reading the log

- **Decision**: `GET /decks/{id}/events` with keyset pagination on `(created_at desc, id desc)`, `limit` ≤ 50, optional `itemId`; new permission `event.list` for owner and maintainer; the service joins display names (or "Former member"). PWA: lazy `/d/$slug/log`, a card-page "History" link that opens it filtered.
- **Rationale**: admins are the accountable roles; one endpoint serves the deck view and the card view.
- **Alternatives considered**: per-item endpoint (`/items/{id}/events`, duplicates pagination); visible to all members (exposes who edited what to readers in a community deck).
