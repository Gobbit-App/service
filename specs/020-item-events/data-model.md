# Data Model: Deck activity log

## Migration (`00NN_item_events`, next free number)

### Enums

| Enum | Values |
|------|--------|
| `actor_via` | `session`, `ingest` (Phase 13: `ADD VALUE 'mcp'`) |
| `item_event_kind` | `created`, `proposed`, `published`, `updated`, `archived`, `restored`, `deleted`, `undeleted`, `discarded`, `merged` |

### `item_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `uuidv7()` like other tables |
| `deck_id` | uuid NOT NULL | FK `decks` ON DELETE CASCADE |
| `item_id` | uuid NULL | FK `items` ON DELETE SET NULL |
| `actor_user_id` | uuid NULL | FK `users` ON DELETE SET NULL |
| `via` | `actor_via` NOT NULL | |
| `kind` | `item_event_kind` NOT NULL | |
| `title` | varchar(200) NOT NULL | Card title after the change, truncated |
| `changes` | text[] NULL | Field names; CHECK `changes IS NULL OR kind IN ('updated', 'merged')` |
| `created_at` | timestamptz(3) NOT NULL default now() | |

Indexes: `item_events_deck_created_idx (deck_id, created_at DESC, id DESC)`, `item_events_item_created_idx (item_id, created_at DESC)`.

Down: drop table, drop both enums.

### Field names in `changes`

`title`, `body`, `payload`, `categories`, `sourceUrl`, `entities`, `verifiedAt`, `type`.

## Action map

| Service path | `kind` | `via` | `changes` |
|--------------|--------|-------|-----------|
| `items.service.create` | `created` | actor | — |
| `ingest/propose.ts` (worker, `proposeDirect`) | `proposed` | `ingest` | — |
| `review.service.publish` (new card) | `published` | actor | edited fields, if the reviewer edited |
| `review.service.publish` with a merge target | `merged` (on the target) | actor | fields taken from the proposal |
| `review.service.discard` | `discarded` | actor | — |
| `items.service.update` | `updated` | actor | `diffFields` |
| `archive` / `restore` / `remove` / `undelete` | `archived` / `restored` / `deleted` / `undeleted` | actor | — |

## DTOs (`@gobbit/shared`)

### `ItemEvent`

| Field | Type |
|-------|------|
| `id` | string |
| `itemId` | string \| null |
| `title` | string |
| `kind` | `ItemEventKind` |
| `via` | `ActorVia` |
| `actor` | `{ userId: string, displayName: string } \| null` |
| `changes` | string[] |
| `createdAt` | ISO string |

### `ItemEventPage`

`{ data: ItemEvent[], nextCursor: string | null }`

### `ItemEventListQuery`

`{ cursor?: string, limit?: 1–50 (default 30), itemId?: uuid }`

## Permission

`'event.list': ['owner', 'maintainer']` in `PERMISSION_MATRIX`.
