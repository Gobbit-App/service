# Data model: First-class card composer (039)

No database, API or stored-draft change (FR-021). The feature only adds client UI state.

## Composer state (in `CardEditor`)

| State | Type | Notes |
|-------|------|-------|
| `draft` | `Draft` | unchanged (D145) |
| `previewOpen` | boolean | narrow screens only (D309); ignored from 768 px |
| `pendingType` | `CreatableType \| null` | type the person chose while the switch confirm is open (D303) |
| `showAllErrors` | boolean | set by a blocked Save so unchanged-card client errors show (D308) |

## Start type for `/d/{slug}/new` (D302)

```
search.type usable for the deck  → composer(type)
search.type absent or unusable   → newest stored draft `new:{deckId}:{t}` for t in CREATABLE_TYPES
                                    → composer(t) when found and usable
                                    → chooser otherwise (unusable `?type=image` shows the reason)
```

"Usable" means creatable and not Image without image storage.

## Type tile

| Field | Source |
|-------|--------|
| `type` | `CREATABLE_TYPES` |
| `label` | `TYPE_LABELS[type]` |
| `hint` | `TYPE_HINTS[type]` (new, `editor/composer/type-tiles.ts`) |
| `icon` | `TYPE_ICONS[type]` (`ui/icons` names) |
| `unavailable` | `IMAGES_UNAVAILABLE` for image without cloud name, else null |

## Content loss on a type switch (D303)

`payloadHasContent(draft)` is true when `draft.payload` differs from `newPayload(draft.type)`. In that
case a switch to another type needs the confirm. Title, body, categories and source always carry over.
