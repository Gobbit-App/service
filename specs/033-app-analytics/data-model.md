# Data model: App analytics (033)

No database change. Everything below is a payload or a typed constant.

## AppConfig.analytics (`GET /config`)

| Field | Type | Rule |
|-------|------|------|
| `analytics` | `{ siteId: string; host: string } \| null` | `null` when `ANALYTICS_SITE_ID` is unset; `host` = `APP_URL` host, else `API_URL` host (031's `analyticsHead` rule) |

## Screen (route pattern catalogue, D244)

`{ pattern: string; name: string }`: `pattern` starts with `/` and contains no real value (placeholders `:deck`, `:item`, `:category`), no query and no fragment; `name` comes from a fixed list.

| Route id (web) / renderer (API) | Pattern | Name |
|---|---|---|
| `/` | `/` | Home |
| `/settings` | `/settings` | Settings |
| `/share` | `/share` | Share |
| `/admin/waitlist` | `/admin/waitlist` | Admin waitlist |
| `/i/$itemId` | `/i/:item` | Card |
| `/i/$itemId_/edit` | `/i/:item/edit` | Card editor |
| `/d/$slug/` | `/d/:deck` | Deck |
| `/d/$slug/archived` … `/d/$slug/shares` | `/d/:deck/<segment>` | Archived, Browse, Favorites, Import, Links, Activity log, New card, Review, Search, Deck settings, Shares |
| `/d/$slug/c/$category` | `/d/:deck/c/:category` | Category |
| `/sign-in`, `/auth/error` | `null` (untracked) | — |
| `__root__`, `/d/$slug` (layouts, never the leaf) | `null` | — |
| unknown at runtime | `/other` | Other |
| public deck / category / card / search | `/p/:deck`, `/p/:deck/c/:category`, `/p/:deck/i/:item`, `/p/:deck/search` | Public deck, Public category, Public card, Public search |
| share preview | `/s/:item` | Share preview |

## Page view (as sent to Umami)

| Field | Value after `sanitizePayload` |
|-------|-------------------------------|
| `website` | site id |
| `url` | screen pattern |
| `title` | screen name |
| `referrer` | origin of an external referrer, else `''` |
| `hostname`, `screen`, `language` | kept (tracker-built, coarse) |
| `id` | the member's Gobbit user id (app only), else absent |
| `tag` | removed |

## Content event (D248)

| Field | Type | Rule |
|-------|------|------|
| `name` | `card-created \| card-edited \| card-deleted \| card-shared` | anything else → cancelled |
| `data.deckId` | UUID | dropped if not a UUID |
| `data.itemId` | UUID | dropped if not a UUID |
| `data.count` | integer ≥ 1 | bulk actions only |
| `data.type` | item type (`text`, `link`, `image`, `table`, `calc`) | dropped otherwise |
| `data.channel` | `editor`, `review`, `bulk-publish`, `import`, `archive`, `restore`, `undelete`, `card-menu`, `share-sheet`, `copy-link`, `share-target` | dropped otherwise |

Any other `data` key is dropped. No state is kept and nothing is queued.

## Identity (D247)

The facade keeps the last identified id in memory only. Before each send it compares that id with the current `me` user id; on a change it calls `umami.identify(id)`, or the no-member form that the hook cancels, so Umami's session token resets.
