# Quickstart: Invite by link

These steps check the feature end to end on a local stack. They show what to look for; the routes are in `contracts/invite-links.md`.

## Setup

1. Run `pnpm db:migrate`. This applies `0030_deck_invite_links`.
2. Run `pnpm dev`. Registration stays at its default, `REGISTRATION_MODE=waitlist`.
3. Sign in as the seeded owner and create a **shared** deck.
4. Keep a second browser profile, or a private window, for the invitee. The local mailbox catches every sign-in mail.

## Scenarios

### 1. Create and share (US1)

1. As the owner, open the deck's Settings, then Members, then Invite by link.
2. Enter the name "Aunt test" and the role Editor, then create the link.
3. The list shows "Aunt test · Editor · waiting · expires <date>", with Share and Revoke buttons.
4. Tap Share on a desktop browser with no share sheet. You see "Copied". The clipboard holds "Join <deck> on Gobbit: http://localhost:5173/s/invite?t=…".
5. Reload the page and tap Share again. The same URL is copied (FR-003).

### 2. Preview shows nothing private (FR-006, SC-005)

1. Give the deck a private category with a card in it.
2. Run `curl -s 'http://localhost:5173/s/invite?t=<token>'`.
3. Check the `og:title` and `og:description`. They contain the deck name, the inviter's shown name and the role, and nothing else. There is no card title, category name, reference name or `@`.
4. Check the response headers. They include `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

### 3. Opening does nothing (FR-005, SC-004)

1. Before and after scenario 2, count the rows in `sessions`, `users` and `memberships`. The counts do not change.
2. Open `/join?t=<token>` while signed out. Again, nothing is created.

### 4. A brand-new person joins (US2 #5, FR-011, FR-012)

1. In the second profile, open the link and tap Join.
2. Enter a new address, for example `new-person@example.test`. The page says to check your mail.
3. Open the sign-in mail from the mailbox. You land on the deck as an Editor. There is no waitlist page and no second tap.
4. In the database, `users.registered_via = 'deck_invite'` and `registered_by` is the owner.
5. As the owner, the list now shows "Aunt test · accepted by <shown name>".

### 5. Single use (US3 #1, SC-003)

1. Sign in as a third user and open the same link. The page says it was already used, and there is no Join button.
2. `POST /api/invite-links/accept { token }` answers 409 `invite_link_used`.

### 6. Already a member (FR-010)

1. Create a new link.
2. Open it as the owner and tap Join. The page says "You're already in", and the owner's list still shows the link as waiting.

### 7. Revoke, expiry, inviter removed (US3 #2/#3, FR-009)

1. Revoke a waiting link. Opening it shows "no longer valid", and the generic preview appears.
2. Run `UPDATE deck_invite_links SET expires_at = now() - interval '1 minute'` on another link. Opening it shows "expired".
3. Make a co-owner create a link, then change that co-owner to Editor. Opening the link shows "no longer valid".

### 8. Stopped while signing in (D472)

1. With a new address, tap Join and request the sign-in mail.
2. Revoke the link as the owner.
3. Open the mail. You land on the auth error screen with the `invite_gone` copy and the waitlist form. No `users` row exists for that address.

### 9. Limit (FR-004)

1. Run `INVITE_LINKS_WAITING_MAX=2 pnpm dev`.
2. Create two links, then a third. The third is refused with 409 `invite_link_limit`, and the message says to revoke one or wait.

## Accountability checks

- **Decision events.** Run `pnpm dev 2>&1 | grep invite_link`. After the scenarios you see:
  - `invite_link.create` with outcomes created and refused · limit;
  - `invite_link.open` with outcomes shown and refused · used / revoked / expired / invalid;
  - `invite_link.join` with outcomes accepted and refused · used / already_member;
  - `invite_link.revoke`, and `auth.callback` refused · invite_gone.
  - No line contains a token or an address.
- **Expired links (SC-006).** Count them with:

  ```sql
  select count(*) from deck_invite_links
  where accepted_at is null and revoked_at is null and expires_at <= now();
  ```

## Automated

- `pnpm test:unit`
- `pnpm test:int`. The concurrent-Join test lives in `invite-links.int.test.ts`.
- `pnpm test:e2e`. The `@smoke` `invite-link.spec.ts` runs the owner, the invitee, Join, landing on the deck and the refused second use.
