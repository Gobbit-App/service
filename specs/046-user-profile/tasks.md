---

description: "Tasks for 046 member profile and creator avatar"
---

# Tasks: Member profile and card creator avatar (046)

**Input**: `specs/046-user-profile/` — spec.md, plan.md, research.md (D417–D429), data-model.md, contracts/profile-api.md

**Tests**: REQUIRED (constitution V). Every traceability row in plan.md maps to a test task below.

**Organization**: Phase 1 is shared foundations (shapes, DB, summaries) that every story needs. Then one phase
per story in priority order. Story labels map to spec.md: US1 profile page, US2 creator avatar on cards,
US3 photo, US4 initials/colour, US5 real names, US6 location, US7 username and lookup.

**UI tasks** (constitution X): each states its UI reference sibling and is done only with phone (412 px) and
desktop (1280 px) screenshots, light and dark, compared with the sibling. Use `pnpm test:unit` for `ui-system.test.ts`.

## Format: `[ID] [P?] [Story] [Tier?] Description`

---

## Phase 1: Foundations (blocks every story)

**Goal**: the shared definitions, the migration and the one safe summary builder exist; nothing user-visible yet.

### Shared (`@gobbit/shared`)

- [X] T001 [P] `packages/shared/src/avatar/index.ts` (zod-free subpath `./avatar`, add to `package.json` exports): `initialsFor({ firstName?, lastName?, email? })` and `avatarColorIndex(userId)` per research D420 — names: first grapheme (`Intl.Segmenter`) of first and last name, upper-cased where the script has case, symbol/digit-only names skipped to the first letter; no names: email local part split on `.`, `-`, `_`, parts without a letter skipped, first and last remaining part, one part → one letter, nothing usable → `''`; colour: FNV-1a of the id modulo `AVATAR_PALETTE_SIZE = 10`
- [X] T002 [P] [unit] `packages/shared/src/avatar/index.test.ts`: table of names (Latin, Hebrew, Arabic, CJK, emoji, combining marks, honorific, lower-case, one name only), emails (`dana.levi@example.test` → `DL`, `dana@example.test` → `D`, `dana.m.levi@example.test` → `DL`, digits-only → `''`), colour stable, in `0..9`, spread across 1000 uuids, never depends on the name
- [X] T003 [P] `packages/shared/src/username/index.ts` (zod-free subpath `./username`): `USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$/`, `RESERVED_USERNAMES` (admin, administrator, gobbit, support, help, root, system, staff, team, official, me, null, undefined, api, www, mail, noreply, security, abuse), `checkUsernameShape(value)` → `'ok' | 'invalid' | 'reserved'` (case-insensitive reserved; a value containing `@` is `invalid`)
- [X] T004 [P] [unit] `packages/shared/src/username/index.test.ts`: lengths 2/3/30/31, leading `.`/`-`/`_`, `@`, spaces, unicode, `Admin`, `GOBBIT`
- [X] T005 `packages/shared/src/schemas/profile.ts`: `profileSchema` (username/firstName/lastName/location nullable text, avatar `{ publicId, width?, height? }` nullable, `initials`), `profilePatchSchema` (all optional, trim, blank → null; firstName/lastName ≤ 60 code points, location ≤ 100, username via `checkUsernameShape`), `usernameCheckRequest/Response`, `memberSummarySchema` `{ id, name, username, initials, photo }`, `cardCreatorSchema` (`id` nullable), `memberLookupRequest { query: 1..254 }` / `Response { member: MemberSummary | null }`; no schema here has an `email` or `location` field except `profileSchema.location` (D427); export `displayNameOf({ firstName, lastName, displayName })` (profile name when either is set, one name alone, else the stored `displayName`)
- [X] T006 [P] [unit] `packages/shared/src/schemas/profile.test.ts`: trimming, blank → null, 60/61 and 100/101 limits (code points), `displayNameOf` cases, summaries parse without email
- [X] T007 `packages/shared/src/limits.ts`: `USERNAME_HOLD_DAYS_DEFAULT = 30`, `PROFILE_LOOKUP_RATE_PER_HOUR_DEFAULT = 30`, `PROFILE_NAME_MAX = 60`, `PROFILE_LOCATION_MAX = 100`; `packages/shared/src/events/constants.ts`: `profileEventFields = ['username','firstName','lastName','location','avatar']`

### Database

- [X] T008 `packages/db/src/schema/users.ts`: columns `username` text NULL with CHECK `users_username_format_chk` `username ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$'`, unique index `users_username_lower_uq` on `lower(username)`; `first_name`, `last_name` text NULL CHECK `char_length ≤ 60` and `= btrim(...)`; `location` text NULL CHECK `≤ 100` and `= btrim(...)`; `avatar` jsonb NULL CHECK shape (`publicId` string) and partial index `users_avatar_public_id_idx` on `(avatar->>'publicId') WHERE avatar IS NOT NULL`; export `displayNameSql` = `coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), display_name)`
- [X] T009 [P] `packages/db/src/schema/username-holds.ts` (`username_lower` text PK, `released_by` uuid NOT NULL → users ON DELETE CASCADE, `hold_until` timestamptz(3) NOT NULL, `created_at`) and `profile-events.ts` (`id` uuid PK, `user_id` uuid NULL → users ON DELETE SET NULL, `changes` text[] NOT NULL, `request_id` text NULL, `created_at`); export from the schema index
- [X] T010 `packages/db/src/schema/assets.ts`: `scope` text NOT NULL DEFAULT `'deck'` CHECK in (`deck`,`profile`), `owner_user_id` uuid NULL → users ON DELETE SET NULL, `deck_id` made NULLable, CHECK `assets_scope_chk` `(scope = 'deck') = (deck_id IS NOT NULL)`, partial index `assets_owner_idx` on `owner_user_id WHERE owner_user_id IS NOT NULL`
- [X] T011 `packages/db/migrations/0027_member_profile.sql` (`pnpm db:generate`, then add by hand): the trigger function and `users_username_hold_guard` BEFORE INSERT OR UPDATE OF username (raise an exception with a stable `hint = 'username_held'` when `lower(NEW.username)` has a `username_holds` row with `hold_until > now()` and `released_by <> NEW.id`); Drizzle snapshot + journal
- [X] T012 `packages/db/migrations/down/0027_member_profile.down.sql`: drop trigger, function, tables, indexes, CHECKs, columns; delete `scope = 'profile'` assets first; restore `assets.deck_id NOT NULL`
- [X] T013 [P] [int] `packages/db/test/member-profile.int.test.ts`: every CHECK rejects (format, `@`, 2/31 chars, 61-char name, untrimmed value), `Dana` vs `dana` clash, two concurrent claims → exactly one wins, hold trigger (other member refused, releasing member allowed, expired allowed), `assets_scope_chk`; `migrations.int.test.ts` round trip with a profile asset present
- [X] T014 [P] `packages/db/test/factories.ts`: `makeUser` accepts the profile fields; `makeProfileAsset(userId)`
- [X] T015 `apps/api/src/errors/pg.ts` (`mapPgError`): map unique violation of `users_username_lower_uq` → `username_taken`, the hold trigger hint → `username_held`; [unit] `pg.test.ts`

### API foundations

- [X] T016 `apps/api/src/services/member-summaries.ts` (+ `.test.ts` [unit]): `memberSummaries(userIds)` → `Map<id, MemberSummary>` from one query selecting explicit columns (id, first/last name, username, avatar, email only to feed `initialsFor`, never returned); `cardCreator(createdBy, deckKind)` → `null` for a personal deck, the placeholder `{ id: null, name: null, username: null, initials: '', photo: null }` when `createdBy` is null or not found, else the summary (`name` = profile name only, D422); tests: no `email` key anywhere, placeholder, personal → null, soft-deleted user → placeholder
- [X] T017 `apps/api/src/repositories/users.repo.ts`: `profileById`, `summariesByIds(ids)`, `findByUsername(lower)`, `updateProfile` (transaction helper taking the profile events insert); every repo selecting `users.displayName` (`memberships.repo.ts`, `item-events.repo.ts`, `waitlist.repo.ts`, review/share repos, `/me`) switches to `displayNameSql` (D419); [unit] a grep-style test `no-direct-display-name.test.ts` fails if a repo file selects `users.displayName` outside `displayNameSql`
- [X] T018 `apps/api/src/env.ts`: `USERNAME_HOLD_DAYS` and `PROFILE_LOOKUP_RATE_PER_HOUR` (`positiveInt` with the shared defaults); `lib/rate-window.ts`: `rateKeys.profileLookupUser(userId)`; README env table, Compose `x-api-env`, `CHANGELOG.md` entry (no **Action required**)
- [X] T019 `apps/api/src/services/profile.events.ts`: `ProfileDecisions` map and `PROFILE_DECISION_LEVELS` for `profile.username` (claimed/changed/cleared/refused · invalid, reserved, taken, held), `profile.username_hold`, `profile.username_check` (available/unavailable/refused), `profile.lookup` (found/not_found/refused · kind `username`|`email`, rate_limited); fields requestId, actorId, hashes only; `reserved` refusals at `warn`
- [X] T020 [P] [US2] `apps/web/src/styles.css`: `--avatar-1-bg … --avatar-10-fg` token pairs for light and dark, every pair ≥ 4.5:1; [unit] `apps/web/src/ui/avatar-palette.test.ts` computes the contrast of all 20 pairs from the CSS (SC-007)

**Checkpoint**: `pnpm typecheck && pnpm test:unit && pnpm test:int` green; migration applies and reverses.

---

## Phase 2: US1 + US7 — Profile page, username and finding people (P1) 🎯 MVP

**Goal**: a member edits their profile and username; others find them by username (or deck mates by email) and invite them.

**Independent test**: quickstart § 2 steps 1, 4, 5.

### API

- [X] T021 [US1] `apps/api/src/services/profile.service.ts`: `get(user)`, `update(user, patch, requestId)` — one transaction: validate (profilePatchSchema), for a username change re-run `checkUsernameShape`, write, insert `username_holds` for the old name (`hold_until = now + USERNAME_HOLD_DAYS`) when released or changed, insert `profile_events` with the changed field names only, record decisions (T019) after commit; no-op patch writes nothing; refusals map to 422 field `username` with reasons `invalid` | `reserved` | `unavailable` (taken and held look alike); avatar is rejected here until US3
- [X] T022 [P] [US1] [unit] `profile.service.test.ts`: trim/blank → null, limits, no-op logs nothing, username claimed/changed/cleared/refused each record the right decision with `usernameHash` and no raw text, hold written on change and clear, same member reclaims, event rows carry field names only
- [X] T023 [US1] `apps/api/src/routes/me.ts`: `GET /me` returns `profile` (+ existing fields, `displayName` computed); `PATCH /me/profile`; `POST /me/username/check` (rate limit via `rateKeys.profileLookupUser`, records `profile.username_check`); session-only (ingest tokens refused); OpenAPI definitions
- [X] T024 [US7] `profile.service.ts` `lookup(user, query)`: no `@` → exact `lower(username)`; with `@` → exact email, returned only when the caller shares a deck (owner account user or accepted member) with the target; rate limited per member; uniform `{ member: null }` miss; records `profile.lookup` (kind, `queryHash`, `targetId` on found); never selects or returns an email; `routes/members.ts` `POST /members/lookup`
- [X] T025 [US7] `apps/api/src/services/memberships.service.ts` + `routes/members.ts`: `inviteCreateSchema` accepts exactly one of `email` or `username` (refine, 422 otherwise); a username resolves to the member's email internally and answers an unknown name with the same 404 problem as the lookup miss (record `profile.lookup` `not_found`); invite events gain `via: 'username'`; the email path is unchanged; `GET /decks/{id}/members` adds `username`, `initials`, `photo` and the computed `displayName`
- [X] T026 [P] [US7] [unit] `profile.service.test.ts` lookup: username hit, case-insensitive, email for deck mate, email for stranger → miss identical to never-existed, rate limited → 429 + decision, no email key in any result
- [X] T027 [P] [int] `apps/api/test/profile.int.test.ts` (part 1): GET/PATCH round trip; reload persists; clear one field keeps the others; 422 limits and reasons; two members racing for one username → one 200, one 422; held name refused for others and allowed for the releaser; invite by username sends the mail to the member's email and the response never contains it; unknown vs released username → identical response bodies; stranger email lookup → miss; lookup 31st call in an hour → 429; `profile_events` row in the same transaction (rollback leaves none); ingest token refused
- [X] T028 `pnpm api:openapi` (regenerates `packages/api-client`); commit the diff

### Web

- [X] T029 [US1] `apps/web/src/routes/settings.profile.tsx` (lazy) + link row in `apps/web/src/settings/SettingsScreen.tsx`; UI reference: Settings sections (`SettingsSection`); [unit] route renders
- [X] T030 [US1] `apps/web/src/profile/ProfileForm.tsx`: fields First name, Last name, Username, Location in the `.field-group` pattern of `NotificationsSection`; Save/Reset through `ui/buttons`; current values from `GET /me`; avatar preview of the member's own `initialsFor(email)` fallback; username hint "Others can currently find you only by email" when empty; save shows a status confirmation (`ui/StatusViews`), keeps typed values and shows the server message on failure; invalidates the `me` and item queries so names update without sign-out
- [X] T031 [US1] `apps/web/src/profile/use-username-check.ts`: debounced `POST /me/username/check` as the member types, shows "Available" / "Not available" / "Use 3–30 letters, digits, ., _ or -" without saying who holds it; the save remains the authority
- [X] T032 [US1] unsaved edits: draft stored through `editor/drafts-store.ts` under a `profile` key, cleared on save and sign-out (D145); `useBlocker` confirm via the existing leave-confirm pattern when dirty
- [X] T033 [P] [US1] [unit] `ProfileForm.test.tsx`: loads values, blank → cleared, limit message, failed save keeps input, draft restored after remount, leave guard when dirty, username check states, labels and focus order
- [X] T034 [US7] `apps/web/src/deck-admin/InviteForm.tsx`: one input accepting email or username (a value without `@` is a username); after a pause shows a preview row (`Avatar`, name, username) from `POST /members/lookup` when there is a hit (usernames and deck mates' emails); send uses `username` or `email`; an unknown username shows "No member found" identical for every miss; UI reference: the current invite field-group
- [X] T035 [P] [US7] [unit] `InviteForm.test.tsx`: `@` → email body, else username body, preview on hit, same message on every miss, no email rendered
- [ ] T036 [US1] Screenshots at 412 and 1280 px, light and dark, for the profile page and the invite preview vs `NotificationsSection` and the current invite form (constitution X); `docs/design/ui-system.md` row for the profile page siblings
- [ ] T037 [e2e:smoke] `e2e/tests/smoke/settings.spec.ts`: sign in, set first name, last name, username, save, reload → values persist; `e2e/tests/smoke/members.spec.ts`: owner invites a second member by username (the invite lands, the member list shows them), nothing in Gobbit faked
- [ ] T038 [P] [e2e:full] `e2e/tests/full/profile.spec.ts` (part 1): taken, reserved, invalid and held usernames give the clear message; clear a field; failed save keeps input; leave-with-edits prompt; lookup by a deck mate's email shows a preview and a stranger's does not; rate-limit message

**Checkpoint**: MVP of the profile; `pnpm test:unit && pnpm test:int` and `@smoke` green.

---

## Phase 3: US2 + US4 — Creator avatar on cards, with initials and colour (P1)

**Goal**: every card in a shared or communal deck shows the creator's avatar; personal decks show none.

**Independent test**: quickstart § 2 steps 2–3.

### API

- [X] T039 [US2] `packages/shared/src/schemas/item.ts`: `itemSchema.creator: cardCreatorSchema.nullable()`; `apps/api/src/services/item-dtos.ts` (`createItemDtoMapper`): collect distinct `createdBy`, one `memberSummaries` call per page, attach `cardCreator(createdBy, deck.kind)`; `createdBy` stays; public mapper `toPublicItem` untouched
- [X] T040 [P] [US2] [unit] `item-dtos.test.ts`: personal deck → `null`, shared with creator, creator null → placeholder, one query for N items, no `email` anywhere in the DTO
- [X] T041 [US2] `review.service.ts` / `routes/review`: `job.sharedBy` becomes a `memberSummarySchema` plus the computed `displayName`; proposals' `creator` is the sharer (never the agent)
- [X] T042 [P] [US2] [int] `apps/api/test/profile.int.test.ts` (part 2): `creator` present on one item, list, favorites, category and search results and the review queue; `null` in a personal deck; placeholder after the creator's user row is removed (cards keep rendering); creator unchanged after another member edits, archives and restores the card (FR-005); a category-hidden card's creator never appears for a reader without the category (FR-014); a communal reader sees creators; payload scan: no email, no `location` in any other-member response, members list for non-owners, `/public/*`, public search, share previews and sitemap have no `creator`
- [X] T043 [US2] `pnpm api:openapi`

### Web

- [X] T044 [US4] `apps/web/src/ui/Avatar.tsx` (+ `docs/design/ui-system.md` entry): props `{ member: MemberSummary | CardCreator, size: 'sm'|'md' }`; renders `CloudImage` (photo, `alt=""`) else initials on `--avatar-N` from `avatarColorIndex(id)` else the person glyph from `ui/icons`; a `span` with `role="img"`, `tabIndex=0`, accessible name from props (never an anchor or button); fixed box (24 px sm, 40 px md) so nothing shifts; photo error falls back to initials; CSS in `styles.css` (tokens only, `.avatar`, `.avatar--sm|md`, `.avatar__initials`)
- [X] T045 [US4] `apps/web/src/ui/tooltip-press.ts` (+ `Avatar`): label via the app's `data-tip` tooltip extended with a tap-toggle mode — opens on hover, focus and tap; closes on pointer leave, a second tap, an outside tap, Escape; label = username, else profile name, else "Member"; accessible name "Added by <name or username, or Member>" (D422)
- [X] T046 [P] [US4] [unit] `Avatar.test.tsx` / `tooltip-press.test.ts`: renders photo/initials/glyph, no anchor or button in the tree, no `@` in the DOM or attributes, label rules, open/close paths (hover, focus, tap, second tap, outside, Escape), photo error → initials, fixed size classes, two members with the same initials differ by label
- [X] T047 [US2] `apps/web/src/cards/CreatorAvatar.tsx`: renders `Avatar` for `item.creator` when not null; mounted in the `.card__meta` footer of `cards/Card.tsx` and in `review/ReviewCard.tsx`; Browse, full view and card page get it through `Card`; nothing mounted (and no space) when `creator` is null; UI reference: `.card__meta` (`card__chips`, `card__age`); narrow screens never wrap the avatar onto the action bar
- [X] T048 [P] [US2] [unit] `CreatorAvatar.test.tsx`, `Card.test.tsx` snapshot unchanged for `creator: null`, placeholder renders, `ReviewCard` shows the sharer
- [ ] T049 [US2] Screenshots at 412 and 1280 px, light and dark: list, Browse, full view, card page, review queue vs the current card footer; run `pnpm budget` and record the size in `implementation-notes.md`
- [ ] T050 [e2e:smoke] `e2e/tests/smoke/settings.spec.ts`: after setting the profile, a card the member adds to a shared `smoke-<id>` deck shows their avatar and hovering it shows the username, not an email; the same member's personal-deck card has none
- [ ] T051 [P] [e2e:full] `e2e/tests/full/profile.spec.ts` (part 2): two members see the same initials and colour in list, Browse and members list; no avatar in a personal deck; placeholder for a removed creator; tap, second tap, outside tap, Escape and keyboard focus on the label; avatar is not clickable (URL unchanged); box does not move when a photo loads (bounding box before and after); communal reader; offline render of a seen avatar; Browse swipe and action bar unchanged

**Checkpoint**: P1 stories complete (US1, US2, US4, US7).

---

## Phase 4: US3 — Profile photo (P2)

**Goal**: add, crop, replace and remove a photo; it shows on cards; unused files are cleaned up.

**Independent test**: quickstart § 2 step 6.

- [ ] T052 [US3] `apps/api/src/media/sign-upload.ts` + `services/media.service.ts`: generalise signing/confirming by scope — `signProfileUpload(userId)` (folder `gobbit/profiles/<userId>`, tags `profile`, `user:<userId>`, images only, same size and type limits), `confirmProfileUpload` records the asset with `scope = 'profile'`, `owner_user_id`, `deck_id` null; same rate keys `mediaSignUser`/`mediaConfirmUser`; `media.*` decisions get `scope`; `routes/me.ts`: `POST /me/avatar/sign`, `POST /me/avatar/assets`
- [ ] T053 [US3] `profile.service.ts` `update`: `avatar: { publicId } | null` — the asset must be `scope = 'profile'`, `owner_user_id = caller`, not rejected, else 422 `avatar.publicId` "Unknown image"; width/height copied from the asset; changed field `avatar` in `profile_events`; `member-summaries.ts` returns `photo`
- [ ] T054 [US3] `apps/api/src/repositories/assets.repo.ts` `unreferenced` + `services/media-sweep.ts`: add `users.avatar->>'publicId'` as a reference (uses `users_avatar_public_id_idx`) and cover the `gobbit/profiles/` prefix; a profile asset with `owner_user_id` null and no reference is an orphan like any other
- [ ] T055 [P] [unit] `media.service.test.ts` (profile folder/tags, images only, over-limit refused), `profile.service.test.ts` (foreign, deck-scope, rejected and unknown assets → 422; replace and remove)
- [ ] T056 [P] [int] `profile.int.test.ts` (part 3) and `media-sweep.int.test.ts`: a referenced avatar is never swept; a replaced or removed avatar is freed after `MEDIA_ORPHAN_GRACE_DAYS`; removing the user row leaves the asset orphaned (owner null) and swept, the cards show the placeholder; another member cannot set your photo; a deck owner cannot (FR-003); `pnpm api:openapi`
- [ ] T057 [US3] `apps/web/src/profile/AvatarCropper.tsx` (lazy chunk, in a `ui/sheet` Sheet): circular mask, pointer drag and a zoom range input, decode with `createImageBitmap` after the size limit, draw the visible square to a 512 px canvas (JPEG 0.9), keyboard arrows move, labelled controls; UI reference: `CoverField` action row + Sheet
- [ ] T058 [US3] `apps/web/src/profile/PhotoField.tsx`: `PickButton` with `capture="user"` offered where the device has a camera, drop through `editor/use-drop-image.ts`, then the cropper; `editor/use-image-upload.ts` accepts a target (`deck` or `profile` → `/me/avatar/*`); Replace and Remove once a photo exists; a failed upload keeps the previous photo and the other edits; the avatar preview uses `Avatar` md; wired into `ProfileForm`
- [ ] T059 [P] [unit] `AvatarCropper.test.tsx` (output size 512×512 from a stubbed canvas, zoom/pan clamp, cancel), `PhotoField.test.tsx` (pick, drop, replace, remove, failed upload keeps previous, unreadable file message)
- [ ] T060 [US3] Screenshots at 412 and 1280 px, light and dark: photo field empty and set, cropper sheet vs `CoverField` and an existing Sheet; `pnpm budget` (the cropper and page stay out of the initial chunk)
- [ ] T061 [P] [e2e:full] `e2e/tests/full/profile.spec.ts` (part 3): upload through `routeFakeCloudinary`, crop, save → card shows the photo; replace; remove → initials; failed upload keeps previous; over-limit and wrong-type messages; broken image → initials

---

## Phase 5: US5 — Real names across the app (P2)

**Goal**: wherever a member's name appears today, the profile name shows, with the email-derived fallback.

**Independent test**: set names → members list, activity log, review queue and share rows show them; clear → previous values.

- [ ] T062 [US5] Apply `displayNameSql`/`displayNameOf` and add `initials`/`username`/`photo` where a name already appears: `memberships.service.ts` (`list`, `changeRole`, invite mail `inviterName`), `events.service.ts` actor, `review.service.ts` `sharedBy`, `shares.service.ts` `reviewedBy`, `waitlist-admin.service.ts` `invitedBy`, `/me`; schemas in `packages/shared/src/schemas/{membership,event,ingest,share,waitlist-admin,auth}.ts`; `pnpm api:openapi`
- [ ] T063 [P] [int] `profile.int.test.ts` (part 4): members list, activity log (past entries too), review `sharedBy`, share rows and invite mail show the profile name; clearing names reverts to the exact previous value; one name only shows that one; emails appear only where they do today (owners' member list)
- [ ] T064 [US5] Web: `deck-admin/MembersSection.tsx` rows show `Avatar` md + name; `reminders/use-member-name.ts`, activity log and review rows use the new fields; UI reference: the current member row
- [ ] T065 [P] [unit] `MembersSection.test.tsx`, `use-member-name.test.ts` (profile name, fallback, "someone")
- [ ] T066 [US5] Screenshots at 412 and 1280 px, light and dark: members list and activity log vs current
- [ ] T067 [P] [e2e:full] `e2e/tests/full/profile.spec.ts` (part 4) and `activity-log.spec.ts`: set names → members list, activity log and review queue update without sign-out; clear → previous names

---

## Phase 6: US6 — Location (P3)

- [ ] T068 [US6] Location is already a profile field (T005, T008, T021, T030); add the owner-only guarantee test: [int] `profile.int.test.ts` (part 5): location returned only by `GET /me` / `PATCH /me/profile`, absent from summaries, lookup, members, activity log, public and share responses; set, change and clear persist
- [ ] T069 [P] [e2e:full] `e2e/tests/full/profile.spec.ts` (part 5): set, reload, clear the location

---

## Phase 7: Polish and docs

- [ ] T070 `docs/design/profile.md` (new): columns, username and hold rules, display name computation, creator summary, lookup and its email rule, photo flow, runbook thresholds from the plan's Accountability table (`reserved` > 10/h; `taken`+`held` > 50/h per member; lookup `rate_limited` > 20/h and `found` > 200/h per member), env vars, Deviations list
- [ ] T071 `docs/adr.md` ADR-080 (D417, D418, D420, D421, D423, D424); `docs/architecture.md` one index row (file stays < 250 lines); `docs/design/{card-media.md,activity-log.md,data-model.md,ui-system.md}` updates per the plan; `CLAUDE.md` one "Profile" bullet; `PLAN.md` line; `README.md` env table
- [ ] T072 `implementation-notes.md`: decisions not made by the plan and every deviation; copy deviations into `docs/design/profile.md`
- [ ] T073 Final gates: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm api:openapi` (no diff) `&& pnpm budget && pnpm test:e2e`; walk `quickstart.md` § 2 by hand; open the PR stating "E2E tier: smoke + full"

---

## Dependencies and order

- Phase 1 blocks everything. Inside it: T001–T007 (shared) → T008–T015 (DB) → T016–T019 (API), T020 any time.
- Phase 2 (US1 + US7) needs Phase 1. Phase 3 (US2 + US4) needs Phase 1 and the web `Avatar` from T044, which the invite preview (T034) uses: do T044–T046 before T034 if sequential, or stub the preview without the avatar first.
- Phase 4 (US3) needs Phases 2 and 3 (profile service, `Avatar`). Phase 5 (US5) needs Phase 1 and `Avatar`. Phase 6 needs Phase 2.
- `pnpm api:openapi` runs after every route/schema task that changes the contract (T028, T043, T056, T062).

## Parallel opportunities

T001–T004, T006, T009, T014, T020 are independent files. After Phase 1: US2's API (T039–T043) and US1's API (T021–T028) touch different services, but both touch `profile.int.test.ts` (parts 1 and 2), so run those tests tasks sequentially. Web tasks in different folders (`profile/`, `ui/`, `cards/`, `deck-admin/`) can run in parallel when `styles.css` edits are serialised.

## Implementation strategy

MVP = Phases 1–3 (the P1 stories): profile page, username and invite by username, creator avatar with initials and colour. Photo (Phase 4) and name propagation (Phase 5) follow as separate PRs; location is nearly free (Phase 6). Each phase leaves `main` deployable: the API tolerates a web without `creator`, and the new web treats a missing `creator` as no avatar.
