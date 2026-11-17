# Research: Member profile and card creator avatar (046)

Decisions continue the project-wide D series (D417–D429). Each lists the decision, its rationale and the
alternatives considered. No `NEEDS CLARIFICATION` remains; three plan choices wait for confirmation
(see plan, "Settle before starting").

## D417 — Profile columns on `users`

**Decision**: `username`, `first_name`, `last_name`, `location` and `avatar` (jsonb `{ publicId, width?, height? }`)
are nullable columns on `users`. No backfill: a null profile means "email-derived name, initials from the email".

**Rationale**: the profile is one-to-one with the member and read on every card list (joined once per page), so
a second table would add a join to every read for no gain. `users` already carries per-member settings
(`reminder_emails`, analytics consent). Unique-by-username needs a plain index on the same row.

**Alternatives**: a `member_profiles` table (extra join, two-row consistency); storing the profile in
`accounts` (an account can own several users, the profile belongs to the person).

## D418 — Username rules and the hold

**Decision**:

- DB: CHECK `username ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$'` (so no `@`, 3–30 characters), unique index on
  `lower(username)` (all rows, soft-deleted included, so a deleted member's name is not reissued silently).
- Code: `RESERVED_USERNAMES` in `@gobbit/shared/username` (admin, administrator, gobbit, support, help, root,
  system, staff, team, official, me, null, undefined, api, www, mail, noreply, and the like), compared
  case-insensitively. A list that changes belongs in code, not in a CHECK.
- Hold: releasing or changing a username inserts `username_holds(username_lower, released_by, hold_until)` in
  the same transaction (`hold_until = now + USERNAME_HOLD_DAYS`, default 30). The trigger
  `users_username_hold_guard` (before insert or update of `username`) refuses a username that has an unexpired
  hold by a different member. The releasing member may take it back.

**Rationale**: constitution III puts the invariants that can be expressed in SQL in SQL, so two concurrent
claims cannot both win and a held name cannot be sniped by a path that skips the service. Storing the
expiry at release time means changing the env var never rewrites old holds.

**Alternatives**: a service-only check (races, bypassable by a future route); a unique index that includes
released names forever (names never recycle); hold in memory or Redis (not durable, no Redis here).

## D419 — The display name is computed, never rewritten

**Decision**: the stored `users.display_name` keeps its email-derived value. A `displayNameSql` helper
(`coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), display_name)`) and a TypeScript
`displayNameOf(user)` are the only ways to build a name. Every repository that selects `users.displayName`
today (memberships, item events, review, shares, waitlist admin, `/me`) uses the helper.

**Rationale**: past activity entries and notices reference the member, so a name change applies
retroactively without a data migration (Story 5.2). Clearing the names reverts to exactly today's value
(FR-016). Rewriting the column would lose the fallback.

**Alternatives**: overwrite `display_name` on save (loses the fallback, needs a re-derive on clear); a
generated column (cannot express the fallback to the email, which lives in the same column).

## D420 — Initials and colour: one shared function, in-house palette

**Decision**: `@gobbit/shared/avatar` exports `initialsFor({ firstName, lastName, email })` and
`avatarColorIndex(userId)`.

- Names: the first grapheme of the first name and of the last name, upper-cased where the script has case
  (`Intl.Segmenter`, so an emoji or a combined character is never split; a name that begins with a symbol or
  digit is skipped to its first letter).
- No names: the email local part split on `.`, `-`, `_`; parts with no letter are skipped; first and last
  remaining part (one part gives one letter). Nothing usable gives `''`, and the UI shows the person glyph.
- Colour: a small stable hash (FNV-1a) of the member id picks one of ten palette entries. Each entry is a
  pair of tokens (`--avatar-N-bg`, `--avatar-N-fg`) in `styles.css` with light and dark values, chosen so
  the pair keeps a 4.5:1 contrast; a unit test computes every pair.
- The API sends `initials` (computed server-side, so the email never leaves it); the web computes the colour
  from the id with the same function. The profile preview, which knows the member's own email, calls
  `initialsFor` directly.

**Rationale**: constitution VII and IX favour what exists; no avatar library is installed, and the common
ones (boring-avatars, DiceBear) generate SVG with arbitrary colours that would fail the contrast rule, add
bundle weight to the 150 KB budget and give nothing a hashed palette doesn't. A 60-line function with a
test table gives identical results on every surface.

**Alternatives**: DiceBear initials style (dependency, colours uncontrolled); hashing the display name
(renaming would flip the colour, forbidden by Story 4.3); storing initials and colour on the user (derived
data that can go stale).

## D421 — The creator rides on the item DTO

**Decision**: `itemSchema` gains `creator: CardCreator | null`. `createItemDtoMapper` (the one place every
member read path passes: one item, list, favorites, category, search, review queue) collects distinct
`createdBy` ids, runs one query for their profiles through `member-summaries.ts`, and attaches the summary.

- Personal deck → `null`. The deck kind comes from the deck row the mapper already has.
- `createdBy` null or user not found → `{ id: null, name: null, username: null, initials: '', photo: null }`.
- Else `{ id, name, username, initials, photo }`. `name` is the profile name only (null when unset).

`createdBy` stays on the DTO as today. The public allow-list `toPublicItem` is untouched, and a test proves
public pages, public search and share previews contain no `creator`.

**Rationale**: one batched query per page, no N+1, no new route, and every list inherits the rule
(FR-004, FR-014: the creator is only attached to rows the visibility filters already returned). Offline
reads come for free from the persisted item cache (D429).

**Alternatives**: a separate members lookup in the web (members the reader cannot list, removed members and
communal readers break it; avatars would need a second request per page); a join in every repository query
(many call sites); a client cache of `userId → profile` (needs an endpoint that reveals profiles by id, which
the spec forbids).

## D422 — The label never uses the email-derived name

**Decision**: label = username, else profile name, else "Member". Accessible name = "Added by <name or
username, or Member>". The email-derived `display_name` is not part of `CardCreator`.

**Rationale**: the email-derived name is the local part of the address ("dana.levi"). It already shows in the
members list to people in the same deck, but an avatar appears in communal decks whose readers may not see
that list; spec FR-022 forbids leaking the email, and a local part is most of one. "Member" is a safe,
honest label and the two-letter initials still distinguish people visually.

**Scope (2026-11-17)**: D422 binds the card creator avatar (`CardCreator` on item DTOs). Rows that already print the display name beside the avatar (Story 5: event rows, the members list, share rows; members already see that name today) use it as the avatar's accessible name.

**Alternatives**: show the email-derived name (the spec's default; judged too revealing); show nothing
(the avatar would have no accessible name).

## D423 — Photo storage, upload and cleanup

**Decision**:

- `assets` gains `scope` (`'deck'` default | `'profile'`), `owner_user_id` (FK users, set null) and a nullable
  `deck_id`, with CHECK `(scope = 'deck') = (deck_id IS NOT NULL)`. Existing rows are `deck`.
- `POST /me/avatar/sign` and `POST /me/avatar/assets` reuse `media.service` signing and confirming with the
  folder `gobbit/profiles/<userId>`, tags `profile`, `user:<userId>`, the same type and size limits, and the
  same `mediaSignUser` / `mediaConfirmUser` rate keys.
- `PATCH /me/profile { avatar: { publicId } | null }`: the asset must be `scope = 'profile'`, owned by the
  caller and not rejected (the D160 rule for profiles); dimensions come from the asset.
- The sweep's `unreferenced` predicate adds `users.avatar->>'publicId'` (partial expression index) and its
  prefix scope covers `gobbit/profiles/`. A replaced or removed photo is freed after the normal 7-day grace.
- The browser crops: `AvatarCropper` (lazy) shows the image in a circle mask, pointer drag and a zoom
  range input, then draws the visible square to a 512 px canvas (JPEG 0.9) that goes through the normal upload.
  The camera is `capture="user"` on the `PickButton` input.

**Rationale**: constitution IX reuses the signed flow and the sweep. Cropping before upload means one stored
image serves every size and Cloudinary needs no per-viewer crop; the crop is in the member's own hands
(Story 3.2) without a dependency.

**Alternatives**: store crop parameters and let Cloudinary crop (derived images per size, and the crop
state must be kept); a crop library (bundle; the lazy chunk is small but a canvas is ~80 lines); reuse a deck
as the photo's home (a photo would vanish when that deck is deleted, violating the spec's assumption).

## D424 — Lookup

**Decision**: `POST /members/lookup { query }` (POST, so the typed text stays out of URLs and access logs).

- No `@`: exact, case-insensitive username match. Works for any signed-in member.
- With `@`: an exact email match, but the member is returned only if the caller shares a deck with them
  (an owner of the deck, or a fellow member). Otherwise the answer is the same miss.
- Response `{ member: MemberSummary | null }`. A summary has `{ id, name, username, initials, photo }`, no
  email. Rate limited per member (`PROFILE_LOOKUP_RATE_PER_HOUR`, default 30, shared with the availability
  check). The same 200 miss for "never existed", "released" and "stranger's email".

**Rationale**: spec Story 7 asks to find by username or email, but an unrestricted email preview would turn
the endpoint into a "who is registered" oracle (the sign-in and waitlist paths work hard to avoid that).
The invite itself keeps accepting any email as today, so nothing the spec needs is lost; only the preview
for strangers is withheld. The web's invite form therefore shows a preview for a username and for deck
mates' emails, and just sends the invite for any other email.

**Alternatives**: preview any email (an oracle); username only (the spec also asks for email lookups);
GET with a query string (the text lands in logs, against constitution VIII).

## D425 — Invite by username and the availability check

**Decision**: `inviteCreateSchema` accepts exactly one of `email` or `username`. The service resolves a
username to the member's email internally (the mail goes to that address; the inviter never sees it) and
answers an unknown username with the lookup miss as a 404 problem with the same body whatever the reason.

`POST /me/username/check { username }` answers `{ available: boolean, reason?: 'invalid' | 'reserved' |
'unavailable' }`; a taken name and a held name both answer `unavailable`, and the answer never says who
holds it. The save repeats the check inside the transaction; the check is advisory.

**Rationale**: Story 7.2 and 7.6: the member gets early feedback without a leak, and the save is the
authority (the unique index and trigger decide races).

## D426 — Audit and decision events

**Decision**: `profile_events(id, user_id, changes text[], created_at)` is written in the transaction of
every profile change (field names only, as for `item_events`; never values). Decision events
(`profile.username`, `profile.username_check`, `profile.lookup`, `profile.username_hold`) use the existing
`DecisionLogger` over `childLogger('profile')` in a new `profile.events.ts`, with keyed hashes
(`DEV_LOG_HASH_KEY` family) of the typed text and never the text itself.

**Rationale**: constitution VIII; the same two forms as media and items.

## D427 — Location can't leak by construction

**Decision**: `location` is on the `profile` schema returned by `GET /me` and `PATCH /me/profile` only. No
summary, member, creator, lookup, event, public or share schema has the field, and the summary builder
selects columns explicitly. An integration test scans every other-member response.

**Rationale**: FR-012. Schema absence is stronger than a runtime filter.

## D428 — Avatar UI

**Decision**: `ui/Avatar` renders a fixed 24 px (list) or 40 px (profile, members) circle: a `CloudImage`
photo, else initials on the palette colour, else a person glyph from `ui/icons`. It is a `span` with
`role="img"` and `tabindex="0"`, never an anchor or button. The label reuses the `data-tip` tooltip of
`ui/tooltip-press`, extended with a tap-toggle mode (a second tap, an outside tap or Escape closes it);
hover and focus already open it. The footer slot is a fixed box in `.card__meta`, so the card never moves
as a photo loads. The primitive gets an entry in `docs/design/ui-system.md` (constitution X).

**Rationale**: constitution X forbids inventing a popover; `tooltip-press` is the app's tooltip. A focusable
non-interactive `role="img"` satisfies "keyboard reachable" without making a control.

**Alternatives**: a new popover component (a second tooltip system); a `button` that opens a label (the spec
says it is not a button).

## D429 — Offline and account removal

**Decision**: the creator summary is part of the persisted item cache like the rest of the DTO, so seen
avatars render offline and unseen ones show initials. The profile itself comes from `GET /me`, persisted
like other `me` data; lookups are not persisted. The app has no account-deletion flow today, so nothing is
built for it: the FKs make a future deletion safe (`items.created_by` and `assets.owner_user_id` set null),
which shows the placeholder avatar on its cards and turns the photo into an orphan the sweep deletes.

**Rationale**: the spec's "removed with the account" is satisfied by the data model without inventing an
unspecified flow; the integration test removes a user row and checks both results.

## Other findings

- **Bundle**: `Avatar`, `CreatorAvatar` and the shared avatar module stay in the main chunk (small);
  `ProfilePage`, `AvatarCropper` and the lookup preview load with their route. `pnpm budget` runs in the
  first UI task and again at the end; a task fails if the budget is exceeded.
- **Public pages and previews**: unchanged by construction; asserted by tests (D421).
- **Reminder and event notices** carry no member name today, so nothing changes there. Story 5's "notices" are
  the web strings that look up a member by id (`use-member-name`), which switch to the computed name
  through the members list DTO.
- **Imports and ingestion**: `createdBy` is already the sharer or importer, so the avatar shows them with no
  code change; the agent never appears.
