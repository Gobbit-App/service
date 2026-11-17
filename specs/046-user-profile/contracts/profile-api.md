# Contract: profile, creator and lookup API (046)

Errors are `application/problem+json` through the central handler. Run `pnpm api:openapi` after the route
changes. All routes need a member session; none is available to ingest tokens or anonymously.

## `GET /me` (extended)

```jsonc
{ "id": "…", "email": "…", "displayName": "Dana Levi",
  "profile": { "username": "dana" | null, "firstName": "Dana" | null, "lastName": null,
               "location": "Haifa" | null,
               "avatar": { "publicId": "gobbit/profiles/<userId>/x", "width": 512, "height": 512 } | null,
               "initials": "DL" } }
```

## `PATCH /me/profile`

Body (all optional; absent = unchanged, `null` or blank = clear): `{ username, firstName, lastName, location, avatar }`.
`avatar` is `{ publicId } | null`. One transaction: validate, write, hold a released username, insert `profile_events`.

| Status | When |
|--------|------|
| 200 | the updated profile (shape above) |
| 422 `username` | `invalid`, `reserved`, `unavailable` (taken and held look alike) |
| 422 `firstName`, `lastName`, `location` | over the limit (60, 60, 100) |
| 422 `avatar.publicId` | not the caller's profile asset, rejected, or unknown ("Unknown image") |
| 429 | rate limited |

## `POST /me/username/check`

`{ "username": "dana" }` → `{ "available": true }` or `{ "available": false, "reason": "invalid" | "reserved" | "unavailable" }`.
Rate limited per member (shared with lookup). Advisory: the save decides.

## `POST /me/avatar/sign` and `POST /me/avatar/assets`

Same bodies and responses as `POST /decks/{id}/media/sign` and `/media/assets`, without a deck: folder
`gobbit/profiles/<userId>`, tags `profile`, `user:<userId>`. The asset is recorded with `scope = 'profile'`.

## `POST /members/lookup`

`{ "query": "dana" }` (no `@`: exact username; with `@`: exact email, matched only for members who share a
deck with the caller).

```jsonc
{ "member": { "id": "…", "name": "Dana Levi" | null, "username": "dana" | null, "initials": "DL",
              "photo": { … } | null } }   // or { "member": null }
```

200 for a hit and a miss alike (a miss never says why). 429 when rate limited. Never returns an email.

## `POST /decks/{id}/invites` (extended)

Body: `{ role, email }` **or** `{ role, username }`. An unknown username answers the same 404 problem as any
miss. The invite flow, link and role rules are unchanged.

## Item DTOs

`creator` is added to the item DTO on every member read path (see data-model.md, `CardCreator`). Public
DTOs, public search and share previews do not have it.

## Members and names

- `GET /decks/{id}/members`: each member gains `username`, `initials`, `photo`; `displayName` is the
  computed name (D419); `email` stays for owners as today.
- Activity log actor, review `sharedBy`, share `reviewedBy`: `displayName` computed; `actor` and `sharedBy`
  also carry `initials`, `username`, `photo`.
