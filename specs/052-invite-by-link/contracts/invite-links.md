# Contract: Invite links

The JSON routes are in OpenAPI and reached from the web at `/api/…` (Caddy strips the prefix). `/s/invite` is HTML, outside OpenAPI, and is proxied as is. Errors are `application/problem+json`. Schemas are in `data-model.md` § DTOs.

The token never appears in a path (D468).

## Owners (session, `member.invite`)

### `POST /decks/{id}/invite-links`

Request: `inviteLinkCreateSchema` `{ name, role }`.

| Status | When |
|--------|------|
| 201 `inviteLinkSchema` | created; `state = 'waiting'`, `url = <public origin>/s/invite?t=<token>` (the origin `share.service` already uses) |
| 400 | invalid body, or `role = 'owner'` (schema refuses it; the DB CHECK is the backstop) |
| 403 | caller is not an owner (`member.invite`) |
| 404 | deck not visible to caller |
| 409 `invite_link_personal` | deck is personal |
| 409 `invite_link_limit` | `INVITE_LINKS_WAITING_MAX` waiting links already exist; the detail says to revoke one or wait (FR-004) |

### `GET /decks/{id}/invite-links`

200 `inviteLinkListSchema`. Lists the waiting links plus links that ended in the last `INVITE_TTL_DAYS` days, newest first (D476). 403 for non-owners. No addresses are returned.

### `DELETE /decks/{id}/invite-links/{linkId}`

| Status | When |
|--------|------|
| 204 | revoked (`revoked_at`, `revoked_by` = caller) |
| 403 | not an owner |
| 404 | no such link on this deck |
| 409 `not_waiting` | already accepted, revoked or expired |

## Anyone

### `GET /invites/preview?t=<token>`

200 `invitePreviewSchema`. Credentials are ignored (`LENIENT_PATHS` and the credential-free list, as for `/public/*`, ADR-056), and the per-IP `anonLimit` applies (429 problem). It is not under `/public/` because `/public/{slug}` would match it. An unknown token answers 200 with `{ state: 'invalid' }`, never 404, so every miss looks alike (D470).

### `GET /s/invite?t=<token>` (HTML, D469)

Open Graph page from `renderSharePage()`:

- headers `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`;
- `og:image` is `/og/private.png`;
- it refreshes to `/join?t=<token>`.

What the page shows:

| State | `og:title` | `og:description` |
|-------|------------|------------------|
| waiting | `Join <deck name> on Gobbit` | `<inviter shown name> invited you as <role label>` |
| anything else, or no `t` | `A Gobbit invite` | `Open it in Gobbit` |

When the per-IP limit is hit it answers the HTML 429 page. The page never shows cards, categories, members, counts, the reference name or an address (FR-006).

## Signed-in person (session)

### `POST /invite-links/accept`

Request: `inviteAcceptSchema` `{ token }`. The transaction is in `data-model.md` § Accept transaction.

| Status | When |
|--------|------|
| 200 `{ deck: { id, slug, name } }` | joined with the link's role |
| 401 | not signed in |
| 409 `invite_link_used` / `invite_link_revoked` / `invite_link_expired` / `invite_link_invalid` | link not waiting or no longer valid |
| 409 `invite_link_already_member` | caller already has a role on the deck; the link stays waiting (FR-010) |

## Sign-in (changed)

### `POST /auth/magic-link`

The body gains an optional `invite` (`magicLinkRequestSchema`). The answer is unchanged, `200 { ok: true }` for every well-formed request (D472):

| Address | Invite | Mail |
|---------|--------|------|
| has an account | any | sign-in link, `next = /join?t=<token>` |
| unknown | waiting | sign-in link carrying `invite_link_id`, in any registration mode |
| unknown | stopped or absent | as today: waitlist (`waitlist` mode) or sign-in link (`open` mode) |

### `GET /auth/callback?token=`

For a link carrying `invite_link_id` whose address still has no account:

| Invite at callback | `waitlist` mode | `open` mode |
|--------------------|-----------------|-------------|
| waiting | register `deck_invite` (by the creator) and join → 303 to `/d/<slug>` | same |
| stopped | 303 to the auth error screen, reason `invite_gone`; no user created | register `open_sign_in` → 303 to `/join?t=<token>` (shows why) |

New `CALLBACK_REASONS` value: `invite_gone`.

## Web

- **`/join?t=<token>`** (SPA). It reads `GET /invites/preview` and shows:
  - a waiting link: deck name, inviter, role and a **Join** button. Signed out, the button reveals the sign-in email form, which posts `invite`. Signed in, the page also shows "Signed in as <shown name>".
  - any other state: why (used, revoked, expired, no longer valid).
  - a signed-in member of the deck: "You're already in" and a link to the deck.

  Analytics screen pattern: `/join`.
- **Members settings** (`/d/$slug/settings`, owners): a "Invite by link" form (name and role), the list of link invites with state, and Share/Revoke on waiting rows.
- **Auth error screen**: a new `invite_gone` message, with the waitlist form.
