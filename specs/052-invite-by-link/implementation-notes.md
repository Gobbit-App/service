# Implementation notes

## T009 invite-links.repo
- `accept(tx, { by, user, now })`: `user` may be a function `(link) => AcceptUser`, called after the D473 checks and before the already-member check, so the sign-in callback can `users.register` there (data-model.md step 3-4). Results: accepted | already_member | used | revoked | expired | invalid.
- `create` returns `'limit'` at the cap; the personal-deck refusal stays in the service (T010). `revoke` returns null when the link is not waiting/invalid (service maps 404 vs 409).
- `listForDeck` uses `coalesce(accepted_at, revoked_at, expires_at) > now - ttl` to cover waiting plus recently ended in one predicate.

## T010 invite-links.service
- Deps take `transaction` (like auth.service) and `origin`; `accept` runs `links.accept(tx, { by: { token } })` and maps results to events (`via: 'join'`) and 409 problems (`/problems/invite-link-{used,revoked,expired,invalid,already-member}`, `-limit`, `-personal`, `/problems/not-waiting`).
- Added optional `deck: { slug }` to `problemSchema` and `HttpError` extensions for the already-member problem (contract: carries `deck.slug`).
- `preview` takes `ctx.requestId`; inviter name = username, else profile name, else "Member". Preview `invalid` for a waiting link is checked read-only (deck live/not personal, creator still owner); `accept` re-checks in its transaction.
- The sign-in-callback join (`via: 'sign_in'`) event is left to the callback task.

## T015 web tests (written before T020/T021)
- Assumed props: `InviteLinkForm({ deck, disabled })` (labels "Name", "Role", button /create/i, role options reader/editor/maintainer); `InviteLinks({ deck, disabled, nav? })` with `nav` a `ShareNavigator` like `ShareButton`; rows are `listitem`s, buttons named /share/i and /revoke/i, text "created by <name>", "no longer valid".
- Requests: `POST /decks/{id}/invite-links`, `GET /decks/{id}/invite-links`, `DELETE /decks/{id}/invite-links/{linkId}`. Share text must contain the deck name; `trackContent('invite-shared', { deckId, channel })`.

- T020: InviteLinkForm reuses the InviteForm classes (card-editor admin-form), no new CSS. Name maxLength is the literal 60 because @gobbit/shared has no limits subpath export (matches INVITE_LINK_NAME_MAX). Create icon is link. Screenshots taken from a throwaway harness (removed) because the form is mounted only in T021.

- T021: InviteLinks reuses the member-row classes (admin-list__item, admin-member*, share-button-wrap/toast), so no new CSS. Mounted with InviteLinkForm in MembersSection for owners (list above the form). Revoke is a Button with no confirm step (one click, per the test). `useRevokeInviteLink` calls `DELETE /decks/{id}/invite-links/{linkId}` through a cast because the route (US3) is not in the generated client yet; drop the cast after `pnpm api:openapi`. Share text is "Join <deck> on Gobbit:" with `shareItem` appending the url on the clipboard path. MembersSection/DeckAdminScreen tests now answer `GET /decks/{id}/invite-links`; the offline test checks every "Name" field.

## T024 auth.service.test (written before T030)
- Assumed dep: createAuthService({ invites: { findWaiting(token): Promise<{ id: string } | null> } }), waiting = unended, unexpired, still valid (D473). requestMagicLink({ invite }): existing account -> magicLinks.create({ next: "/join?t=<token>" }); unknown + waiting -> create({ inviteLinkId }) and event via "invite_link" + linkId; else as today. via/linkId must be added to AuthDecisions["auth.magic_link"] (T031/T030).

- T022: second describe in invite-links.int.test.ts with its own `setupApiTest` (CLIENT_IP_HEADER, high-limit anon limiter, captured logger) plus a second context with limit 2 for the 429 check. The pending-invite case inserts a `magic_links` row directly. Token-in-logs check covers only what the app logs through the injected logger.

- T023: the sign-in-through-a-link cases run in both modes (`describe.each` waitlist/open) in apps/api/test/auth.int.test.ts; links are made through the create route and stopped by a direct SQL `revoked_at` update, so the suite does not depend on the revoke route. Expected to fail until T030/T031 land (12 of 14 new cases fail now; the other 2 pass because they match today's behaviour).

- T023 test fixes (after T030/T031): the `roleOf` helper selected a nonexistent `memberships.status`; it now reads `accepted_at IS NOT NULL` as `accepted`. The "two unknown addresses" case expected no user in open mode, but contracts/invite-links.md (callback table) says a stopped link with no account registers `open_sign_in` and redirects to `/join?t=`; the test now asserts that in open mode and no user in waitlist mode. Implementation unchanged.

## T035 JoinScreen

- The `/join` analytics screen entry is in `apps/web/src/analytics/catalogue.ts` (the route catalogue), not `packages/shared/.../screens.ts`, which only holds the API-rendered pages.
- Preview query key `invite-preview` is added to the not-persisted set (`api/persist.ts`): a stranger's deck name must not reach IndexedDB.
- Regenerated api-client (`pnpm api:openapi`) and `routeTree.gen.ts` (via `pnpm build:web`) so the new routes typecheck.

- T039: Revoke now asks first (Revoke -> "Revoke the link" + Keep, same as MemberRow); useRevokeInviteLink uses the typed client (cast removed). No new CSS.

- T042: docs/design/auth.md "Invite links" section plus the D477 waitlist rule, placed after the registration gate; Deviations copied from these notes.

- T054: the `invite_link.join` event for the sign-in callback (`via: 'sign_in'`) was not emitted anywhere. `invites.recordJoin` (shared with `accept`) now logs it; `auth.consumeMagicLink` calls it after the callback transaction commits (a rolled-back callback must not log an accepted join). D477 "same transaction" holds for the status change and `waitlist_events` row (done in `createWithAccount`, per T053); the `waitlist.registered` decision event is a log line recorded right after, as for every decision event. Alert thresholds are in docs/design/auth.md.

## T053: atomic waitlist release on register

- `usersRepo.createWithAccount` takes `releaseWaitlist` and, inside its own transaction, removes the live waitlist entry and inserts the null-actor `removed` event after the user insert; it now returns `{ user, waitlistEntryId }`. A failing event insert rolls back the user too (FR-018, D477).
- `users.service` no longer takes a `waitlist` dependency; `waitlistRepo.removeLiveForRegistration` was removed as dead code. Covers the mailed deck-invite, invite-link and open sign-in paths, since all go through `register`.

## T047 / T055 close-out

- Final tree: lint, format, typecheck, unit (527 files, 5207 tests), integration (86 files, 1008 tests), `@smoke` e2e (77 passed) and the bundle budget (127.9 KB gzip) all pass.
- Quickstart scenarios 1–9 are exercised by `apps/api/test/invite-links.int.test.ts`, `auth.int.test.ts`, `registration-gate.int.test.ts` and `e2e/tests/smoke/invite-link.spec.ts`; not walked by hand in a browser against the live API.
- UI screenshots (phone 412 + desktop 1280, light + dark) were taken for T020, T021, T035, T039 and T049 from throwaway Vite harnesses with mocked fetch (the real screens were not reachable at the time); compared with InviteForm, the MembersSection pending rows and `auth.error`, they match in layout, spacing and type. Not every light/dark variant was opened.
- The route test `-auth.error.test.tsx` carries the `-` prefix so TanStack Router ignores it.
- A duplicate `/s/invite` rate-limit registration in app.ts (T028 + T029) was removed.

## Review fixes: invite-links.repo accept/create

- `accept` inserts the membership inside a savepoint (`tx.transaction`) and maps unique violation 23505 (`memberships_deck_user_active_uq`) to `already_member`, so two links of one deck accepted by the same person in parallel no longer 500 or roll back the sign-in.
- A link already accepted by the same plain-object user answers `already_member` (not `used`); the function-form user (sign-in callback) is not resolved early, so it still answers `used`.
- `create` locks the deck row with `FOR NO KEY UPDATE` so child inserts are not blocked. Tests added for all three in `apps/api/test/invite-links.int.test.ts`.
