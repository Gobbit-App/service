# Implementation notes: 019-deck-admin

Plan: `specs/019-deck-admin/plan.md`, tasks: `tasks.md`. Branch `phase8-019-deck-admin`, stacked on 020 (`phase8-020-item-events`); 020 is not a code dependency, the stack only keeps the PR diffs small.

No migration, queue or env var. One new route: `PATCH /decks/{id}/members/{userId}`. E2E tier: full (`e2e/tests/full/deck-admin.spec.ts`): an admin screen, not a critical journey.

## Decisions not specified by the plan

- **Problem types**: `/problems/own-role`, `/problems/implicit-owner`, `/problems/invite-pending`, `/problems/last-owner` (all 409, `ROLE_CHANGE_PROBLEMS` in `memberships.service`). The same role is a 200 no-op.
- **Settle-before-starting answers**: invites stay owner-only (`member.invite`); the `owner` role is labelled "Co-owner" in the app.
- **Query invalidation**: every admin write refreshes its query under both the slug and the id key (`invalidateBoth`), and a deck write also refreshes the deck list.
- **Refusal copy**: `deck-admin/admin-errors.ts` maps the four role-change problems and 403, then falls back to `problemMessages`; the generic save error says to check the connection.
- **Public address**: `publicDeckUrl(slug, origin)` → `<origin>/p/<slug>` (017's page).

## Deviations from the plan

- **Header link instead of a deck menu** (the PWA has none): admins get "Deck" (accessible name "Deck settings") next to Activity; `NavLink` gained an optional `label`.
- **`@pb/shared/authz` points at `authz/index.ts`**, which re-exports `can` and the new `labels.ts`.
- **No `countOwners`**: `memberships.repo.updateRole(id, deckId, role, { guardLastOwner })` locks the deck's owner rows `FOR UPDATE` and counts them in its own transaction.
- **"Everyone" hint** under Categories shows while the deck is not public.
- **Inline confirmation** for remove / cancel invite instead of a modal.
- **T020** lives in `apps/api/test/member-role.int.test.ts`; when two co-owners demote each other at once, the second answer is 403 (its permission is already gone) or 409. Both leave one owner.
- **T023**: a second admin can't sign in from e2e (the invite needs the emailed magic link), so the owner sets a category to Everyone, makes the deck public and invites a co-owner; accepted-member role changes are covered by the integration and component tests.
- **T053–T054**: not run; the quickstart needs the deployed instance.
