# Data Model: Deck admin screens

No migration. Reads and writes existing tables (`decks`, `categories`, `memberships`).

## DTOs (`@gobbit/shared`)

### `MemberRolePatch` (`schemas/membership.ts`)

`{ role: MemberRole }` (strict)

Response: the updated `Member` (same shape as a `GET /decks/{id}/members` row).

## Labels (`authz/labels.ts`)

| Value | Label | Help text |
|-------|-------|-----------|
| `owner` | Co-owner | Everything except deleting the deck |
| `maintainer` | Maintainer | Edit, publish, manage categories |
| `editor` | Editor | Add and edit cards |
| `reader` | Reader | Read only |
| `private` (visibility) | Admins only | Owners and maintainers |
| `shared` | Members | Everyone in the deck |
| `public` | Everyone | Also strangers, when the deck is public |

## Web state

| Query key | Source | Invalidated by |
|-----------|--------|----------------|
| `['deck', slug]` | `GET /decks/{id}` | deck PATCH |
| `['categories', deckId]` | `GET /decks/{id}/categories` | category PATCH/POST |
| `['members', deckId]` | `GET /decks/{id}/members` | invite, role PATCH, DELETE |

Settings queries are persisted like other deck data (read-only offline); mutations are not queued offline.
