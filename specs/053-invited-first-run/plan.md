# Implementation Plan: First run for invited people

**Branch**: `053-invited-first-run` | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 16 item 4, first slice (`community-go-list.md` H8a)

**Input**: Feature specification from `/specs/053-invited-first-run/spec.md`

This is the project's override of the core template. It is written for outside readers, because the repository is public.

## Summary

The plan adds one column, one route and one sheet. Someone who accepted an invite gets a one-time welcome on the deck, and the dismissal holds on every device.

- **Stored on the membership** (D478): `memberships.welcome_dismissed_at`. The migration fills it for every member already accepted, so nobody from before release sees the welcome. Deck creators and owning-account users have no membership row, and the personal deck is never shared, so they are excluded by construction.
- **Delivered with the deck** (D479): `GET /decks/{id}` gains `welcome: { membershipId, inviter } | null`. The inviter is a member summary (shown name, no email). The deck list, create and update stay as they are.
- **Dismissed** (D480, D481): `DELETE /decks/{id}/welcome` (idempotent, 204). The web hides the welcome at once and keeps the membership id in a local pending set, retrying until the server confirms. An offline close therefore holds and reaches the other devices later.
- **Named inviter** (D482): `memberships.invited_by`. Accepting a link over a pending typed invite now records the link's creator.
- **The sheet** (D483, D484):
  - `DeckWelcome` uses the app's one `Sheet`, mounted by `DeckHeader` on list views. It waits while the consent question is unanswered (online or not), so the two never stack.
  - It has three entry points: Categories opens Browse with its category list as its own history entry, Search opens the header's search sheet, and Start reading closes it.
- **"How to browse"** (D485): it waits until no Browse layer is open.
- **Accountability**: one decision event, `deck.welcome_dismiss`.

## Starting point

- `origin/main @ 8c43e2c` (#193: Browse double-tap; it touches only `BrowseDock`/`BrowseStack`, not the hint or layers). This branch is one commit behind main and carries only the 053 docs and the go-list table. Rebase before `/speckit-implement`.
- The latest migration is `0030_deck_invite_links`, so this feature adds `0031_membership_welcome`.
- It builds on:
  - invites and acceptance (D37, D222–D224);
  - link invites (052, D466–D477, ADR-085);
  - member summaries and shown names (046, 051: D417–D429, D459–D465);
  - the analytics consent wall (D281);
  - the `Sheet` pattern (D304);
  - Browse layers and the first-run hint (D332, D338);
  - the deck header search sheet (D382).
- Next free ids: D478 and ADR-086. Not deployed.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: Hono + `@hono/zod-openapi` (API), Drizzle (DB), React + Vite + TanStack Router/Query (web). Nothing new.

**Storage**: PostgreSQL 17. One nullable column on `memberships` plus a backfill (`data-model.md`).

**Testing**: Vitest (unit, integration with Testcontainers), Playwright `@smoke` / `@full`

**E2E tier**: smoke. Accepting an invite and landing on the deck is a stage-3 critical journey. The existing `invite-link.spec.ts` smoke journey ends where the welcome appears, and its fresh joiner meets the consent wall, so extending it covers the overlay order for real. The variants (mailed invite, entry points, second device) run nightly at `@full` (D486).

**UI reference**:

- **Welcome sheet** → `browse/CategoryList` (the same `ui/sheet/Sheet`: `sheet__title` heading, body text, an action row of `ui/buttons` `Button`s). Copy and tone follow `browse/FirstRunHint`.
- **Review round (D487–D489)**: `ui/sheet/Sheet` (handle, swipe, corner close, dialog width), `browse/CategoryList` (borderless rows) and `deck-header/SearchSheet` (corner close) were changed after review of the welcome screenshots.
- **No new screen.** Categories reuses Browse plus `CategoryList`, and search reuses `deck-header/SearchSheet`.

**Target Platform**: Docker Compose on Dokploy; PWA on Android Chrome (iOS where stated)

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**: no extra request on deck open. The deck read adds one indexed membership lookup and, only while a welcome is pending, one user-summary lookup.

**Constraints**: web initial bundle ≤ 150 KB gzip (the sheet sits in the deck header chunk and adds a few hundred bytes); same origin

**Scale/Scope**: one row per membership; alpha cohort of tens of people

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                             | How this plan complies (or "N/A")                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Layered API                        | Route `DELETE /decks/{id}/welcome` parses only. `decks.service` resolves the deck, runs `authorize(deck.read)`, decides welcome visibility and logs. `memberships.repo` gains `dismissWelcome(id, now)` returning whether a row changed. A deck the caller can't see answers 404.                                                                                             |
| II. One source of truth for contracts | `deckWelcomeSchema`/`deckDetailSchema` in `@gobbit/shared` `schemas/deck.ts`; `pnpm api:openapi`                                                                                                                                                                                                                                                                              |
| III. Invariants live in the database  | Migration `0031` plus a hand-written down file; round-trip in the migrations integration test. The backfill is in the migration. The rule "set only on accepted rows" is a service invariant with an integration test (data-model).                                                                                                                                           |
| IV. Private by default                | Visibility rides on the existing `deck.read` authorization. The inviter goes through `member-summaries` (no email, FR-005). No new token or outbound call.                                                                                                                                                                                                                    |
| V. Tests at the right tier            | Unit, integration, `@smoke` (extended join journey) and `@full` (one welcome spec); traceability table below                                                                                                                                                                                                                                                                  |
| VI. Lean, offline-first web           | The welcome comes from the persisted `deckQuery`. The offline dismissal is a localStorage key (D481). No new query, no service-worker change, no root `@gobbit/shared` import (uses `/authz` for `ROLE_WELCOME`).                                                                                                                                                              |
| VII. Simple, optional, deployable     | No new dependency or env var; works with analytics off (the consent gate is then simply closed)                                                                                                                                                                                                                                                                               |
| VIII. Accountable by default          | `deck.welcome_dismiss` decision event (Accountability below). Showing the welcome is derived from recorded state (`accepted_at`, `welcome_dismissed_at`), not a new decision. The backfill is a one-off migration step.                                                                                                                                                       |
| IX. Reuse before writing              | Reuses `Sheet`, `Button`, `ROLE_WELCOME`, `member-summaries`, `memberships.findActive`, `defaultStore()`, `fromListState`/`onLayer`, and `SearchSheet`. Browse's own `fromListState`/`withLayer` drive the categories entry, so Browse's route is untouched. New code: the column, one repo method, one route, one sheet, the pending-dismissal store. Pruned items are below. |
| X. One UI system                      | UI reference filled; tokens and `ui/` primitives only; screenshots of the welcome and of Browse with the list open (phone 412 px and desktop 1280 px, light and dark) per UI task                                                                                                                                                                                             |

**Pruned (IX)**:

- A root-level overlay queue: the consent hook covers the one pair that can collide.
- A generic "UI flags" store on `users`.
- A separate `GET …/welcome`.
- A persisted-mutations setup.
- A release-date constant.
- An analytics event for the welcome (the spec says screen views only).
- A dedicated categories screen.

## Decisions this plan pins down

| ID   | Decision                                                                                                                                                                             | ADR?          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| D478 | `memberships.welcome_dismissed_at`; backfilled for accepted rows; a new membership starts null                                                                                       | yes → ADR-086 |
| D479 | `GET /decks/{id}` answers `deckDetailSchema` with `welcome: { membershipId, inviter } \| null`; list, create and update unchanged                                                    | yes → ADR-086 |
| D480 | `DELETE /decks/{id}/welcome`, `deck.read`, idempotent 204                                                                                                                            | no            |
| D481 | Web: hide at once, local pending set by membership id, retry on mount and `online` until 204/404                                                                                     | yes → ADR-086 |
| D482 | Inviter = `invited_by`; link accept over a pending invite sets it to the link creator                                                                                                | no            |
| D483 | `DeckWelcome` on `Sheet`, mounted by `DeckHeader` on list views; waits for loaded `me`/`config` and an answered consent question (online or not)                                     | no            |
| D484 | Categories → two pushes from the welcome: Browse (`fromListState`), then the `categories` layer (`withLayer`); Search → header `SearchSheet`; FR-008 = the categories query is empty | no            |
| D485 | `FirstRunHint` renders only when no Browse layer is open                                                                                                                             | no            |
| D486 | E2E: extend the `@smoke` link-join journey; one `@full` welcome spec                                                                                                                 | no            |
| D487 | Review round: `Sheet` owns closing: grab handle and swipe down on phones, a corner close button from 600 px when `closeLabel` is set (category list, search). Applies to every sheet | yes → ADR-086 |
| D488 | The welcome shows `ROLE_WELCOME[role]` (one friendly sentence per role) instead of the role label and description | no |
| D489 | One shared 32rem dialog width (no per-sheet sizes); list and picker sheets get room under the title; category rows borderless with the count inside | no |

## Project Structure

### Documentation (this feature)

```text
specs/053-invited-first-run/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/welcome.md
├── tasks.md                 # /speckit-tasks
└── implementation-notes.md  # /speckit-implement
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/memberships.ts                     # + welcomeDismissedAt
└── migrations/0031_membership_welcome.sql (+ down/)
packages/shared/src/schemas/deck.ts               # + deckWelcomeSchema, deckDetailSchema
apps/api/src/
├── repositories/memberships.repo.ts              # + dismissWelcome(id, now)
├── repositories/invite-links.repo.ts             # pending-accept branch sets invitedBy (D482)
├── services/decks.service.ts                     # get → welcome; dismissWelcome
└── routes/decks.ts                               # GET schema; DELETE /decks/{id}/welcome
packages/api-client/                              # pnpm api:openapi
apps/web/src/
├── deck-header/DeckWelcome.tsx (+ .css, .test)   # the sheet
├── deck-header/welcome-store.ts (+ .test)        # pending dismissals (D481)
├── deck-header/DeckHeader.tsx                    # mount; search entry → setSearchOpen
├── deck-header/DeckWelcome.tsx                   # categories entry: two pushes (D484)
├── api/queries.ts, api/*                         # deckQuery type; dismiss mutation
├── browse/BrowseScreen.tsx                       # hint only when layer === null
├── browse/CategoryList.tsx, browse/browse.css    # borderless rows, count inside (D489)
├── deck-header/SearchSheet.tsx                   # closeLabel (D487)
└── ui/sheet/Sheet.tsx, sheet.css                 # handle, swipe, corner close, width (D487, D489)
e2e/tests/smoke/invite-link.spec.ts               # + consent → welcome → close → reload
e2e/tests/full/welcome.spec.ts                    # mailed invite, entry points, second device
e2e/fixtures/identity.ts                          # createMember also dismisses the welcome (API)
docs/design/profile.md                            # "Welcome" section + Deviations (see Rollout)
```

**Structure Decision**: the API changes are confined to the decks and memberships layers. The web changes sit in `deck-header/`, where the welcome's search target already lives, plus two one-line touches in Browse.

## Invariant → test traceability

| Invariant / rule (spec FR or D-number)                                 | Enforced in (DB / service / route / UI)                                                                  | Test (file, tier)                                                                                                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 welcome after any acceptance path (address, username, link)     | service `get`                                                                                            | `decks.service.int.test.ts` (accepted via `accept` and via link), int; `invite-link.spec.ts` @smoke; `welcome.spec.ts` @full (mailed)                    |
| FR-002 once per membership, all devices                                | DB column + service                                                                                      | `decks.service.int.test.ts` (dismiss → `welcome: null`), int; `welcome.spec.ts` second context, @full                                                    |
| FR-003 not for pre-release members                                     | migration backfill                                                                                       | `migrations.int.test.ts` (accepted row → set, pending → null), int                                                                                       |
| FR-003 not for the owning account / personal deck                      | service `get`                                                                                            | `decks.service.int.test.ts` (account owner with and without a row; personal deck), int                                                                   |
| FR-004 consent first, then welcome (also after an offline reopen)      | UI `DeckWelcome` consent gate                                                                            | `DeckWelcome.test.tsx`, unit; `invite-link.spec.ts` @smoke                                                                                               |
| FR-004 "How to browse" after the list closes                           | UI `BrowseScreen` (D485)                                                                                 | `BrowseScreen.test.tsx`, unit; `welcome.spec.ts` @full                                                                                                   |
| FR-005 no email; deck + inviter shown name                             | service (`member-summaries`), UI                                                                         | `decks.service.int.test.ts` (no `email` key), int; `DeckWelcome.test.tsx`, unit                                                                          |
| FR-005 deleted inviter → line left out; nameless → "a member"          | service + UI                                                                                             | `decks.service.int.test.ts`, int; `DeckWelcome.test.tsx`, unit                                                                                           |
| FR-006 role sentence from `ROLE_WELCOME`                                  | UI                                                                                                       | `DeckWelcome.test.tsx`, unit                                                                                                                             |
| FR-007 Categories → Browse with list (own entry); Search → focused box | UI (D484)                                                                                                | `DeckWelcome.test.tsx` (two pushes, layer on top), unit; `welcome.spec.ts` @full                                                                         |
| FR-008 categories entry left out when no category                      | UI                                                                                                       | `DeckWelcome.test.tsx`, unit                                                                                                                             |
| FR-009 RTL names isolated                                              | UI `<bdi>`                                                                                               | `DeckWelcome.test.tsx`, unit                                                                                                                             |
| FR-010 keyboard / screen reader                                        | `Sheet` (native modal)                                                                                   | `DeckWelcome.test.tsx` (Escape dismisses, labelled), unit                                                                                                |
| FR-011 offline close kept and sent later                               | `welcome-store` + retry                                                                                  | `welcome-store.test.ts`, `DeckWelcome.test.tsx` (offline → pending → online → DELETE), unit                                                              |
| FR-012 everything else unchanged                                       | — and e2e fixture `createMember` dismisses the welcome through the API, as it already declines analytics | existing invite/accept int tests, `invite-link.spec.ts` and the `@full` specs using `member()` (`member-privacy`, `profile`, `members-roles`) stay green |
| D480 idempotent dismiss; 404 when unreadable; pending row untouched    | service + repo                                                                                           | `decks.routes.int.test.ts`, int                                                                                                                          |
| D482 link accept over a pending invite names the link creator          | repo                                                                                                     | `invite-links.int.test.ts`, int                                                                                                                          |

## Accountability

| Decision                                 | Event / audit row                                                                                                       | Outcomes · reasons                                | Fields (ids/hashes only)                                    | Level | Watched (instance / aggregate / rate)                                            | Alert threshold (default)                                                                                    | Test                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- | ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| A person dismisses a deck's welcome      | `deck.welcome_dismiss` log, plus the `welcome_dismissed_at` timestamp on the row (the durable record)                   | `dismissed`, `already_dismissed`, `no_membership` | requestId, userId, deckId, membershipId (when there is one) | info  | aggregate per day; the rate of `already_dismissed` (retries) against `dismissed` | none: no person is refused. Investigate if `already_dismissed` exceeds 3× `dismissed` per day (a retry loop) | `decks.service.test.ts`, unit; asserted in `decks.routes.int.test.ts`, int |
| Whether the welcome shows on a deck read | none new: derived from `accepted_at` (recorded by the existing invite/accept events) and `welcome_dismissed_at` (above) | —                                                 | —                                                           | —     | —                                                                                | —                                                                                                            | covered by FR-001–003 tests                                                |
| Pre-release members marked as dismissed  | migration `0031` backfill (one-off, in the deploy log)                                                                  | —                                                 | —                                                           | —     | —                                                                                | —                                                                                                            | `migrations.int.test.ts`, int                                              |

**Operator controls**: none. No limit or threshold shapes anyone's experience here.

## Rollout

- **Migrations**: `0031_membership_welcome`. It adds a nullable column (no table rewrite) and backfills accepted rows in the same migration. The down file drops the column. It is safe to run before the new API image: the old code ignores the column.
- **Env / config**: none; no `CHANGELOG.md` env entry.
- **API client**: yes, `pnpm api:openapi` (GET response schema and the new DELETE).
- **Deploy order / flags**: the normal CI → Dokploy flow. A member accepted between the migration and the new web bundle reaching their device sees the welcome once the bundle updates. That is correct, because they accepted after the backfill.
- **Docs**:
  - `docs/design/profile.md` (members and invites area) gets a short "Welcome" section with D478–D485 and its Deviations list.
  - `docs/architecture.md` gets one ADR index row (ADR-086).
  - `docs/adr.md` gets ADR-086.
  - `CLAUDE.md` "Roles" gets a short clause on the welcome.
  - `community-go-list.md` tracking: tick H8a on merge.

## Risks

| Risk                                                                                                    | Likelihood / impact | Mitigation                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The welcome and consent wall stack, because `me` loads after the welcome opens                          | M / M               | Wait for `me` and `config` to load, and for an answered consent question even offline (D483); the @smoke journey exercises the order with a fresh account |
| The categories layer opens in the same history entry as Browse, so the first pick leaves Browse         | M / M               | Push the layer as its own entry (D484); unit test plus @full                                                                                              |
| Invited members created by the e2e fixture land on a deck with the welcome open, blocking nightly specs | H / M               | `createMember` dismisses it via `DELETE /decks/{id}/welcome` (FR-012 row)                                                                                 |
| The pending store suppresses someone else's welcome on a shared device                                  | L / L               | Keyed by membership id, not deck (D481)                                                                                                                   |
| FR-008 almost never triggers, because the default category always exists                                | H / L               | Recorded in D484; an unseeded deck still offers Categories and lands on an empty "All". Revisit if alpha decks start empty.                               |

## Settle before starting

- [x] Rebase `053-invited-first-run` on `origin/main` (one commit behind, #193). Done; the implementation branch later merged `main` again.
- [x] Copy for the welcome line and buttons. Confirmed by the owner on 2026-11-27 with one change (D488): "Welcome to **{deck}**" / "{Inviter} invited you." (fallback "A member") / one `ROLE_WELCOME` sentence / Categories · Search · Start reading.

## Complexity Tracking

No principle is broken. One scope note: the `Sheet` change (D487, D489) is shared UI and reaches every sheet (About, Avatar cropper, type picker, discard dialogs). It was reviewed on phone and desktop, and is kept in this PR on purpose (decided with the owner, 2026-11-27).
