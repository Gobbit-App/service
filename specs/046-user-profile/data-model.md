# Data Model: Member profile and card creator avatar (046)

Migration `0027_member_profile` (additive, reversible, no backfill). snake_case columns, camelCase in
TypeScript, timestamps `timestamptz(3)`.

## `users` (extended)

| Column | Type | Rules |
|--------|------|-------|
| `username` | text NULL | CHECK `users_username_format_chk`: `^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$`; unique index `users_username_lower_uq` on `lower(username)` (all rows); trigger `users_username_hold_guard` |
| `first_name` | text NULL | CHECK `char_length ≤ 60` and `= btrim(...)`; blank stored as NULL |
| `last_name` | text NULL | same, ≤ 60 |
| `location` | text NULL | same, ≤ 100; owner-only (D427) |
| `avatar` | jsonb NULL | `{ publicId, width?, height? }`; CHECK shape; partial index `users_avatar_public_id_idx` on `(avatar->>'publicId') WHERE avatar IS NOT NULL` |

`display_name` is unchanged and remains the fallback (D419).

## `username_holds` (new)

| Column | Type | Rules |
|--------|------|-------|
| `username_lower` | text PK | lower-cased released name |
| `released_by` | uuid NOT NULL → `users.id` ON DELETE CASCADE | the member who may take it back |
| `hold_until` | timestamptz NOT NULL | set from `USERNAME_HOLD_DAYS` at release |
| `created_at` | timestamptz NOT NULL | auto |

Trigger `users_username_hold_guard` (BEFORE INSERT OR UPDATE OF `username` ON `users`): when `NEW.username`
is set and a row exists with `username_lower = lower(NEW.username)`, `hold_until > now()` and
`released_by <> NEW.id`, raise an error that `mapPgError` turns into the `held` refusal. Expired rows are
deleted by the existing weekly prune job (extended with one statement).

## `profile_events` (new, append-only)

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid NULL → `users.id` ON DELETE SET NULL | the member (self is always the actor) |
| `changes` | text[] NOT NULL | field names from `profileEventFields` (`username`, `firstName`, `lastName`, `location`, `avatar`); never values |
| `request_id` | text NULL | |
| `created_at` | timestamptz NOT NULL | auto |

## `assets` (extended)

| Column | Change |
|--------|--------|
| `scope` | NEW text NOT NULL DEFAULT `'deck'`, CHECK in (`deck`, `profile`) |
| `owner_user_id` | NEW uuid NULL → `users.id` ON DELETE SET NULL |
| `deck_id` | NOW NULLable |
| CHECK `assets_scope_chk` | `(scope = 'deck') = (deck_id IS NOT NULL)`. A profile asset must have an owner at insert; the service enforces that, because the owner can legitimately become null later (member removed) |

Existing rows are `deck`. The partial index `assets_owner_idx` serves the sweep.

## Derived shapes (not stored)

- **CardCreator** (on item DTOs): `{ id: uuid | null, name: string | null, username: string | null,
  initials: string, photo: { publicId, width?, height? } | null }`. `null` for the whole field in personal
  decks.
- **MemberSummary** (lookup result, members list, review `sharedBy`): the same fields as `CardCreator`
  with a non-null `id`, plus `displayName` (computed, D419) where the surface shows names today. No email,
  no location.
- **Profile** (`GET /me`, `PATCH /me/profile`): `{ username, firstName, lastName, location, avatar,
  initials }` for the member themselves; `email` and `displayName` stay on `/me`.

## State transitions

- **Username**: none → claimed → changed (old name enters hold) → cleared (name enters hold). A hold
  expires by time; the releasing member may reclaim before then.
- **Avatar**: none → set → replaced (old asset unreferenced, swept after the grace) → removed.
