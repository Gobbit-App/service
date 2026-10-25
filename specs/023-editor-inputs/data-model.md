# Data Model: Friendlier editor inputs

No migration, no new table or column.

## Image card payload (`packages/shared/src/schemas/payloads.ts`)

| Field | Before | After |
|-------|--------|-------|
| `publicId` | `string`, min 1, recorded asset of the deck (D160) | unchanged |
| `alt` | `string`, min 1, required | `string`, optional, may be empty |
| `width`, `height` | server-owned (D160) | unchanged |

- DB: `items.payload` is `jsonb`; the only CHECK on it is the 8192-byte budget, which still applies. `item_search_text` reads `payload->>'alt'`, which is `NULL` when absent and is already concatenated null-safely.
- Existing cards keep their alt. The editor omits `alt` when blank; API clients may send it empty or leave it out.

## Rendering rule (`@pb/shared/image-alt`)

`imageAlt({ alt, title, titleAdjacent }) → string`

| alt | titleAdjacent | Result |
|-----|---------------|--------|
| non-blank | any | `alt` |
| missing / blank | true | `''` (decorative) |
| missing / blank | false | `title` (trimmed) |

## Editor state (web, edit mode)

| State | Owner | Changes when |
|-------|-------|--------------|
| `draft` | `CardEditor` | any field edit; `categoryIds` only through `rebaselineCategories` |
| `baseline` (opening snapshot) | `CardEditor` | `rebaselineCategories(ids)` after a confirmed category save or Undo |
| `selected` categories | `useInstantCategories` → `CategorySaver` | each tap (optimistic); reverted on failure |
| `confirmed` categories | `CategorySaver` | server response of each category PATCH |
| burst `undoTarget` | `CategorySaver` | first tap of a burst; cleared when the burst saves or fails |

Create mode is unchanged: chips edit `draft.categoryIds`, sent in `POST /decks/{id}/items`.
