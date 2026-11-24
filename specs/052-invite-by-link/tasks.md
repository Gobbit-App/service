---

description: "Tasks for 052 invite by link"
---

# Tasks: Invite by link

**Input**: Design documents from `/specs/052-invite-by-link/`

**Prerequisites**: plan.md, spec.md, research.md (D466–D476), data-model.md, contracts/invite-links.md, quickstart.md

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story so each story can be built and tested on its own.

**Assumption**: D472 (a brand-new person joins when they open the sign-in mail; existing accounts tap Join) is taken as confirmed by running `/speckit-tasks`. If it is reverted, drop T030–T033 and change T034 to send everyone back to `/join`.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3 from spec.md
- **[Tier]**: `[unit]`, `[int]`, `[e2e:smoke]` (plan's E2E tier: smoke)
- UI tasks name their sibling from the plan's "UI reference" and end with the screenshot requirement (constitution X)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared schemas, env and events that every story needs

- [ ] T001 Drizzle table `deckInviteLinks` in packages/db/src/schema/deck-invite-links.ts (export from packages/db/src/schema/index.ts), columns exactly as data-model.md § New table: `id` uuid PK `defaultRandom()`; `deck_id` uuid NOT NULL → `decks.id` ON DELETE CASCADE; `token` text NOT NULL UNIQUE; `name` text NOT NULL with `CHECK (char_length(name) BETWEEN 1 AND 60)`; `role` `member_role` NOT NULL with `CHECK (role <> 'owner')`; `created_by` uuid NULL → `users.id` ON DELETE SET NULL; `expires_at` timestamptz(3) NOT NULL; `accepted_at` timestamptz(3) NULL; `accepted_by` uuid NULL → `users.id` ON DELETE SET NULL; `membership_id` uuid NULL → `memberships.id` ON DELETE SET NULL; `revoked_at` timestamptz(3) NULL; `revoked_by` uuid NULL → `users.id` ON DELETE SET NULL; auto `created_at`/`updated_at`. Table CHECKs `num_nonnulls(accepted_at, revoked_at) <= 1` and `accepted_at IS NOT NULL OR (accepted_by IS NULL AND membership_id IS NULL)`; index `(deck_id, created_at DESC)`
- [ ] T002 Add `inviteLinkId` (`invite_link_id` uuid NULL → `deck_invite_links.id` ON DELETE SET NULL) and `CHECK (invite_link_id IS NULL OR purpose = 'sign_in')` to packages/db/src/schema/magic-links.ts
- [ ] T003 `pnpm db:generate` → packages/db/migrations/0030_deck_invite_links.sql (check it includes the auto-timestamp trigger like other tables) + hand-written packages/db/migrations/down/0030_deck_invite_links.down.sql (drop `magic_links.invite_link_id`, then the table)
- [ ] T004 [P] [int] Migration round-trip and every CHECK (owner role refused, name 0 and 61 chars refused, accepted+revoked refused, `accepted_by` without `accepted_at` refused, `invite_link_id` on a non-`sign_in` link refused, duplicate token refused, deck delete cascades, creator delete sets null) in packages/db/test/deck-invite-links.int.test.ts
- [ ] T005 [P] DTOs in packages/shared/src/schemas/invite-links.ts (re-export from packages/shared/src/index.ts) per data-model.md § DTOs: `inviteLinkCreateSchema` strict `{ name: string 1–60 trimmed, role: 'maintainer' | 'editor' | 'reader' }` (`memberRoles` without `owner`); `inviteLinkSchema` `{ id, name, role, state: 'waiting'|'accepted'|'revoked'|'expired', createdBy: MemberSummary|null, acceptedBy: MemberSummary|null, createdAt, expiresAt, url: string|null }`; `inviteLinkListSchema` `{ links }`; `invitePreviewSchema` `{ state: 'waiting'|'used'|'revoked'|'expired'|'invalid', deckName?, inviterName?, role? }`; `inviteAcceptSchema` `{ token: string 1–256 }` and its answer `{ deck: { id, slug, name } }`. Add `invite?: string 1–256` to `magicLinkRequestSchema` in packages/shared/src/schemas/auth.ts
- [ ] T006 [P] [unit] Schema tests (owner role refused, name trimmed and bounded, strict extra keys refused, `invite` optional and bounded) in packages/shared/src/schemas/invite-links.test.ts and packages/shared/src/schemas/auth.test.ts
- [ ] T007 [P] Limits `INVITE_LINKS_WAITING_MAX_DEFAULT = 10` and `INVITE_LINK_NAME_MAX = 60` in packages/shared/src/limits.ts; env `INVITE_LINKS_WAITING_MAX` (positive int, default from the limit) in apps/api/src/env.ts
- [ ] T008 [P] Decision-event names, outcomes and reasons (`invite_link.create` created / refused·limit,personal; `invite_link.open` shown / refused·used,revoked,expired,invalid with `surface` page|preview; `invite_link.join` accepted / refused·used,revoked,expired,invalid,already_member with `via` join|sign_in; `invite_link.revoke` revoked / refused·not_waiting) in apps/api/src/services/invite-links.events.ts, following apps/api/src/services/auth.events.ts. Fields are ids and keyed hashes only, never a token or address
- [ ] T009 Repository apps/api/src/repositories/invite-links.repo.ts: `findByToken`, `findById`, `create` (locks the deck row, counts waiting links `accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`, refuses over the cap, inserts with `generateToken()` and `expires_at = now + INVITE_TTL_DAYS`), `listForDeck` (waiting plus ended within `INVITE_TTL_DAYS`, newest first), `revoke`, and `accept(tx, …)` implementing data-model.md § Accept transaction steps 1–6 (`FOR UPDATE`, state checks, D473 validity via `resolveRole(created_by)` = owner and deck live and not personal, already-member check skippable for the callback path, pending membership accepted with the link's role + `magicLinks.expireUnusedForMembership`, otherwise insert accepted membership with `invited_by = created_by`, then set `accepted_at/accepted_by/membership_id`)
- [ ] T010 Service apps/api/src/services/invite-links.service.ts: `create`, `list` (maps rows to `inviteLinkSchema`, derived state, `url = <public origin>/s/invite?t=<token>` only while waiting, `createdBy`/`acceptedBy` via `member-summaries.ts`), `revoke`, `preview(token, surface)` (state plus deck name, inviter shown name and role only while waiting; unknown token → `invalid`), `accept(actor, token)`; each writes its T008 event
- [ ] T011 [unit] Service rules and events (cap refusal, personal refusal, every preview state, preview omits deck fields unless waiting, revoke of a non-waiting link, accept outcome → event mapping, no token in any event) in apps/api/src/services/invite-links.service.test.ts

**Checkpoint**: Foundation ready. User stories can begin.

---

## Phase 2: User Story 1 - An owner sends an invite through a chat (Priority: P1) 🎯 MVP

**Goal**: An owner creates a named link with a role and shares it from the members settings.

**Independent Test**: quickstart.md scenario 1 (create, list, share, same URL after reload) and scenario 9 (limit).

### Tests for User Story 1

- [ ] T012 [P] [US1] [int] Owner routes in apps/api/test/invite-links.int.test.ts: owner creates (201, `state = waiting`, `url` has `?t=`); editor and maintainer get 403 on create and list (FR-013); personal deck → 409 `invite_link_personal`; `role = 'owner'` → 400; cap with `INVITE_LINKS_WAITING_MAX=2` → third is 409 `invite_link_limit` (FR-004); list returns the same `url` again (FR-003); no `@` anywhere in the answers (FR-015)
- [ ] T013 [P] [US1] [unit] `shareItem({ url, title, text })` passes `text` to `navigator.share` and copies "text url" to the clipboard when there is no share sheet, in apps/web/src/lib/share.test.ts
- [ ] T014 [P] [US1] [unit] `invite-shared` is accepted by `sanitizePayload` with `deckId` and `channel` only, and is dropped without consent, in packages/shared/src/analytics/sanitize.test.ts and packages/shared/src/analytics/privacy.test.ts
- [ ] T015 [P] [US1] [unit] `InviteLinkForm` (name + role select without Owner, submits, shows the cap message) and `InviteLinks` (rows show name · role · state · expiry, Share calls `shareItem` with the prefilled text and tracks `invite-shared`, waiting rows only get Share) in apps/web/src/deck-admin/InviteLinkForm.test.tsx and apps/web/src/deck-admin/InviteLinks.test.tsx

### Implementation for User Story 1

- [ ] T016 [US1] Owner routes with OpenAPI definitions `POST /decks/{id}/invite-links`, `GET /decks/{id}/invite-links` in apps/api/src/routes/invite-links.ts (`authorize()` + `can('member.invite')`), mounted in apps/api/src/app.ts
- [ ] T017 [US1] `pnpm api:openapi` (regenerate packages/api-client)
- [ ] T018 [P] [US1] Add optional `text` to `shareItem` in apps/web/src/lib/share.ts; add the fifth content event `invite-shared` (`deckId`, `channel`: share-sheet | copy-link) in packages/shared/src/analytics/events.ts (+ `sanitize.ts`/`privacy.ts` allow-lists as needed)
- [ ] T019 [US1] Queries and mutations (`useInviteLinks`, `useCreateInviteLink`) in apps/web/src/deck-admin/deck-admin-queries.ts
- [ ] T020 [US1] `InviteLinkForm` copying `deck-admin/InviteForm.tsx` (name field + role select + submit in the same `.field-group` / action row; roles from `@gobbit/shared/authz` labels, owner excluded) in apps/web/src/deck-admin/InviteLinkForm.tsx — screenshots: phone 412 px + desktop 1280 px, light + dark, compared with InviteForm
- [ ] T021 [US1] `InviteLinks` list copying the pending rows of `MembersSection.tsx` (`MemberRow` layout: primary line reference name, secondary role · state · expiry or "accepted by" + avatar; Share is an `IconButton` with the `ui/ShareButton.tsx` toast behaviour, prefilled text "Join <deck> on Gobbit: <url>"), mounted for owners in apps/web/src/deck-admin/MembersSection.tsx, in apps/web/src/deck-admin/InviteLinks.tsx (+ CSS rules for every new class) — screenshots: phone 412 px + desktop 1280 px, light + dark, compared with MembersSection pending rows

**Checkpoint**: An owner can create and share a link. It does not yet lead anywhere.

---

## Phase 3: User Story 2 - The invited person opens the link and joins (Priority: P1)

**Goal**: Opening the link shows a safe preview and invite page; Join (signed in), or sign-in from the page (signed out), makes the person a member.

**Independent Test**: quickstart.md scenarios 2, 3, 4 and 6.

### Tests for User Story 2

- [ ] T022 [P] [US2] [int] Preview and Join in apps/api/test/invite-links.int.test.ts:
  - `GET /invites/preview` with a session cookie and without answers the same (credentials ignored); unknown token → 200 `{ state: 'invalid' }`; not shadowed by `/public/{slug}` (D470);
  - `GET /s/invite?t=` answers HTML with `no-store`, `no-referrer`, `noindex`, `og:image` `/og/private.png`, waiting title/description, generic otherwise; not shadowed by `/s/:itemId`; per-IP limit answers 429;
  - on a deck with a private category and card, neither answer contains the card title, category name, reference name or `@` (FR-006, SC-005);
  - `sessions`, `users`, `memberships` row counts unchanged after opening (FR-005, SC-004);
  - Join: 200 with the deck; two parallel accepts by different users → exactly one 200, one 409 `invite_link_used` (FR-008, SC-003); already a member → 409 `invite_link_already_member` and the link stays waiting (FR-010); a pending mailed invite is accepted with the link's role and its mailed links expire; 401 signed out;
  - captured request and error log lines contain no token (D468)
- [ ] T023 [P] [US2] [int] Sign-in through a link in apps/api/test/auth.int.test.ts (waitlist mode unless stated):
  - existing account + `invite` → plain sign-in mail with `next=/join?t=…`;
  - unknown address + waiting link → sign-in mail (not the waitlist) whose `magic_links.invite_link_id` is set; callback registers `deck_invite` with `registered_by` = creator, joins with the link's role, 303 to `/d/<slug>` (FR-011);
  - two unknown addresses through one link → only the first callback registers, the second gets `invite_gone` and no user (FR-011);
  - link revoked between mail and callback → 303 auth error `invite_gone`, no `users` row; in `open` mode → registers `open_sign_in` and 303 to `/join?t=…`;
  - unknown address + stopped link → today's waitlist behaviour
- [ ] T024 [P] [US2] [unit] `requestMagicLink` with `invite` (the three rows of contracts § `POST /auth/magic-link`, `auth.magic_link` event with `via = invite_link` and `linkId`, no token) in apps/api/src/services/auth.service.test.ts
- [ ] T025 [P] [US2] [unit] `/join` and `/s/invite?t=…` reduce to the patterns `/join` and `/s/invite` with no query string in packages/shared/src/analytics/sanitize.test.ts
- [ ] T026 [P] [US2] [unit] `JoinScreen` in apps/web/src/invites/JoinScreen.test.tsx: waiting + signed in → deck name, inviter, role, "Signed in as", Join calls accept and navigates to the deck; waiting + signed out → Join reveals `SignInForm` which posts `invite`; used/revoked/expired/invalid copy with no Join; already member → "You're already in" + deck link
- [ ] T027 [P] [US2] [e2e:smoke] Journey in e2e/tests/smoke/invite-link.spec.ts (`@smoke`): owner creates a link in Members; a fresh address opens `/s/invite?t=` signed out (preview HTML has the deck name), lands on `/join`, taps Join, signs in through the mailbox and lands on the deck; a second signed-in user opening the same link sees "already used" and no Join button

### Implementation for User Story 2

- [ ] T028 [US2] Anonymous and signed-in routes in apps/api/src/routes/invite-links.ts: `GET /invites/preview` (OpenAPI) and `POST /invite-links/accept` (OpenAPI, session, 409 codes per contracts); add `/invites/preview` to `LENIENT_PATHS` and the credential-free list in apps/api/src/middleware/session-auth.ts; `publicRateLimit(anonLimit)` on `/invites/preview` and `/s/invite` in apps/api/src/app.ts
- [ ] T029 [US2] `GET /s/invite` in apps/api/src/routes/share.ts, registered before `/s/:itemId`: `renderSharePage()` with the D469 headers and titles, `og:image` `PRIVATE_OG_IMAGE_PATH`, refresh to `/join?t=<token>`, analytics pattern `/s/invite`
- [ ] T030 [US2] `requestMagicLink(email, { invite })` in apps/api/src/services/auth.service.ts per contracts § `POST /auth/magic-link` (existing account → `next=/join?t=`; unknown + waiting → sign-in link with `invite_link_id`, in any registration mode; otherwise as today), and pass `invite` through in apps/api/src/routes/auth.ts; `invite_link_id` stored via apps/api/src/repositories/magic-links.repo.ts
- [ ] T031 [US2] Callback for a link carrying `invite_link_id` in apps/api/src/services/auth.service.ts: in one transaction lock the link, register (`users.register(email, 'deck_invite', { actorId: created_by })`) and `invite-links.repo.accept` with the already-member step skipped; stopped link → `invite_gone` (waitlist mode) or `open_sign_in` + `next=/join?t=` (open mode); add `invite_gone` to `CALLBACK_REASONS` and `via = invite_link` to the magic-link event in apps/api/src/services/auth.events.ts
- [ ] T032 [US2] `pnpm api:openapi` (regenerate packages/api-client)
- [ ] T033 [P] [US2] `invite_gone` copy with the waitlist form, copying the existing `closed` entry, in apps/web/src/lib/auth-error-copy.ts (+ its test)
- [ ] T034 [P] [US2] `invite` prop on `SignInForm` that posts it with the address in apps/web/src/ui/SignInForm.tsx (+ test in apps/web/src/ui/SignInForm.test.tsx)
- [ ] T035 [US2] `JoinScreen` copying `routes/auth.error.tsx` (centred status card; title deck name, one line inviter and role, primary Join via `ui/buttons`, "Signed in as …" in the secondary text style, `SignInForm` with `invite` when signed out; preview query not persisted) in apps/web/src/invites/JoinScreen.tsx and lazy route apps/web/src/routes/join.tsx (validates `t` search param); add screen pattern `/join` in packages/shared/src/analytics/screens.ts — screenshots: phone 412 px + desktop 1280 px, light + dark, compared with auth.error

**Checkpoint**: The full flow works: share → open → Join or sign in → member.

---

## Phase 4: User Story 3 - A link works once and the owner stays in control (Priority: P2)

**Goal**: Owners see each link's state, revoke waiting links, and links stop when revoked, expired, or the inviter is no longer an owner.

**Independent Test**: quickstart.md scenarios 5 and 7.

### Tests for User Story 3

- [ ] T036 [P] [US3] [int] Revoke and stopping in apps/api/test/invite-links.int.test.ts: owner revokes (204, `revoked_by` set); revoke of an accepted link → 409 `not_waiting`; editor → 403; another deck's link → 404 (FR-014); revoked, expired (`expires_at` in the past), creator demoted to editor, creator deleted, deck deleted → preview shows the matching state and accept answers the matching 409 (FR-009, D473); list shows accepted rows with `acceptedBy` shown name and avatar and no address, and drops links that ended more than `INVITE_TTL_DAYS` ago (FR-013, D476); a member who joined by link can have their role changed and be removed (FR-017)
- [ ] T037 [P] [US3] [unit] Revoke button on waiting rows only, confirm, and the list refresh in apps/web/src/deck-admin/InviteLinks.test.tsx

### Implementation for User Story 3

- [ ] T038 [US3] `DELETE /decks/{id}/invite-links/{linkId}` (OpenAPI, `member.invite`, 204/403/404/409 `not_waiting`) in apps/api/src/routes/invite-links.ts, then `pnpm api:openapi`
- [ ] T039 [US3] `useRevokeInviteLink` in apps/web/src/deck-admin/deck-admin-queries.ts and the Revoke `IconButton` with a confirm on waiting rows in apps/web/src/deck-admin/InviteLinks.tsx — screenshots: phone 412 px + desktop 1280 px, light + dark, compared with MembersSection pending rows

**Checkpoint**: All three stories work on their own.

---

## Phase 5: Close-out

**Purpose**: Keep the repository's docs and gates true

- [ ] T040 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm budget`
- [ ] T041 `@smoke` passes in CI's `e2e` job (`pnpm test:e2e --grep @smoke` locally)
- [ ] T042 [P] docs/design/auth.md: "Invite links" section (flows, events, Deviations list from implementation-notes.md)
- [ ] T043 [P] docs/adr.md: ADR-085 (D466–D468, D472); docs/architecture.md: one index row (stay < 250 lines)
- [ ] T044 [P] README.md env table, infra/docker-compose.yml `x-api-env` and CHANGELOG.md entry for `INVITE_LINKS_WAITING_MAX` (optional, not Action required)
- [ ] T045 [P] CLAUDE.md: Roles rule gains "link invites are owner-only, single use, never owner, token never in a path"; Analytics rule "four content events" → five (`invite-shared`)
- [ ] T046 PLAN.md: link 052 under Phase 16 item 7; community-go-list.md Tracking: tick H12 on merge, deviations in the progress log
- [ ] T047 Run quickstart.md validation
- [ ] T048 `/speckit-converge` until Converged, then `/ponytail:ponytail-review`

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: T001–T003 in order; T004–T008 in parallel after T003; T009 → T010 → T011. Blocks every story.
- **US1 (Phase 2)**: after Phase 1. T016 → T017 → T019 → T020/T021.
- **US2 (Phase 3)**: after Phase 1. Its e2e (T027) also needs US1's UI (T020, T021) to create a link. T028/T029 → T030 → T031 → T032 → T035.
- **US3 (Phase 4)**: after Phase 1; T039 needs T021.
- **Close-out**: after all stories.

### Within each story

- Tests first and failing, then repo → service → route → `api:openapi` → web.

## Parallel Examples

- Phase 1: T004, T005, T006, T007, T008 together after T003.
- US1: T012, T013, T014, T015 together; T018 alongside T016.
- US2: T022–T027 together; T033 and T034 alongside T030/T031.
- US3: T036 and T037 together.
- Close-out: T042–T045 together.

## Implementation Strategy

1. Phase 1, then US1 (owner can create and share): MVP of the owner side, demoable in settings.
2. US2: the link becomes useful end to end; the smoke journey goes green.
3. US3: revoke and the stopping rules visible to owners.
4. Close-out, converge, review, PR.

## Traceability check

Every row of plan.md § Invariant → test traceability maps to: FR-001 T012 · FR-002 T004/T006/T012 · FR-003 T012/T013/T015 · FR-004 T012 · FR-005/SC-004 T022 · FR-006/SC-005 T022 · D468 log T022, analytics T025 · D470 shadowing T022 · FR-007/FR-012 T026/T027 · FR-008/SC-003 T022 · FR-009 T036 · FR-010 T022 · FR-011 T023 · FR-013 T012/T036 · FR-014 T036 · FR-015 T012/T036 · FR-016/FR-017 existing suites + T036 · pending invite closed T022 · critical journey T027. Accountability rows: T011, T022, T023, T024, T014.

## Notes

- Log decisions the plan did not make, and deviations, in specs/052-invite-by-link/implementation-notes.md.
- The down migration name follows the repo (`down/NNNN_name.down.sql`), not data-model.md's shorter form.
- Commit per task or logical group (`feat(api): …`, `feat(web): …`).
