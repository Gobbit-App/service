# Contract: Deck activity log

## `GET /decks/{id}/events`

| | |
|---|---|
| Auth | Session; `event.list` (owner, maintainer) |
| Query | `cursor?`, `limit?` (1–50, default 30), `itemId?` |
| 200 | `ItemEventPage`, newest first |
| 400 | Bad cursor, limit or `itemId` |
| 403 | Member without `event.list` |
| 404 | Deck not visible to the caller |

`{id}` accepts the deck id or slug, like other deck routes.

```json
{
  "data": [
    {
      "id": "…",
      "itemId": "…",
      "title": "Clinic opening hours",
      "kind": "published",
      "via": "session",
      "actor": { "userId": "…", "displayName": "Second admin" },
      "changes": [],
      "createdAt": "2026-11-02T18:04:11.120Z"
    },
    {
      "id": "…",
      "itemId": "…",
      "title": "Clinic opening hours",
      "kind": "proposed",
      "via": "ingest",
      "actor": { "userId": "…", "displayName": "An editor" },
      "changes": [],
      "createdAt": "2026-11-02T17:55:02.004Z"
    }
  ],
  "nextCursor": null
}
```

`actor: null` → "Former member". `itemId: null` → the card was purged (no link).

## PWA

- `/d/$slug/log` (lazy): list with action label, title (link when `itemId` is set and the card is visible), person, relative time, "via share/import" badge for `ingest`.
- Card page: "History" for owner/maintainer → `/d/$slug/log?item=<id>`.
- Empty state: "Activity is recorded from <deploy date> on."
