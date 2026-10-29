# Implementation Plan: Card lifecycle (archive, restore, delete, undelete)

**Branch**: `006-card-lifecycle` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Phase 6

**Input**: Feature specification from `/specs/006-card-lifecycle/spec.md`

**Note**: Project override of the core template (`.specify/templates/overrides/`). The repository is public (constitution, Constraints).

## Summary

The first of four Phase 6 features (006 lifecycle → `specs/007-card-editor` → `specs/008-card-media` → `specs/009-browse-mode`). It moves every card lifecycle rule into `items.service`, called with an actor (D130, ADR-050):
- Archive refuses proposals.
- A new `restore` keeps `verified_at` (D131); PATCH can no longer republish.
- Delete stays soft, with a 30-day `undelete` and an owner/maintainer-only `status=deleted` listing (D132).
- A weekly `prune-deleted-items` job purges what is older.

The web app gets role-gated `CardActions` on the card view and on Archived, an optimistic `UndoToast` (D146) and a Recently deleted section with days left. It also gets the groundwork the other Phase 6 features build on: a measured bundle baseline and the `deckHref` link helper (D143). PLAN.md Phase 6 demo 2 ("archive a card, confirm it disappears from search, restore it") is this feature's demo.

## Starting point

- main @ `10b0e2a` (spec-kit adoption, ADR-049), Phase 5 shipped and deployed, including P5.9 MCP readiness (#31) and the settings/card-age fix (#32). Latest migration `0010_mcp_readiness`.
- `items.service` already has `update`, `remove` (soft delete via `items.softDelete`, `item.delete`) and `archive` (idempotent, `item.archive`, **no status check**). `update` sets `verifiedAt = now` on any move to published, so a PATCH restore resets the publish date.
- `POST /items/{id}/archive`, `DELETE /items/{id}` (204), `PATCH /items/{id}` exist in `routes/items.ts`. There are no restore or undelete routes and no listing of deleted cards.
- `review.service` already soft-deletes proposals on Discard and on Publish `{mode:'update'}` (D106). Deleted proposals keep `status='proposed'`.
- Every read path filters `deleted_at IS NULL` (`items.repo.findById`/`list`, `search.repo`). FKs onto `items` already cascade (`item_categories`, `favorites`, `og_images`) or set null (`ingest_jobs.result_item_id`, `llm_calls.item_id`).
- `Authenticated.via` (`'bearer' | 'cookie'`) is a credential source, not a client kind. PLAN.md Phase 8 wants `item_events.via` = `session` or `mcp` plus the connection.
- Web: `routes/d.$slug.archived.tsx` lists archived cards (chip shown to `item.archive` roles), with no actions. There is no shared toast (`ShareButton` keeps local state). `removeFromPages` exists in `api/favorite-cache.ts`. Six files build `/d/…` hrefs by hand.
- Prune jobs follow one pattern: `jobs/prune-search-queries.ts`, `jobs/prune-ingest-jobs.ts`, singleton queues in `ensure-queues.ts`, crons in feature `constants.ts`, scheduled in `worker.ts`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, pg-boss, React + Vite + TanStack Router/Query. No new dependency.

**Storage**: PostgreSQL 17. No new tables or columns; one partial index (`data-model.md`).

**Testing**: Vitest (unit, integration with Testcontainers), Playwright `@smoke`

**Target Platform**: Docker Compose on Dokploy; PWA on Android Chrome

**Project Type**: pnpm monorepo: API + worker, PWA, shared packages

**Performance Goals**: The deleted listing uses the partial index (one deck, newest first). Lifecycle actions update the visible list within one frame (optimistic).

**Constraints**: web initial bundle ≤ 150 KB gzip, with this feature adding ≤ ~2 KB. Undo window 30 days, fixed. Removal guaranteed within 37 days (weekly purge).

**Scale/Scope**: family/community decks, hundreds to low thousands of cards; deleted cards per deck in the tens.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | Routes parse and build the actor (`getActor`). `items.service` owns transitions, `can()` and the window, and throws `conflict`/`gone`/`forbidden`. `items.repo` adds `findByIdIncludingDeleted`, `undelete`, `listDeleted`, `purgeDeletedBefore`. A deck the caller can't see stays 404. |
| II. One source of truth for contracts | `itemListStatuses`, `deletedAt`, `ITEM_UNDELETE_DAYS` (`@gobbit/shared/item-constants`); new routes in OpenAPI; `pnpm api:openapi`. New problem types listed in `contracts/items-lifecycle.md`. |
| III. Invariants live in the database | Index-only migration `0011_item_lifecycle` + hand-written down. The D95 published-has-category trigger already guards undelete. Soft delete stays `deleted_at` (ADR-005). |
| IV. Private by default | The deleted listing requires `item.delete` and keeps the `itemHasVisibleCategory` filter. Undelete goes through the same `loadItem` access path (deck visible, proposal rule D96). Ingest tokens are still refused on these routes (ADR-046). |
| V. Tests at the right tier | Unit: transitions, `daysLeft`, purge job, cache helpers. Int: role × action matrix, window, listing. E2E: demo 2 happy path plus reader-has-no-actions. See traceability. |
| VI. Lean, offline-first web | Small components in the initial chunk. Actions disabled offline (`useOnline`). The persisted query cache gets optimistic edits; search is invalidated, not persisted. Bundle baseline measured first. |
| VII. Simple, optional, deployable | No dependency or env var. No AI involvement. The worker gains one weekly job. Deploy is the normal CI → Dokploy flow. |

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D130 | Lifecycle methods in `items.service` take `actor: { user, via: 'session' }` first (`'mcp'` + connection id in Phase 13). Routes build it; Phase 8 stores `via` in `item_events` from the same methods. | yes → ADR-050 |
| D131 | `verified_at` is set on first publication only; `POST /items/{id}/restore` keeps it. PATCH archived → published is 409 `/problems/use-restore`. Archive/restore of a proposal is 409 `/problems/invalid-transition`. | no |
| D132 | Soft delete; `POST /items/{id}/undelete` within 30 days (else 410 `/problems/undo-expired`); `GET /decks/{id}/items?status=deleted` needs `item.delete` and excludes proposals; weekly `prune-deleted-items` hard-deletes after 30 days; index-only migration 0011. | no (ADR-005 already covers soft delete) |
| D143 | `deckHref(slug, path)` in `ui/chip-order.ts` builds every deck-scoped href; existing hand-built strings move to it. | no |
| D146 | Lifecycle actions are optimistic on the cached lists, roll back on error, invalidate search, and offer a 6-second Undo toast after archive and delete. Delete asks for confirmation first. | no |

## Project Structure

### Documentation (this feature)

```text
specs/006-card-lifecycle/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/items-lifecycle.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md  # created during /speckit-implement
```

### Source Code (repository root)

```text
apps/api/src/
├── types.ts                         # + Actor, ActorVia
├── lib/current-user.ts              # + getActor(c): Actor next to getUser(c)
├── errors/http-errors.ts            # + gone(detail, type) → 410
├── routes/items.ts                  # + POST /items/{id}/restore, POST /items/{id}/undelete; list accepts status=deleted; all calls pass actor
├── services/items.service.ts        # actor first on every method; restore, undelete, listDeleted; archive status check; update refuses archived → published
├── services/items.service.test.ts   # transition rules (unit, fakes)
├── repositories/items.repo.ts       # + findByIdIncludingDeleted, undelete, listDeleted, purgeDeletedBefore
├── jobs/queues.ts                   # + QUEUES.pruneDeletedItems
├── jobs/ensure-queues.ts            # singleton policy for it
├── jobs/prune-deleted-items.ts      # + createPruneDeletedItems({ items, now?, retentionDays? })
├── jobs/prune-deleted-items.test.ts
└── worker.ts                        # schedule + work
apps/api/test/
├── items-lifecycle.int.test.ts      # role × action matrix, window, listing, verified_at
└── items.int.test.ts                # existing archive/PATCH cases updated
apps/api/api.http                    # restore / undelete / deleted listing requests

packages/shared/src/
├── enums.ts                         # + itemListStatuses
├── items/constants.ts               # + ITEM_UNDELETE_DAYS, DELETED_ITEM_PRUNE_CRON (subpath `@gobbit/shared/item-constants`)
└── schemas/item.ts                  # list query status enum; Item.deletedAt optional

packages/db/
├── src/schema/items.ts              # + items_deleted_idx (partial)
└── migrations/0011_item_lifecycle.sql + down/0011_item_lifecycle.down.sql

apps/web/src/
├── ui/chip-order.ts (+ .test.ts)    # + deckHref; chipHref uses it
├── ui/UndoToast.tsx (+ .test.tsx)   # shared toast with one action, auto-dismiss
├── api/query-keys.ts                # + ItemFilter { kind: 'deleted' }
├── api/item-lifecycle.ts (+ .test.ts) # useArchive/useRestore/useDelete/useUndelete mutations, optimistic cache edits
├── api/favorite-cache.ts            # + insertIntoPages (next to removeFromPages)
├── items/CardActions.tsx (+ .test.tsx) # role-gated buttons via can()
├── items/DeletedSection.tsx         # Recently deleted list with days left + Undelete
├── items/days-left.ts (+ .test.ts)
├── routes/i.$itemId.tsx             # CardActions under the card
├── routes/d.$slug.archived.tsx      # Restore per card; DeletedSection for item.delete roles
└── review/ReviewPill.tsx, items/AddCardLink.tsx, routes/index.tsx,
    routes/d.$slug.new.tsx, share/ShareSent.tsx   # deckHref (D143)

e2e/tests/smoke/lifecycle.spec.ts    # demo 2 + negative paths
```

**Structure Decision**: The changes span the API service, routes, repo and worker; shared DTOs; one index migration; and web components in `items/`, `ui/` and `api/`. `CardActions` and the mutations are written so `specs/007-card-editor` adds an Edit button and `specs/009-browse-mode` reuses the component as is. The window and cron constants go in `packages/shared/src/items/constants.ts` with a subpath export, mirroring `ingest/constants.ts` (`@gobbit/shared/ingest-constants`), so the web imports `ITEM_UNDELETE_DAYS` without the root.

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in | Test (file, tier) |
|----------------------------------------|-------------|-------------------|
| FR-001 archive by owner/maintainer/editor only | service `can('item.archive')` | `items-lifecycle.int.test.ts`, int |
| FR-002 archived not in lists/search | repo filters (existing) | `items-lifecycle.int.test.ts` (list + search), int; `lifecycle.spec.ts`, e2e |
| FR-003/FR-004, D131 restore keeps `verified_at` | service `restore` | `items.service.test.ts`, unit; `items-lifecycle.int.test.ts`, int |
| FR-005 PATCH archived → published refused | service `update` | `items.service.test.ts`, unit; `items-lifecycle.int.test.ts`, int |
| FR-006 archive/restore of a proposal refused | service `archive`/`restore` | `items.service.test.ts`, unit |
| FR-007 delete by owner/maintainer only | service `can('item.delete')` | `items-lifecycle.int.test.ts`, int |
| FR-008 deleted listing (role, no proposals, order, `deletedAt`) | service `listDeleted` + repo | `items-lifecycle.int.test.ts`, int |
| FR-009 undelete restores status, categories, favorites | repo `undelete` + D95 trigger | `items-lifecycle.int.test.ts`, int |
| FR-010 410 after 30 days | service `undelete` | `items.service.test.ts` (clock), unit; `items-lifecycle.int.test.ts`, int |
| FR-011 purge > 30 days, FK effects | job + FKs | `prune-deleted-items.test.ts`, unit; `items-lifecycle.int.test.ts` (purge run), int |
| FR-012 idempotent repeats | service | `items.service.test.ts`, unit |
| FR-013, D130 same rules for every client, actor passed | service signature; route `getActor` | `items-lifecycle.int.test.ts` (bearer + cookie), int |
| FR-014 actions by role, optimistic, Undo | `CardActions`, `item-lifecycle.ts` | `CardActions.test.tsx`, `item-lifecycle.test.ts`, unit; `lifecycle.spec.ts`, e2e |
| FR-015 Archived: Restore + Recently deleted with days left | `d.$slug.archived.tsx`, `DeletedSection` | `days-left.test.ts`, unit; `lifecycle.spec.ts`, e2e |
| FR-016 disabled offline | `CardActions` (`useOnline`) | `CardActions.test.tsx`, unit |
| FR-017, D143 deck links in one place | `deckHref` | `chip-order.test.ts`, unit |
| Migration 0011 reversible | down file | `packages/db/test/migrations.int.test.ts` (existing round-trip), int |
| SC-006 bundle | build | `pnpm budget` |

## Rollout

- **Migrations**: `0011_item_lifecycle`, index only, reversible, no backfill. `CREATE INDEX` on a small table; no `CONCURRENTLY` needed.
- **Env / config**: none. The new cron is a constant.
- **API client**: yes, `pnpm api:openapi` (new routes, list query enum, `deletedAt`).
- **Deploy order / flags**: normal CI → Dokploy. The first purge runs the Sunday after deploy and removes anything deleted more than 30 days before, including cards and proposals soft-deleted in earlier phases (`DELETE`, Discard, publish-as-update). Accepted: the deployed instance has no real users or content yet, so there is no grace period for pre-existing rows.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| First purge removes old soft-deleted rows someone expected to keep | L / L | Accepted: no real users or content on the deployed instance yet, and the undo window was never offered before, so nothing was promised. No grace period for pre-existing rows. |
| Changing every `items.service` signature breaks a caller | M / L | Only `routes/items.ts` calls the service (ingest and review use the repo); typecheck catches the rest. |
| Optimistic insert on restore/undelete puts the card in the wrong position or a filtered list it doesn't belong to | M / L | Insert only into the `all` list, sorted by `createdAt`; invalidate category and favorites lists instead of editing them. |
| Undelete of a card whose only category is gone fails the D95 trigger | L / L | No category-delete route exists today (`item_categories` FKs cascade, so one added later could empty a deleted card). The existing mapping returns 422 `/problems/item-needs-category`; int case with the link row removed directly. |
| Bundle creeps past budget across 006–009 | M / M | Baseline recorded in T001; this feature's delta checked in close-out. |

## Settle before starting

- [ ] Editors publish directly (current behaviour) or should their new cards go to review? Out of scope here; record the answer in PLAN.md for 007.
- [ ] Accept that Cloudinary assets of purged image cards stay until the Phase 7 orphan sweep (`specs/008-card-media` creates the first such assets).
- [ ] Record the bundle baseline on main (T001) before 007–009 plan their lazy chunks.

## Complexity Tracking

No constitution violations.
