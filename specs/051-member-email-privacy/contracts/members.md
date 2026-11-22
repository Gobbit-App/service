# Contract: member answers without addresses

Changed DTOs live in `@gobbit/shared` (`schemas/membership.ts`, `schemas/profile.ts`). `pnpm api:openapi` regenerates the client. No route is added, removed or re-permissioned (FR-010).

## `Member` (`GET /decks/{id}/members`, `PATCH /decks/{id}/members/{userId}`)

| Field | Before | After |
|-------|--------|-------|
| `email` | the member's address unless they have a username (then only to themselves) | `string \| null`: the address **only** on a pending row whose current invite the viewer made by typing it (D461); null otherwise, the viewer's own row included |
| `displayName` | profile name, else email-derived name | profile name, else username, else `"Member"` (D459); `"Member"` for every pending typed-address row (D462) |
| `username`, `initials`, `photo` | from the profile; initials from the email when no names | initials from names, else username, else `''` (D460); all three empty for a pending typed-address row (D462) |
| `invitedBy` | — | **new**, `(MemberSummary & { displayName: string }) \| null`, with `id` nullable for the placeholder. Set on pending rows when the viewer may invite (`member.invite`); null otherwise (D463) |
| `role`, `invitedAt`, `acceptedAt`, `implicit`, `userId` | unchanged | unchanged |

The `PATCH` answer is always an accepted member, so its `email` is always null and its `invitedBy` is null.

## `Membership` (`POST /decks/{id}/invites` answer)

| Field | After |
|-------|-------|
| `email` | the typed address for an `{email}` invite (the caller is the inviter); null for `{username}` (unchanged rule) |
| `displayName` | `"Member"` for an `{email}` invite (D462); the shown name for a `{username}` invite |

Request body and errors are unchanged (`{email, role}` or `{username, role}`, D425).

## Other answers that name members (fields unchanged, values follow D459/D460)

| Answer | Field |
|--------|-------|
| `GET /decks/{id}/events` | `actor.displayName`, `actor.initials` |
| review queue (`GET /decks/{id}/review`) | `job.sharedBy.displayName`, `.initials` |
| `GET /decks/{id}/shares`, `GET /shares/{id}` | `reviewedBy.displayName`, `.initials` |
| item DTOs | `creator.initials` (`name` already had no fallback) |
| `GET /me` | `user.displayName` follows the chain too (no web reader); `profile.initials` unchanged (self, D460) |

## Invite mail

The inviter is named by the chain. When the inviter's name is `"Member"`, the subject and body read "A Gobbit member invited you to …" (D464).

## Unchanged

`POST /members/lookup` (D424), `memberSummarySchema` (no email, D427), public DTOs, the platform admin waitlist DTOs (they keep addresses; out of scope).
