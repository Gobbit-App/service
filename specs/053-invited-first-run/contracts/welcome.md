# Contract: Deck welcome

JSON routes in OpenAPI, reached from the web at `/api/…`. Errors are `application/problem+json`. Schemas are in `data-model.md` § DTOs. Run `pnpm api:openapi` after the route change.

## `GET /decks/{id}` (changed)

The response schema becomes `deckDetailSchema` (was `deckSchema`). Status codes are unchanged: 200, 401, 404.

`welcome` is non-null only when all of these hold (D479):

- the caller's account is not the deck's owning account;
- the caller has an active membership with `accepted_at` set;
- `welcome_dismissed_at` is null.

```json
{
  "...": "every deckSchema field, unchanged",
  "welcome": {
    "membershipId": "…",
    "inviter": {
      "id": "…",
      "name": "Ruth Levi",
      "username": "ruth",
      "initials": "RL",
      "photo": null
    }
  }
}
```

- `inviter` is null when `invited_by` is null or the inviter's account is gone.
- No email address appears in any field (FR-005).

## `DELETE /decks/{id}/welcome` (new)

Session auth; permission `deck.read`. No body.

| Status | When                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| 204    | dismissed now, already dismissed, or the caller has no membership (owning account): all the same to the client |
| 401    | no session                                                                                                     |
| 404    | the deck doesn't exist or the caller can't read it                                                             |

It is idempotent and safe to retry (D481). The real outcome is logged (plan § Accountability).

## Web

| Element                                                                     | Behaviour                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome sheet (`DeckWelcome`)                                               | Heading names the deck. A line names the inviter by shown name: name, else username, else "a member" in running text. The line is left out when `inviter` is null. Then one sentence from `ROLE_WELCOME[role]` ("You can read this deck.", D488). Names are wrapped in `<bdi>` (FR-009). |
| **Categories** (left out when the deck's categories query is empty, FR-008) | Dismiss, then open Browse with the category list (D484).                                                                                                                                                                                                                         |
| **Search**                                                                  | Dismiss, then open the header's search sheet with the box focused.                                                                                                                                                                                                               |
| **Start reading**, Escape, backdrop                                         | Dismiss.                                                                                                                                                                                                                                                                         |
| Order                                                                       | Shown only once `me` and `config` have loaded, and never while the consent question is unanswered with analytics configured, online or not (D483). "How to browse" waits for Browse's layers to close (D485).                                                                    |
