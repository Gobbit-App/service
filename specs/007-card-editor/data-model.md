# Data Model: Card editor (create and edit)

**No server changes**: there are no tables, columns, migrations or DTOs in this feature. The server entities (`items`, `categories`, `item_categories`) and their invariants are unchanged:

- D95: a published item has ≥ 1 category (deferred trigger).
- Body ≤ 600 code points and payload ≤ 8192 bytes (CHECKs).
- The type is immutable (service).
- D96: proposal visibility.

This file describes the client-side models.

## Draft (in memory, `editor/draft.ts`)

| Field | Type | Rule (client mirror; server authoritative) |
|-------|------|---------------------------------------------|
| `type` | `'text' \| 'link' \| 'image' \| 'table' \| 'calc'` | set on create, read-only on edit |
| `title` | string | trimmed, 1..120 code points (`CARD_TITLE_MAX`) |
| `body` | string | ≤ 600 code points (`CARD_BODY_MAX`) |
| `payload` | `DraftPayload` (below) | per-type rules; `utf8Bytes(JSON.stringify(payload)) ≤ 8192` |
| `categoryIds` | string[] | ≥ 1 (D95); unique; only ids from the visible `categoriesQuery` |
| `sourceUrl` | string | `''` or http(s) URL; `''` → omitted on create, `null` in a patch |
| `entities` | `Entities \| null` | remove-only; never grows |

### DraftPayload (by type)

| Type | Shape | Rules |
|------|-------|-------|
| text | `{}` | — |
| link | `{ url, preview?: { title?, description?, image? } }` | `url` http/https; preview keys optional; `image` preserved untouched (008 sets it from Fetch preview). Note: the schema has no `siteName`; 008 decides whether to add it. |
| table | `{ columns: string[], rows: string[][] }` | 1..6 columns, each non-empty; ≤ 12 rows; every row length = columns length (padded on load) |
| calc | `{ fields: { key, label, unit?, default? }[], expression, resultLabel }` | 1..6 fields; key `^[a-zA-Z_][a-zA-Z0-9_]*$`, unique; label non-empty; `default` finite number; `expression` passes `validateCalcExpression(expression, keys)`; `resultLabel` non-empty |
| image | `{ publicId, alt }` | read-only in 007; editable in 008 |

### Derived

- `toCreateBody(draft)` → `ItemCreate` (`@pb/api-client` type): `{ type, title, body, payload, categoryIds, sourceUrl? }`, with no `status` (the server default applies; see Q1 in plan.md).
- `toPatch(original: Item, draft)` → `ItemPatch | null`. It contains only the changed keys from `title`, `body`, `payload` (whole), `categoryIds` (order-insensitive compare), `sourceUrl` (string or `null`) and `entities` (whole). It never contains `type` or `status`.
- `FieldErrors` is `Partial<Record<string, string>>`, keyed by dotted path (`title`, `payload.columns.2`, `payload.fields.1.key`, `categoryIds`, …), the same path syntax as `problem.errors[].path`.

### State transitions

```
create:  emptyDraft ──edit──▶ dirty ──save ok──▶ (draft deleted) → deck list
                         │            └─save error──▶ dirty + FieldErrors (draft kept)
                         └─close/reload──▶ stored draft ──reopen──▶ Restore? ─yes▶ dirty / ─no▶ emptyDraft
edit:    draftFromItem ──edit──▶ dirty ──save ok──▶ (draft deleted) → /i/$id (or review queue)
         stored draft + item.updatedAt > baseUpdatedAt ──▶ Restore? + "card changed since"
proposal: status stays 'proposed' through every save (publish only via review queue)
```

## Stored draft (IndexedDB, `editor/drafts-store.ts`)

The store is idb-keyval `createStore('gobbit-drafts', 'drafts')`, separate from the query cache store.

| Key | Value |
|-----|-------|
| `new:<deckId>:<type>` | `StoredDraft` |
| `edit:<itemId>` | `StoredDraft` |

```ts
type StoredDraft = {
  v: 1;                         // schema version; unknown v → discarded
  draft: Draft;
  baseUpdatedAt: string | null; // item.updatedAt at load (edit), null (create)
  savedAt: string;              // ISO, for "saved 2 min ago"
};
```

Lifecycle:

- Written 500 ms after the last change, while dirty.
- Deleted on a successful save and on Discard.
- `clear()` runs on sign-out (`api/session.ts`).
- Entries for other decks or items stay until opened or until sign-out. There is no TTL in 007.

## Item preview (in memory, `editor/EditorPreview.tsx`)

This is an `Item`-shaped object built from the draft for `cards/Card preview`:

- `id: 'preview'` and `deckId` from the route.
- `status`: the original's status, or `published` on create.
- `isFavorite: false`.
- `createdAt`/`updatedAt`: the original's, or now.
- `entities`, `sourceUrl`, `categoryIds`, `payload`: taken from the draft.

It is never sent to the API.
