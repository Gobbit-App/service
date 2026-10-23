# Research: Deck admin screens

Decisions continue the project-wide D numbering. Phase 8 reserves D174–D191. This feature owns **D184–D185**; neither needs an ADR (they apply the existing role model, ADR-004 and D33).

## What exists today

- Roles: owner, maintainer, editor, reader. Account owners are implicit owners with no membership row (D33). Owner memberships are "co-owners": everything except deleting the deck.
- `PERMISSION_MATRIX`: `deck.update` and `category.update` for owner and maintainer; `member.invite` and `member.remove` owner only.
- Invites (Phase 2): re-inviting a pending member replaces the role and expires older links.
- 016 adds `PATCH /decks/{id}/categories/{categoryId}` and makes `isPublic` owner-only.
- No role change for accepted members: today an owner must remove and re-invite.

## D184 — Deck settings screen

- **Decision**: a lazy route `/d/$slug/settings` with Deck, Categories and Members sections. Each control renders from `can(role, permission)`; for `isPublic` the check is `role === 'owner'`, matching 016. The public switch opens a dialog that lists the deck's public categories (or warns "no category is public yet") and the public address, with "Make public" / "Cancel". Visibility is a three-way select per category (Private: admins, Shared: members, Public: everyone). The personal deck shows only its name. Deck creation and deletion stay API-only.
- **Rationale**: one place per deck matches how admins think about it, and keeps account settings (tokens) separate. Gating by the shared matrix keeps the UI and the server in step. The dialog makes the one irreversible-feeling action deliberate.
- **Alternatives considered**: inline controls on the deck's browse screen (clutters the reader's view for everyone); a separate admin web app (doubles auth, routing and offline work); allowing deck deletion in the UI (one mis-tap away from losing a community deck).

## D185 — Member role change

- **Decision**: `PATCH /decks/{id}/members/{userId}` with `{ role }`, permission `member.invite`. Refused with 409 when:
  - the target is the caller (`/problems/own-role`);
  - the target is an implicit owner (`/problems/implicit-owner`);
  - the invite is still pending (`/problems/invite-pending`: re-invite changes a pending role);
  - the change would leave a deck with no owner at all (`/problems/last-owner`; only possible on decks whose owner account has no users, checked under `SELECT … FOR UPDATE`).
- **Rationale**: remove-and-re-invite loses `accepted_at` and sends a new email for a simple promotion. Reusing `member.invite` keeps "who can grant access" one permission.
- **Alternatives considered**: a new `member.update` permission (same roles today; add it when they diverge); letting maintainers change roles below their own (adds a hierarchy rule the matrix doesn't have).
