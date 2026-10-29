# Research: Card lifecycle (006)

Decisions continue the project-wide numbering; Phase 6 reserves D129–D147 (`specs/README.md`). This feature owns **D130, D131, D132, D143, D146**. D129, D133–D142, D144, D145 belong to `specs/007-card-editor`, `specs/008-card-media` and `specs/009-browse-mode`. No new dependency is added.

## D130 — Lifecycle rules live in `items.service`, with an actor

- **Decision**: `items.service` owns every lifecycle transition: `update`, `archive`, `restore`, `remove` (soft delete), `undelete`, `listDeleted`. Each takes an `Actor` first: `{ user: CurrentUser; via: ActorVia }`, with `ActorVia = 'session'` for now (`'mcp'` is added in Phase 13 together with a connection id). Routes build the actor from the authenticated context and do nothing else. Methods are idempotent when the end state already holds. `via` isn't stored in this feature; Phase 8 writes it to `item_events` from these same methods. `create`, `get` and `list` also take the actor, so the service has one calling convention.
- **Rationale**: PLAN.md's Phase 6 MCP note asks for these rules to live in services so the MCP tools reuse them unchanged, and Phase 13 maps its `edit`/`manage` ceilings onto them. PLAN.md Phase 8 says `item_events` records `via` as `session` or `mcp` plus the connection, so the type follows that vocabulary. Changing every signature once, now, is cheaper than twice.
- **Alternatives considered**: (a) Pass `user` only and add `via` in Phase 8: every route and test changes twice. (b) Reuse `Authenticated.via` (`'bearer' | 'cookie'`, D29): that is a credential source, not a client kind; an MCP connection also uses a bearer. (c) `via ∈ web | api | mcp | ingest` (the local Phase 6 draft): cookie vs bearer is not a reliable "web vs script" signal, and ingestion writes through `ingest.service`/`review.service`, not these methods.
- **ADR**: yes → **ADR-050** "Lifecycle rules in services, called with an actor" (ADR-049 records the spec-kit adoption).

## D131 — `verified_at` is set on first publish only; restore keeps it

- **Decision**: `verified_at` is set when a card is created as published and when a proposal is published (`POST /items/{id}/publish`, unchanged). `restore` (archived → published) keeps it. `PATCH /items/{id}` with `status: 'published'` on an archived card is refused with 409 `/problems/use-restore`; `PATCH` with `status: 'archived'` keeps working (same rules as `archive`). Archiving a proposal (by either route) is 409 `/problems/invalid-transition`.
- **Rationale**: Since #32 the Reader shows `verified_at` as the publish date ("Added/Edited … ago", `apps/web/src/lib/card-age.ts`). Today `items.service.update` sets `verifiedAt = new Date()` on any transition to published, so a PATCH restore silently makes an old card look new. One path per transition keeps the rule in one method and the MCP mapping obvious.
- **Alternatives considered**: (a) Keep PATCH as the restore path and special-case archived → published inside `update`: two paths for the same transition, and PATCH's minimal-diff callers (review edit, D107) could restore by accident. (b) A separate `published_at` column: duplicates `verified_at`'s amended meaning for no gain.

## D132 — Soft delete, 30-day undelete, deleted listing, weekly purge

- **Decision**:
  - `DELETE /items/{id}` stays a soft delete (`deleted_at = now()`), permission `item.delete` (owner, maintainer; co-owners are owners). Status is untouched, so undelete only clears `deleted_at`.
  - `POST /items/{id}/undelete` (`item.delete`) clears `deleted_at` when it is within `ITEM_UNDELETE_DAYS = 30` (`packages/shared/src/items/constants.ts`, subpath `@gobbit/shared/item-constants`); later → 410 `/problems/undo-expired`. Live card → idempotent 200.
  - `GET /decks/{id}/items?status=deleted` (`item.delete`, else 403) lists deleted cards with `status <> 'proposed'` and `deleted_at` within the window, ordered `deleted_at DESC, id DESC`, cursor over `(deleted_at, id)`. The DTO gains optional `deletedAt`. `status` in the list query becomes `itemStatuses ∪ {'deleted'}`; the DB enum is unchanged.
  - Proposals soft-deleted by `review.service.discard` or by `publish {mode:'update'}` (D106) are excluded from the listing and are 404 to undelete.
  - A weekly pg-boss job `prune-deleted-items` (`DELETED_ITEM_PRUNE_CRON = '0 5 * * 0'`, singleton queue) hard-deletes items with `deleted_at < now() − 30 days`, proposals included. FKs already handle the rest (`item_categories`, `favorites`, `og_images` cascade; `ingest_jobs.result_item_id`, `llm_calls.item_id` set null), so no FK migration is needed.
  - Migration `0011_item_lifecycle` adds only the partial index `items_deleted_idx (deck_id, deleted_at DESC, id DESC) WHERE deleted_at IS NOT NULL`, with a hand-written down file.
- **Rationale**: The master plan promises "soft delete, owner-only, 30-day undo in the Archived view". Owner-only is relaxed to the existing matrix (`packages/shared/src/authz/can.ts`: `item.delete` = owner, maintainer). Without a purge, "30 days" is only a UI promise, and the Phase 11 GDPR delete needs deleted data to really go. The job name follows the existing `prune-search-queries` / `prune-ingest-jobs` pattern (the local draft called it `purge-deleted-items`). Sunday 05:00 sits after the two existing prune jobs (03:00, 04:00).
- **Alternatives considered**: (a) A `deleted` status value: mixes "where it is" with "whether it exists"; every read path already filters `deleted_at IS NULL` (ADR-005). (b) A separate `/decks/{id}/items/deleted` route: a second listing endpoint with its own pagination; the existing list route already switches on `status`. (c) Purging from the API process: background work belongs to the worker (ADR-042). (d) Daily purge: weekly matches the other prune jobs; the window guarantee is "within 37 days".

## D143 — Deck-relative links go through `deckHref`

- **Decision**: `deckHref(slug: string, path = ''): string` in `apps/web/src/ui/chip-order.ts` builds every deck-scoped href (`/d/<slug>` + `path`, slug encoded). `chipHref` uses it, and the hand-built `/d/${encodeURIComponent(…)}` strings move to it: `review/ReviewPill.tsx`, `items/AddCardLink.tsx`, `routes/index.tsx`, `routes/i.$itemId.tsx`, `routes/d.$slug.new.tsx`, `share/ShareSent.tsx`. Item links stay `/i/<id>`.
- **Rationale**: Phase 12 (custom deck domains, D84–D91) serves a deck at `https://<host>/` without the `/d/<slug>` prefix. With one helper that is one change. 006 is the first Phase 6 feature, and 007 and 009 add new deck links, so it lands here.
- **Alternatives considered**: (a) TanStack Router's typed `<Link to params>` everywhere: correct, but the app's `NavLink` takes a string `href` today, and the Phase 12 rewrite is about the prefix, not the router. (b) Wait for Phase 12: every Phase 6 screen would add more strings to rewrite.

## D146 — Optimistic lifecycle UI with an Undo toast

- **Decision**: Archive, restore, delete and undelete update the cached item lists optimistically: remove from or insert into the `['items', slug, filter]` pages with `removeFromPages` (exists in `apps/web/src/api/favorite-cache.ts`) and a new `insertIntoPages`. They also invalidate `search` keys and `['item', id]`, and roll back on error. Archive and delete show a 6-second `UndoToast` whose Undo calls the inverse endpoint (restore, undelete). Actions are disabled offline (`useOnline()` in `api/offline.ts`).
- **Rationale**: The toast is the quick undo and the 30-day window is the safety net. Search results aren't persisted (D79), so invalidating them is cheap and avoids stale hits (SC-001).
- **Alternatives considered**: (a) Wait for the server before updating lists: a visible lag on every archive for no safety gain, since rollback covers failures. (b) A confirm dialog for archive: archive is reversible, so a dialog adds friction. Delete keeps a confirm because only the window protects it.

## Bundle baseline (groundwork)

- **Decision**: The first task runs `pnpm build:web && pnpm budget` on `main` and records the initial JS size in `implementation-notes.md` and PLAN.md (the last recorded figure, 110 KB gzip, predates the Phase 4 and 5 screens). This feature may add at most about 2 KB gzip to the initial chunk (`CardActions`, `UndoToast`, mutations); everything else in Phase 6 is lazy.
- **Rationale**: Constitution VI (150 KB budget). 007–009 need the real headroom to decide what to lazy-load.
