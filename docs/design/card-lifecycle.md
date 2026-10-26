# Card lifecycle (Phase 6, `specs/006-card-lifecycle`)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Archive, restore, delete and undelete for cards, through one set of service methods that every client shares.

**State machine** (status × `deleted_at`):

```
proposed ──publish (PATCH)──▶ published ──archive──▶ archived
                                  ▲                    │
                                  └──────restore───────┘
published | archived ──delete──▶ deleted (deleted_at set) ──undelete (≤ 30 days)──▶ previous status
deleted > 30 days ──prune-deleted-items (weekly)──▶ hard-deleted
```

**Routes** (session cookie or bearer; `ing_` tokens get 401):

| Route | Permission | Result |
| --- | --- | --- |
| `POST /items/{id}/archive` | `item.archive` (owner, maintainer, editor) | 200 Item, status `archived`; a repeat is a no-op 200 |
| `POST /items/{id}/restore` | `item.archive` | 200 Item, status `published`, `verifiedAt` kept; a repeat is a no-op 200 |
| `DELETE /items/{id}` | `item.delete` (owner, maintainer) | 204; a repeat is 404 (the card is hidden) |
| `POST /items/{id}/undelete` | `item.delete` | 200 Item with its previous status; 410 `undo-expired` after 30 days |
| `GET /decks/{id}/items?status=deleted` | `item.delete` | Cards deleted in the last 30 days, newest deletion first, cursor on `(deleted_at, id)`; no proposals; category visibility applies |

**Decisions**:
- **D130 / ADR-050**: every lifecycle method in `items.service` takes `actor: { user, via: 'session' }` first; routes build it with `getActor(c)`.
- **D131**: `verified_at` is set on the first publication only; restore keeps it. PATCH archived → published is 409 `/problems/use-restore`; archive or restore of a proposal is 409 `/problems/invalid-transition`.
- **D132**: soft delete. Undelete within `ITEM_UNDELETE_DAYS` (30), else 410 `/problems/undo-expired`; a deleted proposal is 404. The worker's weekly `prune-deleted-items` (`DELETED_ITEM_PRUNE_CRON`, Sundays 05:00 UTC) hard-deletes older rows. Migration `0011_item_lifecycle` only adds the partial index `items_deleted_idx (deck_id, deleted_at DESC, id DESC) WHERE deleted_at IS NOT NULL`.
- **D143**: `deckHref(slug, path)` (`apps/web/src/ui/chip-order.ts`) builds every deck-scoped href in the web app.
- **D146**: the web actions are optimistic on the cached lists, roll back on error, invalidate search, and show a 6-second Undo toast after archive and delete. Delete asks first (`window.confirm`). Actions are disabled offline.

**Web**: the card view (`/i/$itemId`) shows Archive/Restore and Delete by role; since 024 they sit in the card's own bar, Archive and Delete under "More actions" ([icons-and-actions](icons-and-actions.md)). The Archived view (`/d/$slug/archived`) lists archived cards with Restore and, for `item.delete` roles, a **Recently deleted** section with days left and Undelete. A deleted card's permalink shows "Card unavailable".

## Deviations from the 006 plan

- **`deletedAt` is optional on the Item DTO**, present only on deleted rows (the data model said nullable), so live responses are unchanged.
- **The deleted-list cursor reuses `encodeCursor`** with `deletedAt` in the `createdAt` slot.
- **PATCH proposed → published sets `verifiedAt` only when it is null**; PATCH `status: 'archived'` checks for a proposal before the permission check.
- **Private-category hiding in the deleted listing is tested at the repository level**: every `item.delete` role can read private categories, so no route-level case exists.
- **One web hook (`useLifecycle`) replaces four** (`useArchive`/`useRestore`/`useDelete`/`useUndelete`). The toast store is app-wide (`useSyncExternalStore`) so the toast survives navigation; no new dependency.
- **Optimistic inserts go into every list whose filter decides the card** (all, favorites, archived, deleted) by rank, not only "all"; category lists wait for the refetch. Undoing a restore or undelete shows no toast.
- **The card view navigates back to the deck** after archive or delete.
- **Days left are floored**, so seconds after a deletion the label reads "29 days left".
- **E2E ran locally** against `pnpm dev`; the deployed-instance run (quickstart §5) and the `PLAN.md` demo 2 tick wait for the deploy.
