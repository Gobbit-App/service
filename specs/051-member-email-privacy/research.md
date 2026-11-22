# Research: Member email privacy

Decisions D459–D465 (reserved in `specs/README.md`). The durable ones become ADR-084.

## D459 — One name chain, changed at its two builders

- **Decision**: `displayNameSql` (`@gobbit/db`) and `displayNameOf` (`@gobbit/shared` profile) become profile name, else username, else `"Member"`. Today they fall back to `users.display_name`, which registration fills with the address's local part (`displayNameFromEmail`). The `"Member"` literal is exported once (`MEMBER_NAME`) and used by both. No second builder is added.
- **Rationale**:
  - Every member-facing name already goes through these two (D419, guarded by `no-direct-display-name.test.ts`): the members list, role change and invite answers (`memberships.repo`), the activity log (`item-events.repo`), the review queue's `sharedBy` and the share `reviewedBy` (`displayNameOf` on `users.findById`, whose `displayName` is already `displayNameSql`), and the invite mail (`inviter.displayName` from the session's `CurrentUser`).
  - Fixing the builders fixes all of these at once.
- **Consequences, stated rather than avoided**:
  - `/me`'s `user.displayName` changes too. No web code reads it (the app shows the profile's own fields and the email in Settings), so FR-008 holds where people can see it.
  - The platform admin's waitlist screen names an inviter by the same chain (`waitlist.repo` `invitedByName`). That screen is out of scope, but the change there is harmless and consistent.
  - `users.display_name` becomes write-only. D419's "clearing your names brings back exactly the old value" is superseded: clearing them now brings back the username, else "Member". The column is kept. Dropping it touches registration and the seed and is not needed for privacy; it is a follow-up.
- **Alternatives considered**:
  - A separate `shownNameSql` for other people's views only. This would split the one name in two and break D419's rule that there are exactly two builders, for no visible gain.
  - Rewriting `users.display_name` in a migration (to `"Member"`). The value would still be wrong for new sign-ups, and the column would keep pretending to be a name.

## D460 — Initials from the shown name, never the address, for others

- **Decision**:
  - `initialsFor` takes `{ firstName, lastName, fallback }` instead of `email`. `fallback` is the text split on `.`, `-`, `_` when no name has a letter.
  - Member summaries pass the username.
  - The two self views keep passing the member's own email: `/me` profile in `profile.service`, the `BottomBar` avatar and the `ProfileForm` preview.
  - `users.summariesByIds` stops selecting `email`.
  - The literal `"Member"` is never passed, so a floor name gets `''`, which is the neutral glyph on the member's colour (D420).
- **Rationale**:
  - FR-007: initials follow the shown name (profile name, else username).
  - FR-008: a member's own avatar is unchanged.
  - This is one parameter rename across four callers.
- **Alternatives considered**:
  - Dropping the fallback altogether, so a member with only a username would get the glyph. That is weaker than the username's own letters, which are already public.
  - Using the username for self views too. That would change what members see of themselves, which FR-008 rules out.

## D461 — Who sees an address: the current inviter of a typed-address invite, while pending

- **Decision**:
  - A new column, `memberships.invited_by_email boolean NOT NULL DEFAULT false`, is set by `create` and rewritten by `reinvite` (true for `{email}`, false for `{username}`).
  - The service puts the invitee's `users.email` in a member row only when all of these hold:
    - the row is pending,
    - `invited_by_email` is true,
    - `invited_by` equals the viewer.
  - Every other row, the viewer's own included, answers `email: null`.
  - The invite answer keeps the typed address for `{email}` invites (it is answered to the inviter only) and `null` for `{username}` invites, as today.
  - The role-change answer is always about an accepted member, so it is always `null`.
- **Rationale**:
  - FR-001 to FR-004 and the re-invite edge case: the address follows the *current* invite and its inviter, and stops once the row is accepted (the read is gated on pending, so nothing needs clearing on accept).
  - A flag is enough because `users.email` already holds the address. No copy of the address is stored.
  - Pending invites that existed before this ships default to false, so their addresses are hidden until re-invited. That is the conservative direction.
- **Alternatives considered**:
  - Inferring "typed" from "invitee has no username". This would leak when an invitee later clears their username, and it would hide the address from an inviter who typed it for someone who has one.
  - Storing the typed address on the membership. This duplicates `users.email` and is one more place for an address to leak from.
  - Showing it to every owner. The spec rejects this (Assumptions).

## D462 — A pending typed-address invite is anonymous to everyone

- **Decision**:
  - While a row is pending with `invited_by_email = true`, it shows no profile for every viewer, inviter included:
    - `displayName` is `"Member"`,
    - `username` is null,
    - `initials` is `''`,
    - `photo` is null.
  - The invite answer for a typed address carries the same anonymous fields.
  - Pending username invites keep today's summary: the inviter typed the username, and username lookups already preview that summary (D424).
- **Rationale**:
  - Otherwise anyone who can invite could type an address and read back its owner's name, username and photo. That links address to profile, bypassing D424, which answers email lookups only between deck mates and under the lookup rate limit.
  - The spec already says it: US3 scenario 5 ("the address they typed and nothing else of the invitee's") and the edge case ("the existing person's profile name or username shows once they accept").
  - The inviter still tells the row apart by the address they typed.
- **Alternatives considered**:
  - Hiding the profile from the inviter only. Other owners would then see the profile on a row the inviter sees as an address, and the inviter could ask a co-owner.
  - Rate-limiting email invites like lookups. That is more machinery, and it still links address to profile within the limit.

## D463 — "Invited by" for the people who manage members

- **Decision**:
  - `Member.invitedBy` is the inviter's summary plus `displayName`, built the same way as `sharedBy` (D421). It is filled on pending rows only, and only when the viewer has `member.invite` (owners and co-owners via `can()`, not a role string); otherwise it is null.
  - When the inviter is no longer on the deck (not an account owner and not an accepted member in the same list) or their account is gone (`invited_by` set null), it is the 046 placeholder: `id: null`, `displayName: "Member"`, no photo.
  - An inviter demoted after inviting keeps seeing the address (D461 follows who typed it), but no longer sees "invited by" (FR-005 follows the permission).
- **Rationale**:
  - FR-005 and the "inviter leaves" edge case.
  - The list already holds every owner and accepted membership, so "still on the deck" is an in-memory check, not a query.
- **Alternatives considered**:
  - Showing "invited by" to every role. Not asked for, and the spec limits it to owners.
  - A separate pending-invites endpoint. The members list is already the place, and one answer keeps the web unchanged apart from one line.

## D464 — The invite mail when the inviter has no name

- **Decision**: `inviteEmail` takes `inviterName` as before. When it equals `MEMBER_NAME`, the subject and body say "A Gobbit member invited you…" instead of "Member invited you…".
- **Rationale**: FR-006 is met either way (the name is "Member", not the address). The variant only fixes the grammar of the floor case. It is one ternary in the template.
- **Alternatives considered**: using the deck name as the subject ("You're invited to X"). That is a copy change beyond the floor case.

## D465 — Offline copies and the test tier

- **Decision**:
  - No persisted-cache version bump. The members query is persisted (`persist.ts` does not list it), and its next successful refetch replaces the stored copy (FR-011, in the spec's own wording). Sign-out already clears the cache.
  - E2E tier: full.
- **Rationale**:
  - Bumping the persister buster would throw away every member's offline cards, the opposite of offline-first, to clear data the next refresh clears anyway.
  - The tier: the privacy rules are API answers, covered fully by an integration scan per role and deck kind (SC-001). The web change is one secondary line on the deck-settings member row. The smoke journeys (invite by email, invite by username with no address on screen, `smoke/members.spec.ts`) keep passing unchanged, so smoke stays as it is.
  - One `@full` case adds the multi-person view: a reader's members screen has no address, and the inviter's pending row shows the typed one. It uses the existing `member(deck, role)` fixture.
- **Alternatives considered**:
  - A new smoke test. The critical journey (inviting) does not change.
  - No e2e at all. The settings screen is UI the int tests cannot see.

## Checked and unchanged

- `accounts.name` (also filled from the address at registration) reaches no member-facing DTO.
- Notice and reminder mails name no other member (checked in the spec phase).
- The event and reminder audience pickers (`EventNotifyFields`, `ReminderFields`) read the same members list and show accepted members only, so they need no change.
- Card creator summaries already carry no address and get the new initials through `member-summaries.ts`.
- Lookup (`POST /members/lookup`), its rate limit, its events and its alert are untouched (FR-009).
