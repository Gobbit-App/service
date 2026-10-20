# Implementation notes: 006-card-lifecycle

Plan: `specs/006-card-lifecycle/plan.md`, tasks: `tasks.md`. Branch `feat/006-card-lifecycle`, from `main` at `154a7c1`.

## Bundle (T001, T047)

| | Initial JS (gzip) | Of which `index` |
| --- | --- | --- |
| Baseline, `main` at `154a7c1` | 111.0 KB | 94.2 KB |
| After this feature | 111.5 KB | 94.5 KB |
| Delta | +0.5 KB (target ≤ ~2 KB) | +0.3 KB |

Budget: 150 KB.

## Decisions not specified by the plan

- **One web hook**: a single `useLifecycle` / `runLifecycle` (`apps/web/src/api/item-lifecycle.ts`) covers archive, restore, delete and undelete, with an `INVERSE` map for Undo. The plan listed four hooks.
- **App-wide toast store** (`ui/toast-store.ts`, `useSyncExternalStore`), with `ToastHost` mounted in the root layout so the Undo toast survives the card view navigating back to the deck. No new dependency.
- **Delete confirmation** uses `window.confirm`: it is accessible, works on mobile, and adds no bundle weight.
- **The card view navigates back to the deck** after archive or delete, since the card leaves the reading view.
- **No toast for Undo itself** (undoing a restore or undelete).
- **A deleted card's permalink** shows "Card unavailable / This card was deleted." with no Retry.
- **Days left** (`items/days-left.ts`) are floored per T033 and never go below 0.

## Deviations

- **`deletedAt` is optional on the Item DTO**, present only on deleted rows. The data model said nullable. Live responses are unchanged and the generated client stays simpler.
- **The deleted-list cursor reuses `encodeCursor`** with `deletedAt` in the `createdAt` slot, instead of a new cursor type. The index `items_deleted_idx (deck_id, deleted_at DESC, id DESC)` matches the order.
- **`softDelete` takes the service clock** (`now()`), so the undo-window tests are deterministic.
- **PATCH proposed → published sets `verifiedAt` only when it is null** (D131 "first publication only").
- **PATCH `status: 'archived'` on a proposal** returns 409 `invalid-transition` before the permission check, so an editor gets the same answer as an owner.
- **Private-category hiding in `?status=deleted`** is tested at the repository level. Every role with `item.delete` can read private categories, so no route-level case can show it.
- **Optimistic inserts**: the plan's risk mitigation said "insert only into `all`". The cache update inserts into every list whose filter decides the card (all, favorites, archived, deleted), ordered by rank. Category lists are left to the refetch.
- **Quickstart §4 wording**: a just-deleted card reads "29 days left" because days are floored. `quickstart.md` was updated, and the e2e accepts 30 or 29.

## Verification

- `pnpm lint`, `pnpm format:check` and `pnpm typecheck` are clean.
- `pnpm test:unit`: 1769 tests passed.
- `pnpm test:int`: 42 files, 378 tests passed.
- `pnpm build:web && pnpm budget`: 111.5 KB of the 150 KB budget.
- **E2E**: run locally against `pnpm dev` with a throwaway pgvector Postgres container.
  - `lifecycle.spec.ts`: 3/3 passed.
  - Full suite: 37 passed and 2 failed. Neither failure comes from this feature; both come from running under the Vite dev server instead of the Caddy image:
    - `web.spec.ts`: `/version.json` returns Vite's SPA fallback HTML.
    - `share.spec.ts`: `POST /share` returns 404 instead of Caddy's 303.
  - CI runs the full suite after deploy.
- **Quickstart (T052)**: §1–§4 were covered locally by the int tests, the e2e and the steps above. §5 needs the deployed instance, so the `PLAN.md` demo 2 tick waits for it.

## Learnings

- The React Compiler lint rule `react-hooks/refs` rejects assigning a ref during render. Assign the latest-callback ref inside a `useEffect`.
