# Data model: Invite by link

Migration `0030_deck_invite_links` (and a hand-written `down/0030_deck_invite_links.down.sql`). There is no backfill.

## New table `deck_invite_links` (D466, D467)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `defaultRandom()` |
| `deck_id` | uuid NOT NULL → `decks.id` ON DELETE CASCADE | |
| `token` | text NOT NULL, UNIQUE | `generateToken()`, stored as is (D467); never logged |
| `name` | text NOT NULL | the owner's reference name; `CHECK (char_length(name) BETWEEN 1 AND 60)`; owners only |
| `role` | `member_role` NOT NULL | `CHECK (role <> 'owner')` (FR-002) |
| `created_by` | uuid NULL → `users.id` ON DELETE SET NULL | the inviter, as `memberships.invited_by`; a null creator reads as `invalid` (D473) |
| `expires_at` | timestamptz(3) NOT NULL | `now + INVITE_TTL_DAYS` at creation |
| `accepted_at` | timestamptz(3) NULL | |
| `accepted_by` | uuid NULL → `users.id` ON DELETE SET NULL | the person who joined |
| `membership_id` | uuid NULL → `memberships.id` ON DELETE SET NULL | the membership the join created or accepted |
| `revoked_at` | timestamptz(3) NULL | |
| `revoked_by` | uuid NULL → `users.id` ON DELETE SET NULL | |
| `created_at`, `updated_at` | timestamptz(3) NOT NULL | auto timestamps, as on every table |

**Constraints**:
- `CHECK (num_nonnulls(accepted_at, revoked_at) <= 1)`
- `CHECK (accepted_at IS NOT NULL OR (accepted_by IS NULL AND membership_id IS NULL))`. The acceptor columns are set only together with `accepted_at`. They may later turn null when the user or membership is deleted.

**Indexes**:
- unique `token`;
- `(deck_id, created_at DESC)` for the owners' list and the waiting count.

**`created_by` follows `memberships.invited_by`** (`SET NULL`). A link whose creator is gone stops working; an accepted one keeps its membership.

### State (derived, D466)

```
waiting ──accept──▶ accepted
   │  └──revoke──▶ revoked
   └──time──────▶ expired         (expires_at <= now, nothing written; D474)
waiting + (creator not owner | deck deleted/personal) ⇒ reads as invalid (D473, nothing written)
```

Only `waiting` links can be accepted or revoked. The waiting count for the cap (D475) is `accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`.

## Changed table `magic_links` (D472)

| Column | Type | Notes |
|--------|------|-------|
| `invite_link_id` | uuid NULL → `deck_invite_links.id` ON DELETE SET NULL | set only on a `sign_in` link sent to an address with no account through a waiting invite |

`CHECK (invite_link_id IS NULL OR purpose = 'sign_in')`

No enum changes: `magic_link_purpose`, `member_role` and `registration_reason` (`deck_invite` already exists) stay as they are.

## Accept transaction (D471, D472)

Both callers use one repository method in one transaction: Join (`POST /invite-links/accept`) and the sign-in callback for a brand-new person.

1. `SELECT … FROM deck_invite_links WHERE token = $1 FOR UPDATE` (Join) or `WHERE id = $1 FOR UPDATE` (callback). Missing → `invalid`.
2. `accepted_at` set → `used`. `revoked_at` set → `revoked`. `expires_at <= now` → `expired`.
3. Deck `deleted_at` set, or deck kind `personal`, or `created_by` null, or `resolveRole(created_by, deck)` ≠ `owner` → `invalid`.
4. Caller's `resolveRole` on the deck is not null → `already_member`. `resolveRole` counts only accepted, live memberships and account ownership, so a pending invite does not trip this step. The link is untouched. This step is skipped on the callback path, where the person was just registered.
5. Caller has a pending membership (`accepted_at IS NULL`, live) → set `role = link.role` and `accepted_at = now`, and call `magicLinks.expireUnusedForMembership(id)`. Otherwise insert an accepted membership (`invited_by = created_by`, `accepted_at = now`).
6. `UPDATE deck_invite_links SET accepted_at, accepted_by, membership_id`.

On the callback path, `users.register(email, 'deck_invite', { actorId: created_by })` runs between steps 3 and 5, in the same transaction. If any step refuses, nothing is registered (FR-011).

## DTOs (`@gobbit/shared/schemas/invite-links.ts`)

- `inviteLinkCreateSchema`: `{ name: string 1–60 trimmed, role: 'maintainer' | 'editor' | 'reader' }`. It is strict. The allowed roles are `memberRoles` without `owner`.
- `inviteLinkSchema` (owners' list row):

  ```
  { id, name, role, state: 'waiting'|'accepted'|'revoked'|'expired',
    createdBy: MemberSummary|null, acceptedBy: MemberSummary|null,
    createdAt, expiresAt, url: string|null }
  ```

  `url` is present only while waiting. A `MemberSummary` has no email or location (051).
- `inviteLinkListSchema`: `{ links: InviteLink[] }`
- `invitePreviewSchema` (anonymous):

  ```
  { state: 'waiting'|'used'|'revoked'|'expired'|'invalid',
    deckName?, inviterName?, role? }
  ```

  The three optional fields are present only when the state is `waiting`.
- `inviteAcceptSchema`: `{ token: string 1–256 }`. Its answer is `{ deck: { id, slug, name } }`.
- `magicLinkRequestSchema` gains `invite?: string 1–256`.

## Limits (`@gobbit/shared` limits, env-tunable)

| Name | Default | Env |
|------|---------|-----|
| `INVITE_LINKS_WAITING_MAX_DEFAULT` | 10 | `INVITE_LINKS_WAITING_MAX` |
| `INVITE_LINK_NAME_MAX` | 60 | (not tunable; DB CHECK) |
