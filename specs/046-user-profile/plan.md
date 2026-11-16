# Implementation Plan: Member profile and card creator avatar

**Branch**: `046-user-profile` (plan); implementation `feat/046-user-profile` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Usability pass

**Input**: Feature specification from `/specs/046-user-profile/spec.md`

## Summary

Every member gets an optional profile (username, first and last name, photo, location) and every
card in a shared or communal deck shows a small round avatar of its creator in the card footer.

**Storage.** The profile lives as nullable columns on `users` (D417). The username is unique
system-wide, case-insensitively, through a unique index on `lower(username)`, a format CHECK and a
hold table guarded by a trigger (D418). The stored `display_name` keeps its email-derived value and
stays the fallback; the profile name is computed in one SQL helper (D419). Nothing is backfilled.

**Avatar.** One zod-free shared definition turns a name or an email local part into initials and a
member id into a palette index (D420). The API sends only `initials`, never the address. The item DTO
gains `creator`, a small summary batch-joined in the one place all member reads already pass through
(D421). It is `null` in personal decks, a placeholder (`id: null`) when the creator is unknown, and
otherwise `{ id, name, username, initials, photo }`. Public DTOs are untouched.

**Photo.** The photo is an `assets` row owned by the member rather than a deck (D423). It uses the
existing signed upload flow under `/me/avatar/*`, is cropped to a square in the browser with a canvas,
and is counted as a reference by the media sweep so replaced and removed photos are cleaned up like
other unused images.

**Finding people.** `POST /members/lookup` takes an exact username (or an email, answered only for
members who already share a deck with the caller); invites accept `username` as well as `email`
(D424, D425). Both are rate limited per member and answer a miss the same way every time.

**Web.** A new `ui/Avatar` primitive and a `CreatorAvatar` in the card footer reserve a fixed box (no
layout shift), carry the label of spec Story 2.8 (hover, tap, focus, Escape) and are not links
(D428). A `Profile` page under Settings edits the profile, with unsaved edits kept in the existing
drafts store and a leave guard.

## Starting point

main @ `4a8abe8` (UI system rules, ADR-079). The latest migration is `0026_card_cover`; this
feature adds `0027_member_profile`. The highest decision is D416 and the highest ADR is ADR-079, so
this plan uses D417–D429 and ADR-080. Not deployed.

It builds on:

- `specs/012-media-assets`, `013-cloud-image`, `044-card-avatar` (the cover; assets, signed upload,
  D156–D161, D406–D415, ADR-054, ADR-078);
- `specs/020-item-events` (audit rows, ADR-057);
- `specs/043-deck-header` (the card footer); `specs/045-media-cards`.

Code to read:

- **API**: `packages/db/src/schema/users.ts`, `assets.ts`; `services/users.service.ts`
  (`displayNameFromEmail`), `memberships.service.ts` (`list`, `sendInvite`, invite), `item-dtos.ts`
  (`createItemDtoMapper`), `media.service.ts` (`signUpload`, `confirmUpload`), `media-sweep.ts`,
  `repositories/assets.repo.ts` (`unreferenced`), `media.events.ts`, `lib/rate-window.ts`,
  `lib/decision-event.ts`, `routes/me.ts`, `routes/members.ts`, `lib/mappers.ts`.
- **Shared**: `schemas/membership.ts`, `item.ts`, `event.ts`, `ingest.ts`, `share.ts`, `auth.ts`,
  `limits.ts`, `media/constants.ts`, `package.json` exports.
- **Web**: `cards/Card.tsx` (`.card__meta`), `cards/CloudImage.tsx`, `review/ReviewCard.tsx`,
  `browse/*`, `settings/*`, `routes/settings.tsx`, `deck-admin/InviteForm.tsx`, `MembersSection.tsx`,
  `editor/fields/PickButton`, `editor/use-image-upload.ts`, `editor/use-drop-image.ts`,
  `editor/drafts-store.ts`, `ui/tooltip-press.ts`, `ui/sheet`, `reminders/use-member-name.ts`,
  `api/persist.ts`, `styles.css`.
- **Docs**: `docs/design/ui-system.md`, `card-media.md`, `api-conventions.md#decision-events`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: the existing stack, with no new dependency (D420, D423). Initials and the
palette are about 60 lines in `@gobbit/shared`; the crop uses a canvas and pointer events; the label
extends `ui/tooltip-press`.

**Storage**: PostgreSQL 17. Migration `0027_member_profile` adds:

- on `users`: `username`, `first_name`, `last_name`, `location`, `avatar` (jsonb), the format CHECK
  `users_username_format_chk`, the length CHECKs, and the unique index `users_username_lower_uq`;
- the table `username_holds` and the trigger `users_username_hold_guard`;
- the table `profile_events` (audit);
- on `assets`: `scope` (`deck` | `profile`), `owner_user_id`, `deck_id` made nullable, and the CHECK
  `assets_scope_chk`;
- a partial index for the sweep's avatar reference;
- a hand-written down file; no backfill.

See [data-model.md](data-model.md).

**Testing**:

- Vitest unit tests:
  - `initialsFor` (table of names, scripts, emails, emoji, RTL, honorifics) and `avatarColorIndex`
    (stable, in range, spread);
  - the username schema and reserved list;
  - `profile.service` (trim, blank, limits, username rules, hold, lookup rules, decisions);
  - `displayNameOf`; `Avatar`, `CreatorAvatar` (box, label, no link, no email in the DOM),
    `ProfileForm`, `AvatarCropper`; the draft round-trip; `use-member-name` fallback.
- Integration tests (`profile.int.test.ts`, plus additions to `items`, `memberships`, `media-sweep`,
  `public`, `search` and migration tests):
  - the CHECKs, the unique index under two concurrent claims, the hold trigger, the down-file round trip;
  - `creator` on every member read path (list, favorites, category, search, review queue, one item),
    `null` in a personal deck, the placeholder after the creator is removed;
  - no email, no location, no `creator` in any other member's payload, public DTOs, public search and
    share previews;
  - `profile_events` rows (field names only) in the same transaction;
  - lookup: found, not found, same answer for never-existed and released, rate limited, email only
    for deck mates, invite by username;
  - the sweep keeps a referenced avatar and frees a replaced or removed one.
- Migration round-trip test.

**E2E tier**: smoke + full.

- **Smoke**: `e2e/tests/smoke/settings.spec.ts` gains "set a first name, last name and username →
  a card in a shared deck shows my initials and the username on hover"; `smoke/members.spec.ts`
  gains "invite by username". Both are critical journeys (sign-in-adjacent profile write, inviting;
  constitution V) with nothing inside Gobbit faked.
- **Full**: `e2e/tests/full/profile.spec.ts`: photo upload, crop, replace and remove (Cloudinary
  replaced at the network edge by `routeFakeCloudinary`); failed upload keeps the previous photo;
  taken, reserved and held usernames; unsaved-edits guard; no avatar in a personal deck; placeholder
  for a removed creator; hover, tap, Escape and focus label; Browse and review queue; offline render;
  no layout shift (bounding box before and after the photo loads). These are variants and async
  third-party work.

**UI reference**:

- **Profile page**: copies the Settings sections (`settings/SettingsSection` + `NotificationsSection`
  form rows: `.field-group`, `ui/buttons` Save row). Photo field: `CoverField`'s pick/drop/remove
  action row (`PickButton`, `use-drop-image`). Crop: inside a `ui/sheet` Sheet, controls through
  `ui/buttons`.
- **Avatar**: new primitive `ui/Avatar`, documented in `docs/design/ui-system.md`. Its image renders
  only through `CloudImage`; its label copies the `data-tip` tooltip of `ui/tooltip-press`.
- **Card footer slot**: the existing `.card__meta` row, next to `.card__chips` and `.card__age`.
- **Members list and invite preview**: `MembersSection` row and `InviteForm` field-group, with the
  Avatar at the row start.
- **Username availability line**: the inline field hint used by the editor's field errors.

**Target Platform**: API container, PWA on Android Chrome and iOS Safari (camera capture through the
`capture` attribute where offered).

**Project Type**: pnpm monorepo: API + worker, PWA, shared packages

**Performance Goals**:

- One extra batched query per item page (distinct creator ids), no per-card query.
- Avatars at 24 px (list) and 40 px (profile preview, members) via `CloudImage` at 2x and 3x; a photo
  is cropped to 512 px before upload, so any size is served from one stored image.
- The footer box is fixed, so nothing shifts while a photo loads.

**Constraints**:

- Body ≤ 2000 code points and payload ≤ 8192 bytes: unaffected.
- Web bundle ≤ 150 KB gzip: `Avatar`, `CreatorAvatar` and `@gobbit/shared/avatar` ride in the main
  chunk (a few hundred bytes); the profile page, `AvatarCropper` and the lookup preview are lazy
  route chunks.
- `@gobbit/shared/avatar` and `/username` are zod-free subpaths.
- Same origin; no email in any payload for other members.

**Scale/Scope**: family and community decks; a handful to a few hundred members per instance.

## Constitution Check

*Pre-design gate: passed. Re-checked after Phase 1 (data model, contracts): passed, no violations.*

| Principle | How this plan complies |
|-----------|-----------------------|
| I. Layered API | Routes parse; `profile.service` holds the rules (username, hold, lookup, limits); SQL only in `users.repo`, `profile.repo`, `assets.repo`. Access: a member edits only their own row (`/me/*`, no deck role applies); lookups need a session. Item DTO enrichment stays in `createItemDtoMapper` |
| II. One source of truth for contracts | `profileSchema`, `profilePatchSchema`, `memberSummarySchema`, `cardCreatorSchema`, `memberLookup*` and the username rules live in `@gobbit/shared`. `pnpm api:openapi` after route changes |
| III. Invariants live in the database | Username format, length CHECKs, case-insensitive unique index, hold trigger, asset scope CHECK. Migration + down file + round-trip test. Reserved words stay in code (a list that changes) |
| IV. Private by default | Creators appear only on cards the reader already sees (same filters). Public DTO allow-list unchanged; location only in `/me`; email never in a summary; lookups need a session, are exact, rate limited and give uniform misses. Photo upload uses the signed per-member flow |
| V. Tests at the right tier | Unit + integration as listed; smoke + full e2e; traceability below |
| VI. Lean, offline-first web | No dependency; main-chunk additions are tiny; page and cropper are lazy; the creator summary rides in the persisted item cache (no email in it), the profile and lookups are not persisted beyond `/me` |
| VII. Simple, optional, deployable | No AI, no new service; two env vars with defaults; without Cloudinary the photo field is hidden like other uploads and initials remain |
| VIII. Accountable by default | `profile_events` audit rows and `profile.*` decision events (Accountability table). Limits are env-tunable |
| IX. Reuse before writing | Reused: `createItemDtoMapper` for the join, `media.service` signing and confirming (generalised by folder), `media-sweep` reference predicate, `CloudImage`, `PickButton`, `useImageUpload`, `use-drop-image`, `drafts-store`, `rateKeys`/`RateLimitService`, `DecisionLogger`, `tooltip-press`, `Sheet`. New, because nothing exists: initials/colour, `Avatar`, the canvas crop. No avatar library: see D420 |
| X. One UI system | UI reference line above; `Avatar` added to `ui-system.md`; tokens for the palette in `styles.css`; screenshots per UI task |

## Decisions this plan pins down

Full reasoning is in [research.md](research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D417 | Profile = nullable columns on `users` (`username`, `first_name`, `last_name`, `location`, `avatar`), not a separate table; existing rows need no migration step | yes → ADR-080 |
| D418 | Username: CHECK format `^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$`, unique index on `lower(username)`, reserved list in `@gobbit/shared/username`; releases write `username_holds` (default 30 days, `USERNAME_HOLD_DAYS`) and a trigger refuses another member claiming a held name; the same member may reclaim | yes (ADR-080) |
| D419 | Display name is computed: profile name when set, else the stored email-derived `display_name`, which is never rewritten; one `displayNameSql` helper replaces every direct `users.displayName` select | no |
| D420 | Initials and colour: one zod-free `@gobbit/shared/avatar` (`initialsFor`, `avatarColorIndex`); an in-house 10-colour palette of tokens hashed from the member id; no library (bundle, determinism, no-script server use). The API sends `initials`; the web derives the colour from the id | yes (ADR-080) |
| D421 | Item DTOs gain `creator`, batch-joined in `createItemDtoMapper`: `null` in personal decks, `{ id: null, … }` placeholder when unknown, else a `CardCreator` with no email and no location. Public DTOs are not touched | yes (ADR-080) |
| D422 | The avatar label is the username, else the profile name, else "Member"; the email-derived fallback name is never used for avatars of others. The accessible name is "Added by <name or Member>" | no |
| D423 | Photo: an `assets` row with `scope = 'profile'` and `owner_user_id`; `POST /me/avatar/sign` and `/me/avatar/assets` reuse the media flow with folder `gobbit/profiles/<userId>`; crop to 512 px square in the browser; the sweep counts `users.avatar` as a reference | yes (ADR-080) |
| D424 | `POST /members/lookup`: exact username for any signed-in member; an email only matches a member sharing a deck with the caller; uniform `{ member: null }` miss; rate limited per member; never returns an email | yes (ADR-080) |
| D425 | `POST /decks/{id}/invites` accepts `username` or `email` (one of); an unknown username answers the same 404 as an unknown match for lookups; `POST /me/username/check` answers `available` with only `invalid`, `reserved`, `unavailable` as reasons (taken and held look alike) | no |
| D426 | `profile_events` audit rows (field names only) in the transaction; `profile.*` decision events with keyed hashes, never the typed text | no |
| D427 | Location is a column read only through `GET /me`; no summary, member, lookup or public schema has the field (the schemas make the leak impossible, tested) | no |
| D428 | `ui/Avatar` primitive (24/40 px, fixed box, `CloudImage` for photos, not a link or button, focusable span with `role="img"`); label by hover, tap-toggle, focus and Escape through an extension of `ui/tooltip-press`; footer slot in `.card__meta` | no |
| D429 | Offline and deletion: the creator summary persists in the item cache (no email); there is no account deletion flow today, so the spec's "removed with the account" is met by FKs: `users` deletion sets cards' creator to null (placeholder) and the asset's owner to null, which makes the photo an orphan the sweep deletes | no |

## Project Structure

### Documentation (this feature)

```text
specs/046-user-profile/
├── spec.md
├── plan.md               # this file
├── research.md           # D417–D429
├── data-model.md
├── quickstart.md
├── contracts/profile-api.md
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks (not yet)
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/users.ts                       # profile columns, CHECKs, unique index, displayNameSql
├── src/schema/username-holds.ts, profile-events.ts   # NEW
├── src/schema/assets.ts                      # scope, ownerUserId, nullable deckId, CHECK
└── migrations/0027_member_profile.sql (+ down/0027_member_profile.down.sql)

packages/shared/src/
├── avatar/index.ts                           # NEW zod-free: initialsFor, avatarColorIndex, AVATAR_PALETTE_SIZE
├── username/index.ts                         # NEW zod-free: usernameShape, RESERVED_USERNAMES, isEmailShaped
├── schemas/profile.ts                        # NEW: profile, patch, check, lookup, memberSummary, cardCreator
├── schemas/item.ts, membership.ts, event.ts, ingest.ts, share.ts, auth.ts   # creator / summary fields
├── limits.ts                                 # PROFILE_* limits, USERNAME_HOLD_DAYS_DEFAULT, lookup rate
└── package.json                              # exports "./avatar", "./username"

apps/api/src/
├── routes/me.ts                              # GET /me extended; PATCH /me/profile; /me/avatar/*; /me/username/check
├── routes/members.ts                         # POST /members/lookup; invite accepts username
├── services/profile.service.ts (+ test)      # NEW rules, holds, lookup, decisions
├── services/profile.events.ts                # NEW decision types
├── services/member-summaries.ts              # NEW: batch creator/summary builder
├── services/item-dtos.ts                     # join creators; personal-deck rule
├── services/memberships.service.ts           # invite by username; summaries on list
├── services/media.service.ts, media/sign-upload.ts   # folder by scope
├── services/media-sweep.ts, repositories/assets.repo.ts   # avatar reference
├── repositories/users.repo.ts, profile.repo.ts, item-events.repo.ts, memberships.repo.ts   # displayNameSql
├── lib/rate-window.ts                        # + profileLookupUser, profileCheckUser
├── env.ts                                    # + USERNAME_HOLD_DAYS, PROFILE_LOOKUP_RATE_PER_HOUR
└── test/profile.int.test.ts                  # NEW

apps/web/src/
├── ui/Avatar.tsx (+ test)                    # NEW primitive; ui/tooltip-press.ts tap mode
├── cards/CreatorAvatar.tsx, Card.tsx, review/ReviewCard.tsx   # footer slot
├── profile/ProfilePage.tsx, ProfileForm.tsx, PhotoField.tsx, AvatarCropper.tsx, use-username-check.ts   # NEW (lazy)
├── routes/settings.profile.tsx               # NEW route; link from SettingsScreen
├── deck-admin/InviteForm.tsx, MembersSection.tsx   # username input, Avatar rows
├── reminders/use-member-name.ts, events/*    # profile name fallback
├── editor/use-image-upload.ts                # accept an upload target (deck | profile)
└── styles.css                                # --avatar-* palette tokens, .avatar, .profile-*

e2e/tests/smoke/settings.spec.ts, members.spec.ts   # + journeys
e2e/tests/full/profile.spec.ts                      # NEW
```

**Structure Decision**: DB, shared, API and web all change. The two new concerns that get their own
files are `profile.service` (rules) and `member-summaries` (the single place that turns a user row
into a safe summary), so no other code builds a name or avatar for another member by hand.

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in | Test (file, tier) |
|----------------------------------------|-------------|-------------------|
| FR-001 / FR-002 optional, trimmed, limited fields | `profilePatchSchema` + DB length CHECKs + service | `profile.test.ts` (unit); `profile.int.test.ts` (int); `full/profile.spec.ts` |
| FR-003 only self edits | `/me/*` routes have no deck/id parameter | `profile.int.test.ts` other user's id impossible, owner cannot change a member (int) |
| FR-004 / SC-004 avatar in shared and communal only | `createItemDtoMapper` (`creator` null for personal) + `CreatorAvatar` | `item-dtos.test.ts` (unit); `profile.int.test.ts` all read paths (int); `full/profile.spec.ts` |
| FR-005 creator not editor | `items.createdBy` is never written by update | `items.int.test.ts` creator unchanged after edit by another member (int) |
| FR-006 placeholder | `member-summaries` (`id: null`) + `Avatar` | `member-summaries.test.ts` (unit); `profile.int.test.ts` removed creator (int) |
| FR-007 / FR-008 / D420 initials rules | `@gobbit/shared/avatar` | `avatar.test.ts` table (unit) |
| FR-009 / SC-005 stable colour, viewer-independent | `avatarColorIndex(id)` | `avatar.test.ts` (unit); `full/profile.spec.ts` same member on list, Browse, members, preview |
| SC-007 contrast in both themes | palette tokens | `avatar-palette.test.ts` computes contrast for every token pair (unit) |
| FR-010 / FR-022 / SC-006 no email for others | `memberSummarySchema`, `cardCreatorSchema` have no email field; `Avatar` label | `profile.int.test.ts` payload scan of other-member responses, public, search, share (int); `Avatar.test.tsx` DOM has no `@` (unit) |
| FR-011 / D423 photo through the pipeline | `profile.service` + `media.service` | `profile.int.test.ts` wrong owner, other member's asset, rejected asset → 422 (int); `full/profile.spec.ts` |
| Story 3.5 cleanup | `assets.repo` `unreferenced` + avatar | `media-sweep` int test (int) |
| FR-012 / D427 location owner-only | schemas | `profile.int.test.ts` (int) |
| FR-013 / Story 5 names everywhere | `displayNameSql`, `displayNameOf` | `profile.int.test.ts` members, activity log, review, shares show profile name, revert on clear (int); `full/profile.spec.ts` |
| FR-014 hidden card hides creator | creator joined only to rows already returned | `profile.int.test.ts` category-hidden card (int) |
| FR-015 / Story 2.8, 2.9 label, no link | `Avatar` | `Avatar.test.tsx` (unit); `smoke/settings.spec.ts` hover; `full/profile.spec.ts` tap, Escape, focus |
| FR-016 / SC-009 no action by existing members | no backfill; fallback in summaries | `profile.int.test.ts` fresh user has initials and today's name (int) |
| FR-017 / FR-023 audit and decisions | `profile_events`, `profile.*` events | `profile.int.test.ts`, `profile.test.ts` (int, unit) |
| FR-018 offline | persisted item cache | `full/profile.spec.ts` offline (full) |
| FR-019 accessibility conventions | `ui/` primitives | `ProfileForm.test.tsx`, `Avatar.test.tsx` (unit) |
| FR-020 / D418 unique, case-insensitive, concurrent | DB unique index, CHECK, trigger | `profile.int.test.ts` two concurrent claims, case clash, held name, down-file (int) |
| FR-021 / D424 / D425 lookup rules | `profile.service.lookup` | `profile.int.test.ts` username, email for deck mate, email for stranger → miss, same miss for released name, rate limit (int); `smoke/members.spec.ts` invite by username |
| Edge: concurrent claims, email-shaped, reserved | schema + CHECK + service | `username.test.ts` (unit); `profile.int.test.ts` (int) |
| Migration reversible | down file | migration round-trip int test |

## Accountability

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Profile fields or photo changed | `profile_events` row | `updated` · `changes` = field names (`username`, `firstName`, `lastName`, `location`, `avatar`) | userId, requestId (row id) | audit | aggregate per day | none (expected) | `profile.int.test.ts` |
| Username claimed, changed or cleared | `profile.username` | `claimed`, `changed`, `cleared` | requestId, actorId, usernameHash | info | aggregate per day | none | `profile.test.ts` |
| Username refused | `profile.username` | `refused` · `invalid`, `reserved`, `taken`, `held` | requestId, actorId, usernameHash | info; warn on `reserved` | aggregate by reason | `reserved` > 10/h (impersonation attempts); `taken` + `held` > 50/h from one member (sniping) | `profile.test.ts` |
| Username released into hold | `username_holds` row + `profile.username_hold` | `held` | userId, holdUntil | info | aggregate | none | `profile.int.test.ts` |
| Availability check | `profile.username_check` | `available`, `unavailable` · `invalid`, `reserved`, `unavailable`; `refused` · `rate_limited` | requestId, actorId, queryHash | info | rate per member | `rate_limited` > 20/h | `profile.test.ts` |
| Member lookup | `profile.lookup` | `found`, `not_found`, `refused` · `rate_limited`; kind `username`, `email` | requestId, actorId, queryHash, targetId on `found` | info | aggregate; rate per member | `rate_limited` > 20/h; `found` > 200/h per member (enumeration) | `profile.test.ts` |
| Invite by username | existing invite events with a new `via: 'username'` field; unknown → `profile.lookup` `not_found` | existing | existing + usernameHash | existing | existing | existing | `memberships.int.test.ts` |
| Photo accepted or refused | existing `media.*` decision types with a `scope: 'profile'` field | existing | existing + ownerId | existing | existing | existing | `profile.int.test.ts` |
| Photo deleted after replace, remove or account removal | existing `media-sweep` events | existing | existing | existing | existing | existing | `media-sweep` int test |
| Creator summary falls back to placeholder / "Member" | none: derived display of data already visible, no choice about a person | — | — | — | — | — | `member-summaries.test.ts` |

**Operator controls**: `USERNAME_HOLD_DAYS` (default 30), `PROFILE_LOOKUP_RATE_PER_HOUR` (default 30,
shared by lookup and availability checks). Defaults in `@gobbit/shared` `limits.ts`; photo limits are
the media ones. The thresholds go in the `docs/design/profile.md` runbook section.

## Rollout

- **Migrations**: `0027_member_profile` is additive and reversible (the down file drops the trigger,
  tables, indexes, CHECKs and columns, and restores `assets.deck_id NOT NULL` after deleting profile
  assets). No backfill.
- **Env / config**: two optional vars → README env table, Compose `x-api-env`, `CHANGELOG.md` entry
  (no **Action required**: both have defaults).
- **API client**: `pnpm api:openapi` needed (item DTO, members, `/me`, new routes).
- **Deploy order / flags**: the normal CI → Dokploy flow. API and web ship together; an old web
  ignores `creator`, and the new web handles a missing `creator` as "no avatar" for one deploy cycle.
  No flag.
- **Docs**: new `docs/design/profile.md` (columns, summary rules, lookup, runbook thresholds,
  Deviations); `card-media.md` (profile scope assets); `ui-system.md` (`Avatar`); `activity-log.md`
  (profile names); `data-model.md`; ADR-080 in `docs/adr.md` plus one index row in
  `docs/architecture.md`; a `CLAUDE.md` bullet (profile and creator summary rules); a `PLAN.md` line.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A member DTO gains a name or email field by accident and leaks it | M / H | Summaries only through `member-summaries.ts`; schemas without email; an integration payload scan over every other-member response |
| The profile name makes a scattered `users.displayName` select inconsistent | M / M | `displayNameSql` helper and a grep-based unit check that no repo selects `users.displayName` directly |
| Username lookup becomes an enumeration oracle | M / M | Exact match only, per-member rate limit, uniform miss, decision events with alerts; email lookup limited to deck mates |
| Held-name race between two claimants | L / M | The trigger runs in the claiming transaction; the unique index decides live clashes |
| Sweep deletes a profile photo | M / H | Reference predicate and partial index; the int test keeps a referenced photo and frees a replaced one |
| Crop fails on large HEIC or very large phone photos | M / M | Decode through `createImageBitmap`, downscale first, show "Couldn't read this photo" and keep the previous one; the media size limits apply before decode |
| Tap-toggle label conflicts with long-press tooltips | L / M | One shared helper with a mode flag; unit tests for hover, tap, second tap, outside tap, Escape, focus |
| Avatar crowds the footer on narrow screens | M / L | Fixed 24 px box in `.card__meta`; chips wrap before the avatar; 412 px screenshots |
| Offline cache holds names of former deck mates | L / L | Same exposure as the cached cards themselves; summaries contain only what a member could already see |

## Settle before starting

- [ ] Confirm D422 (the avatar label never falls back to the email-derived name; it shows "Member"). The spec left this to the plan.
- [ ] Confirm D424: an email lookup previews only members who already share a deck with the caller (the invite itself still works by email for anyone), because an email preview for strangers would reveal who is registered.
- [ ] Confirm the default hold of 30 days.

## Complexity Tracking

No constitution violations.
