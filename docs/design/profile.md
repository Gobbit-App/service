# Member profile and card creator (046)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md#adr-080-member-profile-and-creator-avatar-d417-d418-d420-d421-d423-d424). Spec: `specs/046-user-profile/` (D417–D429)._

A member can set a username, first and last name, a location and a round photo. Cards in shared and communal decks show who added them as a small avatar; members find each other by username to invite them.

## Columns and tables (migration `0027_member_profile`, D417)

All additive and reversible, no backfill (a null profile means "email-derived name, initials from the email"). See [data-model.md](data-model.md#member-profile-0027_member_profile-d417-d418-d423).

| Where | What |
| --- | --- |
| `users.username` | CHECK `users_username_format_chk` (`^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$`), unique index on `lower(username)` over all rows (soft-deleted too) |
| `users.first_name`, `last_name`, `location` | Trimmed, blank stored as NULL, 60 / 60 / 100 characters |
| `users.avatar` | jsonb `{ publicId, width?, height? }`, shape CHECK, partial index on `avatar->>'publicId'` |
| `username_holds` | `username_lower` PK, `released_by` FK (cascade), `hold_until`; guarded by trigger `users_username_hold_guard` |
| `profile_events` | Append-only audit: `user_id` (set null), `changes text[]` of field names (never values), `request_id` |
| `assets.scope`, `assets.owner_user_id` | `deck` (default) or `profile`; `deck_id` is nullable; CHECKs `assets_scope_values_chk` and `assets_scope_chk` |

## Username (D418)

- **Format**: 3–30 characters, letters, digits, `.`, `_`, `-`, starting with a letter or digit; no `@`. Case is kept, matching and uniqueness ignore case.
- **Reserved**: `RESERVED_USERNAMES` in `@gobbit/shared/username` (`admin`, `gobbit`, `support`, `root`, `me`, …), compared case-insensitively. It lives in code because it changes; the answer is `reserved`.
- **Hold**: releasing or changing a username inserts a `username_holds` row in the same transaction with `hold_until = now + USERNAME_HOLD_DAYS` (default 30, stored at release so changing the env var never rewrites old holds). The weekly `prune-deleted-items` job also deletes expired rows (`profileRepo.pruneExpiredHolds`) and logs `profile.holds_pruned {count}`; the guard ignores them either way. The trigger refuses an unexpired hold taken by anyone but the releasing member, who may take the name back. A race between two claimants is decided by the unique index and the trigger inside the claiming transaction.
- **Uniform refusal (D425)**: a name that is taken and one that is held both answer a 422 on `username` with reason `unavailable`; only the decision event records which one it was.
- **Availability check**: `POST /me/username/check` is advisory (shares the lookup rate limit); the save repeats the checks and decides.

## Display name (D419, D459)

`displayNameSql` (profile name, else username, else `MEMBER_NAME` = "Member") is the only way to build a name in SQL, and repositories never select `users.displayName` directly (`repositories/no-direct-display-name.test.ts`). `displayNameOf(user)` is unchanged: its callers pass rows whose `displayName` is already `displayNameSql()`. The "Member" floor applies only when the user row exists (`WHEN users.id IS NOT NULL`), so a left join to a deleted user stays null (activity log "Former member", admin waitlist inviter). A rename applies to past activity and notices at once. Clearing the names brings back the username, else "Member" (this supersedes D419's "reverts to the old value"). `users.display_name` is still written at registration (email local part) but never read: dropping the column is an open follow-up.

## Member addresses (D461-D464)

- **Per-viewer rule (D461)**: a member answer carries an address only on a pending row with `memberships.invited_by_email = true` whose `invited_by` is the viewer. Everyone else, the viewer's own row included, gets `email: null`. The flag is set by `create` and rewritten by `reinvite` (typed address true, username false); invites pending before the migration default to false and show no address until re-invited. The invite answer keeps the typed address for `{email}` and is null for `{username}`; role change is always null.
- **Anonymous pending typed row (D462)**: such a row shows `"Member"`, no username, initials `''` and no photo to every viewer, inviter included, so typing an address never hands over its owner's profile. Residual: the row still carries `userId` (needed to cancel), which can confirm a guess against a profile the inviter already has. Closing it needs an opaque per-row id.
- **Invited by (D463)**: `Member.invitedBy` is the inviter's shown name, on pending rows only and only for viewers with `member.invite`; looked up in the list already loaded, `"Member"` when the inviter left or the account is gone.
- **Mail floor (D464)**: `inviteEmail` says "A Gobbit member invited you" when the inviter's name is `MEMBER_NAME`.

## Creator summary (D421, D422)

- `itemSchema.creator: CardCreator | null` = `{ id | null, name | null, username | null, initials, photo | null }`. `createItemDtoMapper` (`services/item-dtos.ts`, the one mapper behind item, list, favorites, category, search and review reads) collects the distinct `createdBy` ids, runs one query through `member-summaries.ts`, and attaches the summary. No N+1.
- A **personal deck** gets `creator = null` (the deck kind comes from the deck row the mapper has). A removed creator, or a null `createdBy`, gets the placeholder `{ id: null, name: null, username: null, initials: '', photo: null }`.
- **Label (D422)**: username, else profile name, else "Member"; the accessible name is "Added by …". No name is derived from the address (D459). Summaries carry no email and no location. **Scope**: this rule binds the card creator avatar (`CardCreator`). Rows that already print the display name beside the avatar (event rows, members list, share rows; members see that name today) use it as the avatar's accessible name.
- **Initials and colour (D420, D460)**: `initialsFor({ firstName, lastName, fallback })` and `avatarColorIndex` in `@gobbit/shared/avatar`. First grapheme of first and last name (`Intl.Segmenter`); with no names, `fallback` split on `.`, `-`, `_`. Member summaries pass the username, so initials never come from another member's address; the own views (`/me` profile, `BottomBar`, `ProfileForm` preview) pass the member's own email. The literal "Member" is never passed, so a floor name gets `''` (neutral glyph). A name with no letter falls back to `fallback`; a combining mark stays with its letter; no honorific stripping. Colour is an FNV-1a hash of the member id into ten palette pairs (`--avatar-N-bg/fg`, light and dark, 4.5:1 checked by a unit test), so a rename never changes it.
- **Never public**: `toPublicItem` is untouched; public pages, public search and share previews have no `creator` (asserted by tests).
- **UI**: `ui/Avatar` (see [ui-system.md](ui-system.md)), a `role="img"`, focusable non-button; the label uses the `data-tip` tooltip with a tap-toggle mode.

## Lookup (D424, D425)

`POST /members/lookup { query }` (POST so the text stays out of URLs and logs):

- No `@`: exact, case-insensitive username match, for any signed-in member.
- With `@`: exact email match, answered **only for members who share a deck with the caller**; for anyone else the answer is the same miss. An email preview for strangers would reveal who is registered. The invite itself still accepts any email.
- Answer `{ member: MemberSummary | null }`: 200 for hit and miss alike, never says why, never contains an email. Rate limited per member by `PROFILE_LOOKUP_RATE_PER_HOUR` (default 30), shared with the availability check.

**Invite by username**: `POST /decks/{id}/invites` takes `{ role, email }` or `{ role, username }`. The service resolves the username to the address internally; an unknown username answers the same 404 as any miss.

**Email masking**: a username invite answers `membership.email = null`. In `GET /decks/{id}/members` and the role-change response, `email` is `null` for any member who has a username, except to that member; members without a username keep today's behaviour. The members list shows `@username` when the email is null.

## Photo (D423)

- **Signed flow**: `POST /me/avatar/sign` and `POST /me/avatar/assets` reuse the media service's signing and confirm (same limits and rate keys, no deck). Folder `gobbit/profiles/<userId>`, tags `profile`, `user:<userId>`; the asset is recorded with `scope = 'profile'` and `owner_user_id`.
- **Reference**: `PATCH /me/profile { avatar: { publicId } | null }` accepts only a profile asset owned by the caller and not rejected (the D160 rule for profiles); dimensions come from the asset. Anything else is a 422 `avatar.publicId`.
- **Crop**: `AvatarCropper` (lazy chunk) shows the image under a circle mask with drag and a zoom range input, draws the visible square to a 512 px canvas (JPEG 0.9) and uploads that; the camera is `capture="user"`. A photo that can't be decoded keeps the previous one.
- **Sweep**: the `media-sweep` unreferenced predicate also counts `users.avatar->>'publicId'`, so a replaced or removed photo is deleted after the normal 7-day grace. See [card-media.md](card-media.md).

## Location (D427)

Owner-only by construction: `location` exists only in the `profile` schema of `GET /me` and `PATCH /me/profile`. No summary, member, creator, lookup, event, public or share schema has the field, and the summary builder selects columns explicitly. An integration test scans every other-member response.

## Offline (D429)

The creator summary is part of the persisted item cache, so seen avatars render offline and unseen ones show initials. The profile comes from `GET /me`; lookups are not persisted. There is no account-deletion flow; the FKs (`items.created_by`, `assets.owner_user_id` set null) make one safe: cards show the placeholder avatar and the photo becomes an orphan the sweep deletes.

## Welcome (053, D478–D489)

A member who accepts an invite (address, username or link) sees a one-time welcome on the deck: its name, who invited them (`memberships.invited_by`; a link accepted over a pending invite names the link's creator, D482) and what they can do (`ROLE_WELCOME`, D488), with Categories, Search and Start reading.

- **State**: `memberships.welcome_dismissed_at`, backfilled from `accepted_at` (migration 0031). `GET /decks/{id}` carries `welcome` (membership id and an email-free inviter) only for an accepted, active, non-creator member off the owning account and personal deck; `DELETE /decks/{id}/welcome` is idempotent and logs `deck.welcome_dismiss` with outcome `dismissed`, `already_dismissed` or `no_membership`.
- **Order**: the consent wall first (offline too), then the welcome, then "How to browse", which waits for any Browse layer to close (D483, D485).
- **Offline**: dismissal hides the sheet at once and keeps the membership id in `gobbit:welcome-dismissed:v1` until the DELETE lands (D481).
- **Entry points**: Categories makes two history pushes (Browse, then its category layer) so Back closes only the list; Search opens the header's search sheet (D484).
- **Sheet rule**: phones swipe the handle down to close, dialogs get the corner button when `closeLabel` is set; one dialog width, borderless list rows (D487, D489; `ui-system.md`).

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `USERNAME_HOLD_DAYS` | `30` | Days a released username stays reserved for its previous owner |
| `PROFILE_LOOKUP_RATE_PER_HOUR` | `30` | Lookups, availability checks and username invites per member per hour |
| `PROFILE_UPDATE_RATE_PER_HOUR` | `30` | Profile saves (`PATCH /me/profile`) per member per hour |

## Decision events and audit (D426)

Audit: `profile_events` (field names only). Decision events (`profile.events.ts`, keyed hashes of typed text, never the text):

| Event | Outcomes · reasons |
| --- | --- |
| `profile.username` | `claimed`, `changed`, `cleared`; `refused` · `invalid`, `reserved`, `taken`, `held` |
| `profile.username_hold` | `held` |
| `profile.username_check` | `available`, `unavailable` · `invalid`, `reserved`, `unavailable`; `refused` · `rate_limited` |
| `profile.lookup` | `found`, `not_found`, `refused` · `rate_limited`; kind `username` or `email` |
| `profile.update` | `refused` · `rate_limited` |
| `profile.avatar` | `refused` · `unknown`, `foreign`, `rejected` |

`profile.username:refused:reserved` and `profile.avatar:refused:foreign` log at `warn`.

## Runbook thresholds

Investigate when, per hour:

- `profile.username` `refused:reserved` is above 10 (impersonation attempts);
- `profile.username` `refused:taken` plus `refused:held` is above 50 from one member (sniping);
- `profile.username_check` `refused:rate_limited` is above 20;
- `profile.lookup` `refused:rate_limited` is above 20, or `found` is above 200 for one member (enumeration);
- `profile.update` `refused:rate_limited` is above 20 for one member (`PROFILE_UPDATE_RATE_PER_HOUR`);
- `profile.avatar` `refused:foreign` is above 5 (probing another member's photo);
- `deck.welcome_dismiss` `already_dismissed` exceeds 3× `dismissed` per day (a retry loop in the web's pending set).

## Deviations

- **Hold trigger error**: the trigger raises `P0001` with the message `username_held` (like `item_needs_category`), not `check_violation` plus a HINT. `mapPgError` returns one identical 422 for a unique clash and a held name; the decision event reads the real reason from `usernameConflictReason(err)`.
- **Asset scope CHECKs**: two constraints (`assets_scope_values_chk`, `assets_scope_chk`) instead of an enum constant.
- **`assets.repo.upsert`** updates on conflict only for the given deck, never for a profile asset (it has no deck).
- **`displayNameOf` lives in `@gobbit/shared` schemas/profile**, so importing it as a value loads zod; the main web chunk uses the summaries' ready-made `name`.
- **No invite decision event**: the plan said invite events gain `via: 'username'`, but the codebase records no invite decision event or audit row today (`usersService.register` logs only the registration). Only the unknown-username miss is recorded (`profile.lookup` `not_found`). The gap predates this feature and is left to the accountability retrofit in `PLAN.md`.
- **Email masking added** (spec Story 5.3 / 7.6, FR-010, FR-022): invite-by-username would turn a username into an address, and the members list already returned every `email`. So `email` is nullable in `membershipSchema` and `memberSchema` (rules above).
- **`.card__meta` no longer wraps** (`flex-wrap: nowrap`): chips shrink first and the age label and avatar stay fixed, on every card, not only shared decks.
- **E2E**: cross-member and photo cases run in e2e through per-test users (047); the removed-creator placeholder is covered only by the integration test. See [testing.md](testing.md#deviations).
- **051 member email privacy**: `displayNameOf` has no code change (T018, D459 said two builders; only the SQL one changes). The item `creator` name stays `null` for a nameless, usernameless member (the avatar label shows "Member"). `displayNameSql` interpolates `MEMBER_NAME` as a bound parameter (`@gobbit/db` already depends on `@gobbit/shared`). `MembersSection.tsx` needed no change (`member.email ?? @username`). Open follow-up: drop `users.display_name`.
- **053 welcome**: the two category-list history pushes must be awaited one after the other (found by e2e: unawaited, they collapse into one entry and Back leaves Browse). `decks.service` types its membership read locally (`WelcomeMemberships`) instead of widening `MembershipLookup`. The `Sheet` change (D487, D489) also gives every existing sheet the handle and swipe, and the shared dialog is 32rem instead of 28rem.
