# Implementation Plan: Deck admin screens

**Branch**: `019-deck-admin` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 8 (demo 5)

**Input**: Feature specification from `/specs/019-deck-admin/spec.md`

Project override of the core template. Written for outside readers: the repository is public.

## Summary

**Screen.** A lazy-loaded PWA route `/d/$slug/settings` with three sections:

- **Deck**: name and the public switch (owner only, with a confirmation dialog).
- **Categories**: rename and visibility per category, through 016's `PATCH /decks/{id}/categories/{categoryId}`.
- **Members**: list, invite with a role (Reader, Editor, Maintainer, Co-owner), change role, remove or cancel.

Controls follow `can(role, permission)` from `@pb/shared`. The deck's role already comes with `GET /decks/{id}` (D184).

**API.** One new route: `PATCH /decks/{id}/members/{userId}` `{ role }`, owner only. Refused for the caller's own role, for implicit owners, for pending invites (re-invite instead), and when the last owner membership would go away (D185). Everything else already exists.

## Starting point

- `main @ a980598`. 016 merged (category PATCH, owner-only `isPublic`).
- API:
  - `GET /decks/{id}` returns the deck with the caller's `role`. `PATCH /decks/{id}` (`deck.update`).
  - `GET /decks/{id}/categories`.
  - `GET /decks/{id}/members` (`member.list`; rows have `implicit`, `acceptedAt`), `DELETE /decks/{id}/members/{userId}` (`member.remove`), `POST /decks/{id}/invites` (`member.invite`, `role` from `memberRoles`, re-invite replaces).
- `PERMISSION_MATRIX` in `packages/shared/src/authz/can.ts`.
- Web:
  - Routes are file-based (`apps/web/src/routes/d.$slug.*.tsx`). `/settings` is the account settings (tokens) with `SettingsSection`.
  - Value imports from `@pb/shared` use subpaths; `can` needs a `@pb/shared/authz` subpath if one doesn't exist yet.
  - The 150 KB gzip budget (`pnpm budget`).
- e2e: `e2e/tests/smoke/members.spec.ts` covers invite and accept through the API.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle; TanStack Router/Query. No new dependencies.

**Storage**: PostgreSQL 17. No migration.

**Testing**: Vitest unit and component tests; integration with Testcontainers; Playwright full

**E2E tier**: full — the screen drives API rules that int tests and 016's smoke test already guard on every PR; a broken screen is visible but not a privacy or data-loss failure. One nightly journey: owner makes a deck public, sets a category public, invites a co-owner who accepts and changes a category.

**Target Platform**: PWA on phones and desktop; Docker Compose on Dokploy

**Project Type**: pnpm monorepo — API, PWA, shared packages

**Performance Goals**: settings screen interactive in < 1 s on a mid-range phone; no change to the start-up bundle

**Constraints**: lazy route (bundle budget); plain CSS; no UI kit; offline read-only

**Scale/Scope**: decks with tens of categories and up to a few hundred members

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/members.ts` PATCH → `memberships.service.changeRole` → `memberships.repo.updateRole` |
| II. One source of truth | `memberRolePatchSchema` in `@pb/shared`; the web uses `can()` and `PERMISSION_MATRIX`, never its own role lists |
| III. Invariants in the DB | Membership rows and roles are already constrained; the last-owner rule is checked in the service inside a transaction with a row lock |
| IV. Private by default | Public switch owner-only with confirmation; server refuses every hidden control |
| V. Tests at the right tier | Unit (role labels, dialog copy), component (controls by role), int (role PATCH matrix), e2e full journey |
| VI. Lean web | Lazy route, plain CSS, `pnpm budget` gate |
| VII. Simple, optional | No env, no dependency |

No violations.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D184 | Deck settings screen at `/d/$slug/settings` (lazy), sections Deck / Categories / Members; controls from `can(role, …)`; owner-only public switch behind a confirmation naming public categories and the public URL; category visibility as a three-way select; personal deck shows name only; deck creation and deletion stay API-only | no |
| D185 | `PATCH /decks/{id}/members/{userId}` `{ role }`, `member.invite` permission (owner); 409 for own role, implicit owner, pending invite (`/problems/invite-pending`), and the last owner membership when no implicit owner exists (`/problems/last-owner`); "Co-owner" is the label of `owner` | no |

## Project Structure

### Documentation (this feature)

```text
specs/019-deck-admin/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/deck-admin.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # created during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/membership.ts                    # + memberRolePatchSchema
├── authz/labels.ts                          # NEW: ROLE_LABELS (owner → "Co-owner"), VISIBILITY_LABELS
└── package.json exports                     # + ./authz subpath if missing

apps/api/src/
├── repositories/memberships.repo.ts         # + updateRole(id, role), countOwners(deckId) (FOR UPDATE)
├── services/memberships.service.ts          # + changeRole(user, deck, userId, role)
└── routes/members.ts                        # + PATCH /decks/{id}/members/{userId}
apps/api/test/members.int.test.ts            # + role PATCH matrix

apps/web/src/
├── routes/d.$slug.settings.tsx              # NEW (lazy)
├── deck-admin/DeckAdminScreen.tsx           # NEW: sections, role gating
├── deck-admin/DeckSection.tsx               # NEW: name, public switch, public URL
├── deck-admin/PublicSwitchDialog.tsx        # NEW: confirmation copy
├── deck-admin/CategoriesSection.tsx         # NEW: rename, visibility select
├── deck-admin/MembersSection.tsx            # NEW: list, role select, remove
├── deck-admin/InviteForm.tsx                # NEW
├── deck-admin/deck-admin-queries.ts         # NEW: queries + mutations, invalidation
├── deck-admin/*.test.tsx                    # NEW component tests
└── app/DeckMenu.tsx (or deck header)        # + "Settings" entry for owner/maintainer
e2e/tests/full/deck-admin.spec.ts            # NEW
```

**Structure Decision**: a `deck-admin/` folder separate from the account `settings/` folder: different scope (one deck vs. the user), different permissions. The members PATCH sits with the existing member routes.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 rename deck/category, category visibility | existing PATCH routes (016) | `CategoriesSection.test.tsx`, `DeckSection.test.tsx` (unit: sends the right PATCH; refetches) |
| FR-002 owner-only public switch with confirmation | `decks.service.update` (016) + `PublicSwitchDialog` | `PublicSwitchDialog.test.tsx` (unit: lists public categories, "none" warning, cancel sends nothing); `DeckSection.test.tsx` (unit: disabled for maintainer) |
| FR-003 invite with any role | `memberships.service.invite` | `InviteForm.test.tsx` (unit: role options, error messages) |
| FR-004 role change rules | `memberships.service.changeRole` | `members.int.test.ts` (int: owner ✓; maintainer 403; self 409; implicit 409; pending 409; last owner 409; reader→maintainer applies on next request) |
| FR-005 remove / cancel | existing DELETE | `MembersSection.test.tsx` (unit: confirm then DELETE; pending shows "Cancel invite") |
| FR-006 hidden controls + server refusal | `can()` in web; `authorize()` in API | `DeckAdminScreen.test.tsx` (unit: control set per role); existing int matrices |
| FR-007 bundle | lazy route | `pnpm budget` (CI) |
| Journey | — | `e2e/tests/full/deck-admin.spec.ts` (e2e:full) |

## Rollout

- **Migrations**: none.
- **Env / config**: none.
- **API client**: `pnpm api:openapi` (member PATCH).
- **Deploy order / flags**: API first in the same deploy (the screen calls the new PATCH only for role changes; everything else exists).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Owner makes the family deck public by mistake | L / H | Confirmation names the categories and the address; personal deck has no switch; 016 shows no private categories anyway |
| Removing the last owner locks a deck | L / H | Account owners are implicit and can't be removed; `last-owner` check under a lock |
| Bundle creep | M / L | Lazy route; budget gate |

## Settle before starting

- [ ] Should maintainers be able to invite readers/editors? Today invites are owner-only (`member.invite`); the plan keeps that.
- [ ] Label "Co-owner" vs "Admin" for the `owner` role in Hebrew/English copy.

## Complexity Tracking

None.
