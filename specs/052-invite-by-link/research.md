# Research: Invite by link

Decisions D466–D477 (reserved in `specs/README.md`). The durable ones become ADR-085.

## D466 — One table, state derived, owner role refused by the database

- **Decision**: a new table `deck_invite_links` holds one row per link (fields in `data-model.md`). Its state is derived, never stored:
  - **accepted** when `accepted_at` is set;
  - **revoked** when `revoked_at` is set;
  - **expired** when `expires_at <= now()`;
  - **waiting** otherwise.
  A `CHECK (role <> 'owner')` enforces FR-002. A `CHECK (num_nonnulls(accepted_at, revoked_at) <= 1)` keeps the two end states apart. `expires_at` is set at creation from `INVITE_TTL_DAYS`, the same period as mailed invites.
- **Rationale**:
  - A link has no person behind it until someone joins. `memberships.user_id` is NOT NULL, and the unique active (deck, user) row is what keeps one membership per person. Bending `memberships` to hold person-less rows would weaken both.
  - A derived state cannot drift from the timestamps. This is the same approach as `magic_links` (`used_at`, `expires_at`).
- **Alternatives considered**:
  - A `status` enum column. It would need a sweep to flip it to `expired`, and it could disagree with the timestamps.
  - A third `magic_links` purpose. A magic link is bound to an address and signs that person in; a link invite is bound to no one and signs no one in. Sharing the table would invite exactly the mix-up the spec warns about.

## D467 — The token is stored as is (a recorded departure from hash-only tokens)

- **Decision**: the token is `generateToken()` (32 random bytes, base64url) and is stored as is in `deck_invite_links.token`, with a unique index. It is not hashed.
- **Rationale**:
  - FR-003 asks that an owner can share the same waiting link again later. Only a stored token can be shown again.
  - The token grants little. It is single use and never grants the owner role. It lets one person who already proves an address (by signing in) join one deck. Session tokens, magic links and ingest tokens are hashed because each one *is* an identity or a credential. A link invite is neither: holding it signs no one in (FR-005).
  - Anyone who can read the database can already read every card in it. A stored link adds nothing they cannot already see.
- **Departure**: sessions, magic links and ingest tokens store only a hash (D23). This departure is limited to `deck_invite_links` and recorded in ADR-085.
- **Alternatives considered**:
  - **An HMAC of the link id with a server key.** The token can be rebuilt without being stored. But it needs a new required secret (a deploy blocker), and it gives no protection against someone who holds both the database and the environment.
  - **Hash only, and "Share again" creates a new link.** This fails FR-003's "the same link". Every re-share would also consume one of the deck's waiting slots.

## D468 — The token travels only in a query string or a body, never in a path

- **Decision**:
  - The shared URL is `https://<host>/s/invite?t=<token>`.
  - The SPA route is `/join?t=<token>`.
  - The anonymous read is `GET /invites/preview?t=<token>`.
  - Join is `POST /invite-links/accept` with `{ token }` in the body.
  - No route has the token in its path.
- **Rationale**:
  - `request-log.ts` and `rate-limit-refused.ts` log `c.req.path` and deliberately leave out the query string so search text never lands in logs. A token in the path would be written to every request line.
  - Analytics send the route pattern from `screens.ts`, never the URL, so a `/join` pattern carries no token.
- **Routing note**: `/s/*` is already proxied to the API unchanged (Caddy), so no Caddy change is needed. The `/s/invite` route is registered before `/s/:itemId`, so `invite` is never read as an item id.
- **Alternatives considered**:
  - A path token with masking in the request log. That masking would have to be repeated in every logger and in error handling, and Caddy would need it too.
  - A new top-level Caddy path. The `/s/*` handle already reaches the API.

## D469 — The chat preview is an API-rendered page, like card shares

- **Decision**: `GET /s/invite?t=` reuses `renderSharePage()` (`share/share-page.ts`) with `PRIVATE_OG_IMAGE_PATH` as the image. It sends `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`, and refreshes to `/join?t=<token>`.
  - **A waiting link**: the title names the deck ("Join <deck> on Gobbit") and the description the inviter and role ("<shown name> invited you as an editor").
  - **Any other state, or an unknown token**: one generic title and description ("A Gobbit invite"). This avoids telling a guesser which tokens exist, and stops a used link's preview from naming the deck again.
  - The `/s/invite*` routes get `publicRateLimit` with the HTML 429 page, like `/p/*`.
  - The page opts into analytics like `/s/:itemId` (`analyticsHead`, `page.js` loader), with a new screen pattern `/s/invite`. With a pattern set, `page.js` sends the pattern as the URL, excludes the query (`data-exclude-search`) and keeps only the referrer's origin, so the token never reaches Umami.
- **Rationale**:
  - Chat apps read Open Graph tags from server HTML. The SPA's `index.html` has none, and this is how `/s/:itemId` already solves it (D192–D199).
  - `no-store` (unlike `/s/:itemId`'s `max-age=300`): the page's content changes when the link is used or revoked.
  - A crawler's GET only reads; it changes nothing, so FR-005 holds by construction.
- **Alternatives considered**: a dedicated OG image showing the deck name. It is extra rendering work for nothing the spec asks for.

## D470 — The invite page reads through one anonymous route

- **Decision**: `GET /invites/preview?t=` answers `{ state, deckName?, inviterName?, role? }`.
  - The deck fields are present only when `state` is `waiting`.
  - Otherwise `state` is one of `used`, `revoked`, `expired` or `invalid`. `invalid` covers an unknown token, a removed inviter and a gone deck alike.
  - It is not under `/public/*`, because `/public/{slug}` would read `invites` as a deck slug (slugs reserve no words). Instead it gets the same treatment explicitly:
    - `publicRateLimit(anonLimit)` on the path;
    - an entry in session auth's `LENIENT_PATHS` and credential-free list, so a stale cookie never blocks it and no credential is read (as `/public/*`, ADR-056).
  - The SPA works out "already a member" from `/me`'s decks. The route never reads the caller.
- **Rationale**:
  - FR-006: only the deck name, the inviter's shown name and the role ever leave the server.
  - Being told why (used, revoked, expired) is US3. `invalid` deliberately merges the cases a guesser could otherwise tell apart.
- **Alternatives considered**: the SPA scraping the preview page. That would make it parse HTML for data the API can give as JSON.

## D471 — Join is a single transaction that locks the link

- **Decision**: `POST /invite-links/accept { token }` (session required) runs `inviteLinks.service.accept` in one transaction:
  1. Read the link row `FOR UPDATE`.
  2. Re-check that it is waiting, that its creator still resolves to `owner` on the deck (`resolveRole`), and that the deck is live and not personal.
  3. Check that the caller has no role on the deck (`resolveRole` returns null), which also covers account owners.
  4. If the caller has a **pending** membership (an earlier mailed or username invite), accept that row with the **link's** role and expire its mailed links (`magicLinks.expireUnusedForMembership`). Otherwise create an accepted membership with `invited_by` = the link's creator.
  5. Set `accepted_at` and `accepted_by` on the link.

  The answer is the deck (slug, for navigation), or a 409 problem carrying the reason (`used`, `revoked`, `expired`, `invalid`, `already_member`). An `already_member` refusal leaves the link waiting (FR-010) and carries `deck: { slug }`, so the invite page can link to the deck. Step 3 runs on every path, the sign-in callback included (D472).
- **Rationale**:
  - The row lock makes the second of two concurrent Joins see `accepted_at` and refuse (SC-003).
  - The link's role wins because it is the one the person just chose to accept, and both invites came from owners.
  - Reusing the pending row keeps the unique active (deck, user) rule; there is never a second membership.
- **Alternatives considered**: a conditional `UPDATE … WHERE accepted_at IS NULL` without a lock. It is atomic for the link, but the inviter and membership checks would then run outside the claim.

## D472 — A brand-new person joins at sign-in; everyone else taps Join

- **Decision**:
  - `POST /auth/magic-link` gains an optional `invite` (the token). In `auth.service.requestMagicLink`:
    - **The address already has an account**: a plain `sign_in` link with `next = /join?t=<token>`. The invite plays no part at the callback, and the person taps Join on return (US2 #4).
    - **The address has no account and the link is waiting**: a `sign_in` link carrying `magic_links.invite_link_id`, sent in **any** registration mode. In `waitlist` mode this bypasses the waitlist, as a mailed deck invite does (D241). This is recorded as an `auth.magic_link` decision with `via = invite_link`.
    - **The address has no account and the link has stopped**: today's behaviour (waitlist in `waitlist` mode).
    - The HTTP answer is the same in every case (no enumeration).
  - At `consume`, inside the existing transaction, a link carrying `invite_link_id` whose address still has no user does the following:
    - It locks the invite.
    - **If the invite is still waiting** (D471 checks), it registers the person with `users.register(email, 'deck_invite', { actorId: creator })`, which returns the existing user if the address got an account since the mail, then runs the rest of D471: already a member → signed in, `next` is the deck and the link stays waiting; otherwise the membership is created or accepted and the invite marked accepted, and `next` is the deck.
    - **If the invite has stopped**:
      - in `waitlist` mode the callback fails with a new reason `invite_gone`, and no user is created. The SPA's auth error screen says the invite is no longer valid and offers the waitlist form;
      - in `open` mode the person registers as `open_sign_in`, as anyone would, and lands on `/join?t=` which shows why.
  - If the invite has stopped and the address has become a user since the link was mailed, the callback is a plain sign-in, and `next` is `/join?t=`.
- **Rationale**:
  - FR-011 needs registration and claim to be one atomic step. If registration came first and the claim came later on a Join tap, two strangers could both register through one link.
  - For people who already have an account there is no such force. The explicit tap stays, as US2 #4 and the "Join is an explicit tap" assumption say, and the callback keeps no invite logic for them.
  - No new `magic_link_purpose` value is needed: the purpose stays `sign_in` and the column says which invite rides along.
- **Spec change** (made in this PR, see spec Clarifications):
  - A brand-new person's Join completes when they open the sign-in mail, without a second tap. They chose Join before entering their address, so this is still their explicit choice, and FR-005 holds because opening the *invite* link still does nothing.
  - The edge case "used up while signing in" now reads: told on return, not registered, and offered the waitlist.
- **Alternatives considered**:
  - Claiming at the callback for everyone. This adds invite logic to every sign-in, for no requirement.
  - Reserving the link when the sign-in mail is sent. A stranger could then block a link just by typing any address.

## D473 — A link stops working when its inviter stops being an owner

- **Decision**: "no longer valid" (`invalid`) is checked on every read and Join. It applies when the creator's `resolveRole` on the deck is not `owner`, when the deck's `deleted_at` is set, or when the deck is personal. Nothing is written when this happens. Accepted links keep their membership.
- **Rationale**: this is the spec's simplest rule (Assumptions). Checking at read time needs no trigger on membership changes. Decks are soft-deleted (`decks.deleted_at`), so a gone deck is a column check.
- **Alternatives considered**: revoking the links in the same transaction as a role change or removal. That puts writes into two more code paths, and a later change of role back to owner would then not restore them.

## D474 — Expiry is recorded when it is met, not when the time passes

- **Decision**: no sweep. An expired link is reported as `refused · expired` by `invite_link.open` and `invite_link.join` when someone uses it. The row itself (`expires_at`, no end timestamp) is the countable record of every link that expired unused (SC-006, query in `quickstart.md`).
- **Rationale**: this is how expiry is already recorded for magic links (`auth.callback` `expired`) and waitlist confirms (`waitlist.confirm` `expired`). No decision is made about a person when the clock passes, so there is nothing to log at that moment.
- **Alternatives considered**: a scheduled job that logs each expiry. It adds a queue and a job for a number one SQL query already gives.

## D475 — Cap on waiting links per deck, checked under the deck lock

- **Decision**: `INVITE_LINKS_WAITING_MAX` (default 10 in `@gobbit/shared` limits, env-tunable) caps waiting links per deck. `create` locks the deck row (`SELECT … FOR UPDATE`), counts waiting links, refuses with 409 `invite_link_limit` (decision `invite_link.create` `refused · limit`) or inserts. Accepted, revoked and expired links do not count.
- **Rationale**:
  - FR-004 requires the cap.
  - The lock stops two concurrent creates both passing at limit − 1, for the cost of one row lock on a rare write.
  - Ten covers a family round with room to spare, and an operator can raise it.
- **Alternatives considered**: a database trigger. The rule is a tunable limit, not an invariant, so it lives with the other env limits in the service.

## D476 — Owners list, revoke and share; sharing is counted in analytics

- **Decision**:
  - **List**: `GET /decks/{id}/invite-links` (owners only, through the existing `member.invite` permission). It answers the waiting links plus links that ended in the last `INVITE_TTL_DAYS` days, newest first. Each row has the reference name, the role, the creator's and the acceptor's member summary (`member-summaries.ts`, no address), the state, `expiresAt` and, while waiting, the share URL.
  - **Create**: `POST /decks/{id}/invite-links { name, role }` answers the same row.
  - **Revoke**: `DELETE /decks/{id}/invite-links/{linkId}` sets `revoked_at` and `revoked_by`. It refuses with 409 `not_waiting` if the link is not waiting.
  - **A creator who stops being an owner**: their unended links list as `invalid` ("no longer valid") with no url, so an owner is never offered a Share that leads to a refusal. The list query derives it with one join against the deck's owners (account owner or an accepted, live owner membership), the same rule as D473. Revoke is the only action, and they count toward the cap until revoked or expired.
  - **Share**: `lib/share`'s `shareItem` gains an optional `text`. The share sheet gets `{ url, title, text }`, and the clipboard fallback copies `text` followed by the URL. The share button on each waiting row (`deck-admin/InviteLinks.tsx`) calls it with the prefilled message ("Join <deck> on Gobbit: …"). It does not reuse `ShareButton`, which is bound to an item id and builds `/s/<itemId>`.
  - **Counting shares**: each share or copy sends a new content event `invite-shared` (`{ deckId, channel }`) through `trackContent`. It is the fifth content event, so it touches `analytics/events.ts`, `sanitize.ts`, `privacy.ts` and their tests, and the CLAUDE.md Analytics rule ("four content events" becomes five).
- **Rationale**:
  - FR-013/014 are owner-only, exactly the people `member.invite` already admits (owners and co-owners), so no new permission is needed.
  - The spec says "sent by the app, as other in-app actions are". Analytics are consent-gated (D281), so SC-006's "shared" count covers owners who allowed analytics. This limit is stated in the Accountability table.
  - The ended-link window keeps the list short on long-lived decks without a new setting.
- **Alternatives considered**:
  - A server endpoint that logs shares. That is a new route only to observe a client action, and it counts every owner while ignoring their analytics choice.
  - Listing every link ever made. That grows without bound on a communal deck.

## D477 — Registering outside the waitlist flow takes the address off the waitlist

- **Decision**: `users.register` gains one step. When it **creates** a user for any reason except `waitlist_invite` (so `deck_invite`, by mail, username or link, and `open_sign_in`), it locks that address's live `pending` or `confirmed` waitlist entry and removes it in the same transaction: `status = 'removed'`, `removed_at = now`, `removed_by = NULL`, plus a `waitlist_events` row `removed` with a null actor (D240). It records a decision event `waitlist.registered`, outcome `removed`, with `entryId`, `userId`, `via` (the registration reason) and `requestId`. Migration `0030` applies the same rule once to existing data.
- **Rationale**:
  - The waitlist is a queue of people waiting for an account. Someone who got one through a deck invite is no longer waiting, and an admin inviting them from the waitlist later would fail (`waitlist.join` already refuses addresses that have a user).
  - `removed` already exists and the prune clears removed entries (D220), so no new status or enum value is needed. Admin removals always carry the admin's id, so a null actor tells the two apart in the history.
  - `waitlist_invite` is skipped because that flow already marks its entry `invited`, with the user, in the same transaction.
  - `invited` entries are left alone: they already point at their user.
- **Alternatives considered**:
  - Marking the entry `invited` with the new user. That status means "an admin let them in", which did not happen, and `invited_by` would be wrong.
  - A new waitlist event action `registered`. It needs an enum migration only to say what a null actor already says.
  - Doing it in the invite-link code only. Mailed and username invites have the same gap.
