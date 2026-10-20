# Quickstart: Card lifecycle (006)

How to check the feature end to end, locally and then on the deployed instance. The commands are the repo's own (`README.md`).

## 1. Gates

```bash
pnpm install
pnpm db:migrate                     # applies 0011_item_lifecycle
pnpm db:rollback && pnpm db:migrate # down file round-trips
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test:unit                      # items.service, prune-deleted-items, web helpers/components
pnpm test:int                       # items-lifecycle.int.test.ts + migrations round-trip (Docker)
pnpm api:openapi && git diff --exit-code packages/api-client   # client regenerated and committed
pnpm build:web && pnpm budget       # within 150 KB gzip; compare with the baseline in implementation-notes.md
```

## 2. API walk-through (`apps/api/api.http`)

With `pnpm dev` running and the seeded `SMOKE_SESSION_TOKEN` (owner), run the new requests in order after "Create an item":

| Step | Request | Expect |
|------|---------|--------|
| 1 | `POST /items/{id}/archive` | 200, `status: archived`; `GET /decks/{deck}/search?q=<title>` has no hit |
| 2 | `PATCH /items/{id}` `{ "status": "published" }` | 409 `/problems/use-restore` |
| 3 | `POST /items/{id}/restore` | 200, `status: published`, `verifiedAt` equal to step 0; search hits again |
| 4 | `POST /items/{id}/restore` again | 200, unchanged (idempotent) |
| 5 | `DELETE /items/{id}` | 204; `GET /items/{id}` → 404 |
| 6 | `GET /decks/{deck}/items?status=deleted` | 200, the card first, with `deletedAt` |
| 7 | `POST /items/{id}/undelete` | 200, previous status and categories |
| 8 | Archive a proposal (from the review queue) | 409 `/problems/invalid-transition` |

The role matrix (editor can archive and restore but not delete, list deleted or undelete; reader can do none) is covered by `items-lifecycle.int.test.ts`. To try it by hand, invite a second address with each role and use its bearer.

The 410 path needs an old deletion. Locally, back-date a row and retry:

```sql
UPDATE items SET deleted_at = now() - interval '31 days' WHERE id = '<id>';
```

`POST /items/{id}/undelete` → 410 `/problems/undo-expired`. The card no longer shows in `?status=deleted`.

## 3. Purge job

The job's unit test covers the cutoff, and `items-lifecycle.int.test.ts` runs the handler against Postgres. To watch the real schedule locally, temporarily set `DELETED_ITEM_PRUNE_CRON` to `'* * * * *'` (don't commit it), keep `pnpm dev` running (the worker is part of it) with the back-dated row from step 2, and wait a minute. Then check that the row is gone, its `item_categories`/`favorites` rows are gone, and any `ingest_jobs.result_item_id` that pointed at it is null.

## 4. Web (`pnpm dev` → http://localhost:5173)

1. Signed in as owner, open a card (`/i/<id>`): Archive, Delete are shown (Edit arrives with `specs/007-card-editor`).
2. Archive → back on the deck list the card is gone without a reload, and the toast shows **Undo**. Tap it: the card is back in place.
3. Archive again, open the Archived chip: the card has **Restore**. Restore it, then search its title: one hit, same "Added … ago".
4. Delete (confirm) → toast with Undo. Let it expire. Archived → **Recently deleted** lists the card with "30 days left"; Undelete returns it.
5. Go offline (DevTools): the actions are disabled with the offline hint.
6. As an editor: Archive and Restore only, no Recently deleted. As a reader: no actions.
7. Every deck link (header, Add card, review pill, share confirmation) still opens the right deck (`deckHref`).

```bash
pnpm test:e2e   # includes e2e/tests/smoke/lifecycle.spec.ts
```

## 5. Deployed instance (PLAN.md Phase 6 demo 2)

The first Sunday purge after deploy also removes rows soft-deleted in earlier phases; this is accepted (no real content yet, see plan Rollout). After CI deploys and the smoke job passes (`/version.json` reports the commit):

1. In a shared deck, archive a card from its card view.
2. Search its title: no result.
3. Archived → Restore. Search again: the card is found, with its original date.
4. Tick demo 2 in PLAN.md only after this run.
