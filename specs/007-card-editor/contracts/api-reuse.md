# Contract: API endpoints and problem types the editor reuses

No new or changed endpoints. Everything below exists on main @ `10b0e2a` and is described by `@pb/api-client`. 007 only adds web hooks (`api/update-item.ts`, `api/create-category.ts`) and relies on the behaviour listed here, so integration tests assert it (see tasks.md).

## Endpoints

| Method + path | Used for | Auth / permission | Behaviour relied on |
|---------------|----------|-------------------|---------------------|
| `GET /decks/{id}` (`id` = slug or uuid) | role, deck id for draft key | member | `role` drives `can()` |
| `GET /decks/{id}/categories` | category chips | member | returns only categories visible to the caller (`visibleCategoriesWhere`); `isDefault` marks the default |
| `POST /decks/{id}/categories` `{ name, visibility? }` | inline create | `category.create` (owner, maintainer, editor); non-`shared` visibility needs `category.read_private` | slug derived from name; empty slug → 400 `bad-request` path `slug`; duplicate slug → 409 `/problems/conflict`. Editor sends `{ name }` only (shared) |
| `POST /decks/{id}/items` | create | `item.create` (owner, maintainer, editor) | body = discriminated union on `type`; `categoryIds` empty/omitted → default category; `status` omitted → `published` (Q1); unknown category id → 400 path `categoryIds` |
| `GET /items/{id}` | edit load | can see item | hidden proposal (not creator, no `item.publish`) → 404 (D96) |
| `PATCH /items/{id}` (`itemPatchSchema`, strict, ≥ 1 field) | edit save | `item.update` + proposal rule | type change → 400 "Item type is immutable"; `payload` validated by `payloadSchemaFor(item.type)` and **replaces** the stored payload; `categoryIds` rewrite keeps categories the caller can't see (`hiddenCategoryIds`); published with 0 categories → 422 `/problems/item-needs-category`; omitted `status` → unchanged (proposal stays `proposed`); returns the updated `Item` |
| `POST /items/{id}/publish` | **not** called by the editor | `item.publish` | publishing stays in the review queue |

Body limits: card `body` ≤ 600 code points, `title` ≤ 120, `payload` ≤ 8192 UTF-8 bytes. These come from the Zod schemas in `@pb/shared`, with DB CHECK constraints as the backstop.

## Problem types (RFC 9457) → editor handling (`editor/problem-fields.ts`)

| Type | Status | Editor shows |
|------|--------|--------------|
| `/problems/validation` | 400 | each `errors[].path` (dotted, e.g. `payload.rows.3.1`) on its field; unknown paths → form-level |
| `/problems/bad-request` | 400 | `errors[].path` on the field (`categoryIds`, `slug` → category input) or `detail` form-level |
| `/problems/item-needs-category` | 422 | "Pick at least one category" on `categoryIds` |
| `/problems/conflict` | 409 | category create: select the existing same-slug category, else `detail` under the input |
| `/problems/constraint-violation` | 4xx | form-level (DB backstop; client checks should have caught it) |
| `/problems/payload-too-large` | 413 | form-level (request-body limit, not the card budget) |
| `/problems/forbidden` | 403 | form-level "You can't edit this card" (uses `permission`/`role` when present) |
| `/problems/not-found` | 404 | whole screen "Card unavailable" (edit load); form-level on save |
| `/problems/unauthorized` / `session-invalid` | 401 | existing session handling (sign-in redirect); draft kept |
| network error / offline | — | "You're offline — your draft is saved on this device" |

Every save failure keeps the draft (FR-014).
