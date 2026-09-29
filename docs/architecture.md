# Architecture — Community Pocketbook Phase 1

## Overview

Community Pocketbook is a monorepo (pnpm) organizing shared logic, persistence, API, and testing into isolated, typed packages.

### Workspace structure

- **`@pb/shared`** (packages/shared): Enums, limits, validation schemas (Zod), and utility functions. Single source of truth for domain constraints. Exports normalized to one entry point.
- **`@pb/db`** (packages/db): Drizzle ORM schema, migrations (drizzle-kit generated + hand-written custom), seeding logic, and database client. Exposes migrations, schema types, test fixtures.
- **`@pb/api`** (apps/api): Hono REST API with OpenAPI documentation. Layered: routes (parse input) → services (rules) → repositories (SQL). Error handling via RFC 9457 Problem+JSON. Dev authentication for Phase 1.
- **`e2e`** (e2e/): Playwright test suite with smoke tests tagged `@smoke`.
- **`@pb/web`** (apps/web): Placeholder for Phase 3 frontend.

All packages are private, ES modules, strict TypeScript. Runtime via `tsx` (no build step). TypeScript source is published as-is, with tsconfig.base.json enforcing `target ES2022, module ESNext, strict` (`noUncheckedIndexedAccess` deliberately off — see ADR-022).

### Key dependencies

Root: typescript 6.0, vitest 5, eslint 10, typescript-eslint 8, prettier 3, tsx 4.
@pb/shared: zod 4.6, mathjs 15.
@pb/db: drizzle-orm 0.45, pg 8.23, uuid 14, drizzle-kit 0.31, @testcontainers/postgresql 12.
@pb/api: hono 4.13, @hono/zod-openapi 1.6, @hono/node-server 2, @sindresorhus/slugify 3.
e2e: @playwright/test 1.63.

TypeScript is held at 6.0 (not 7.x) because typescript-eslint supports `typescript <6.1`. `@types/node` tracks Node 22, the minimum in `engines` and CI.

---

## Data Model

```mermaid
erDiagram
  ACCOUNTS ||--o{ USERS : ""
  ACCOUNTS ||--o{ DECKS : "owner"
  DECKS ||--o{ CATEGORIES : ""
  DECKS ||--o{ ITEMS : ""
  CATEGORIES ||--o{ ITEM_CATEGORIES : ""
  ITEMS ||--o{ ITEM_CATEGORIES : ""
  ITEMS ||--o{ FAVORITES : ""
  USERS ||--o{ FAVORITES : ""
  USERS ||--o{ ITEMS : "createdBy"

  ACCOUNTS {
    uuid id PK
    string name
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at
  }

  USERS {
    uuid id PK
    uuid account_id FK
    string email
    string display_name
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at
  }

  DECKS {
    uuid id PK
    deck_kind kind
    string slug
    string name
    uuid owner_account_id FK
    boolean is_public
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at
  }

  CATEGORIES {
    uuid id PK
    uuid deck_id FK
    string slug
    string name
    category_visibility visibility
    boolean is_default
    integer position
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at
  }

  ITEMS {
    uuid id PK
    uuid deck_id FK
    item_type type
    item_status status
    varchar title
    text body
    jsonb payload
    string source_url
    source_kind source_kind
    timestamptz verified_at
    uuid created_by FK
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at
  }

  ITEM_CATEGORIES {
    uuid item_id FK
    uuid category_id FK
    uuid deck_id FK
    timestamptz created_at
  }

  FAVORITES {
    uuid user_id FK
    uuid item_id FK
    timestamptz created_at
  }

  HEALTH {
    smallint id PK
    string status
    timestamptz created_at
  }
```

### Key design patterns

- **Soft deletes**: All user-facing tables have `deleted_at` timestamp. Queries always filter `WHERE deleted_at IS NULL` unless explicitly archiving.
- **Denormalization**: `item_categories` includes `deck_id` to enable composite FK constraints without a separate join.
- **Unique constraints on slugs**: Partial unique indexes on slug + deck where `deleted_at IS NULL` prevent collisions among active records.
- **Timestamps with millisecond precision**: All `timestamptz` columns use `precision: 3` (JavaScript Date compatibility required for keyset cursors).
- **Invariant triggers**: Database enforces cross-table rules (default category protection, auto-creation, timestamps).

---

## Invariants

| Invariant | Description | Enforced by |
|-----------|-------------|------------|
| **D3: Published item → ≥1 category** | An item with status='published' must have at least one category. | Service `items.create()`, `items.update()` superRefine; service `update()` rejects if result would be published with no categories. |
| **D5: item_categories dual FK** | Each item_category row references both item and category via composite FK, ensuring consistency. | Drizzle schema composite FK with ON DELETE CASCADE. |
| **D6: Empty categoryIds → default** | If item created with no categoryIds, automatically assign default category of deck. | Service `items.create()` after fetching default. |
| **D7: Default category auto-create + protect** | Every deck gets a 'general' default category on insert. Cannot be deleted or have is_default=false. | DB trigger `decks_create_default_category` (INSERT) + `categories_protect_default` (DELETE/UPDATE); unique index `categories_one_default_uq` ensures ≤1 default per deck. |
| **D8: Soft delete for archival** | Deletion sets `deleted_at`, not removing rows. Queries exclude soft-deleted. | All repository `.find*()`, `.list()` include `WHERE isNull(t.deletedAt)`. Service `items.softDelete()`. |
| **D9: Updated-at triggers** | Every update to accounts, users, decks, categories, items sets `updated_at = now()`. | DB trigger `<table>_set_updated_at` BEFORE UPDATE on each table. |
| **D10: Payload schema per type** | Each item type (text, link, image, table, calc) validates payload against strict Zod schema. Payload byte size ≤ 8192 UTF-8; DB enforces ≤ 9216 with check constraint. | `payloadSchemaFor(type)` in `@pb/shared`; service calls `parse()` on PATCH; repository checks bytes; DB check constraint `items_payload_size_chk`. |
| **D12: Item type immutable** | Cannot PATCH an item's type. | Service `items.update()` rejects `'type' in patch` with 400. |
| **D13: Status default published** | Item created with status=null defaults to 'published' and `verified_at = now()`. | `itemCreateSchema` defaults status; service sets verifiedAt. |
| **D14: Pagination keyset cursor** | Cursor encodes (createdAt, id) tuple, limiting result sets. Limit default 20, max 50; >50 rejects. | `limitSchema` in @pb/shared; `itemListQuerySchema`; service `items.list()` decodes, queries with SQL keyset filter. |
| **D15: Favorite idempotence** | Adding/removing favorite twice is safe (no error). | Repository `favorites.add()` uses `onConflictDoNothing`; `favorites.remove()` does not error if missing. |
| **D16: Dev auth gate** | Dev token + X-Dev-User header required for all routes except /health, /openapi.json. Removed Phase 2. | Middleware `devAuth()` uses constant-time comparison, validates email. `DEV_AUTH_ENABLED` environment flag. |
| **D17: Access control (Phase 1)** | Routes only expose user's own decks (owned by their account). 404 for foreign decks. | Service methods call `assertDeckAccess()`, which checks `deck.ownerAccountId === user.accountId`. |
| **D18: Problem schema** | All errors returned as RFC 9457 problem+json with type URL, status, title, detail, and optional field errors. | `Problem`, `ProblemFieldError` schemas in @pb/shared; error handlers in middleware convert Zod, pg, and app errors. |
| **D19: Migration rollback** | `db:rollback` reverses the latest applied migration by running its `.down.sql` and deleting the journal entry. | `rollbackLatest()` in `src/migrations.ts` executes down file in transaction, maps tag from __drizzle_migrations. |
| **D21: E2E smoke tests** | Tagged tests `@smoke` write into 'smoke' deck, all read /health before starting. | Playwright config `testDir: ./tests`, global-setup waits for health + latest migration tag match. |

---

## Layering & Architecture

### Request flow

```
Route (HTTP handler, parses input via Zod)
  ↓
Service (business logic, access control, cascades)
  ↓
Repository (Drizzle SQL, returns Row types)
  ↓
Mapper (Row → DTO, Date → ISO string)
  ↓
HTTP Response (JSON, status code, problem+json on error)
```

### Single source of truth: @pb/shared schemas

All DTOs, constraints, and enums live in @pb/shared:
- **Limits** (CARD_TITLE_MAX=120, CARD_BODY_MAX=600, PAGE_LIMIT_MAX=50, PAYLOAD_MAX_BYTES=8192, etc.)
- **Enums** (deckKinds, categoryVisibilities, itemTypes, itemStatuses, sourceKinds)
- **Validation** (Zod schemas for create/patch inputs, payloads, pagination, problems)
- **Utilities** (UTF-8 byte counting, cursor encoding/decoding, calc expression validation)

Services and repositories import these, ensuring consistency across API, tests, and migrations.

### Route registration

Routes use `@hono/zod-openapi`:
- Input: path params (z.object), query (z.object), JSON body (z.object)
- Output: 200/201 with content schema; 4xx/5xx with `problemSchema`
- Metadata: method, path, security (DevToken + DevUser), description
- Handler: receives validated input, calls service, returns DTO or 404/409/422

Example pattern:
```ts
const route = createRoute({
  method: 'post',
  path: '/decks/{id}/items',
  request: { 
    params: z.object({ id: z.string().min(1) }),
    body: { content: { 'application/json': { schema: itemCreateSchema } }, required: true }
  },
  responses: {
    201: { content: { 'application/json': { schema: itemSchema } } },
    400: { content: { 'application/problem+json': { schema: problemSchema } } }
  },
  security: [{ DevToken: [], DevUser: [] }]
});

app.openapi(route, async (c) => {
  const user = getUser(c);
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');
  const item = await services.items.create(user, id, input);
  return c.json(item, 201);
});
```

### Service layer

Services encapsulate business rules:
- **Access control**: `assertDeckAccess(user, deck, action)` ensures ownership
- **Validation**: call Zod `parse()` on structured inputs (e.g., payload by type)
- **Cascades**: when creating a deck, fetch the default category; when updating an item, maybe recompute isFavorite
- **Soft delete**: use repository methods; service owns the semantics (e.g., `archive()` is idempotent)

### Repository layer

Repositories abstract SQL:
- **Queries exclude soft-deleted**: `where(isNull(t.deletedAt))`
- **Return row types**: `accountId: string | null` if nullable in DB
- **Transactions**: item creation inserts item + item_category rows atomically
- **No business logic**: repositories are thin data accessors

### Mappers

Convert database rows to API DTOs:
- Dates: `Date → ISO string` (via `.toISOString()`)
- Nullable dates: remain `null`
- Extra fields: `categoryIds`, `isFavorite` fetched separately, attached in service
- Type consistency: TS strict mode ensures no `undefined`

---

## Error Format & Status Codes

### RFC 9457 Problem+JSON

All errors (except 5xx) follow the Problem schema:

```json
{
  "type": "/problems/validation",
  "title": "Validation failed",
  "status": 400,
  "detail": "...",
  "errors": [
    { "path": "categoryIds", "message": "Unknown categories" }
  ]
}
```

### Error mapping table

| Scenario | Status | type | title | Detail |
|----------|--------|------|-------|--------|
| Zod parse fails | 400 | /problems/validation | Validation failed | From ZodError |
| Payload exceeds 8192 bytes | 400 | /problems/validation | Validation failed | "Payload exceeds 8192 bytes (UTF-8)" |
| Cursor invalid base64 | 400 | /problems/invalid-cursor | Invalid cursor | "Invalid cursor" |
| Invalid calc expression | 400 | /problems/validation | Validation failed | "Invalid expression: ..." |
| Missing Authorization | 401 | /problems/unauthorized | Unauthorized | "Authentication required" |
| Deck not found | 404 | /problems/not-found | Not Found | "Deck not found" |
| Item not found | 404 | /problems/not-found | Not Found | "Item not found" |
| Route not found | 404 | /problems/not-found | Not Found | "Route not found" |
| Slug already exists (pg 23505) | 409 | /problems/conflict | Conflict | "Resource already exists" |
| Default category protected (pg P0001) | 409 | /problems/default-category-protected | Default category is protected | From constraint |
| Foreign key missing (pg 23503) | 422 | /problems/invalid-reference | Invalid reference | "Invalid reference" |
| Check constraint (pg 23514) | 422 | /problems/constraint-violation | Constraint violation | "Constraint violation" |
| Immutable field (type) in PATCH | 400 | /problems/bad-request | Bad Request | "Item type is immutable" |
| Published item no categories | 422 | /problems/item-needs-category | (custom) | "A published item needs at least one category" |
| 5xx (unhandled) | 500 | /problems/internal | Internal Server Error | (omit internals from response) |

### Error handler middleware

- Catches exceptions during request handling
- `instanceof HttpError`: convert to Problem
- `instanceof ZodError`: convert via `problemFromZodError()`
- `instanceof InvalidCursorError`: 400 /problems/invalid-cursor
- `mapPgError(err)` detects pg codes (23505, 23514, 23503, P0001); non-null → respond with mapped Problem
- All other errors: log with requestId, respond 500 /problems/internal (no stack trace to client)

---

## Pagination

### Keyset cursor pattern

Instead of offset, use the last row's sort key to fetch the next batch:

```ts
// First request: no cursor
GET /decks/{id}/items?limit=20

// Response
{
  "data": [...],
  "nextCursor": "eyJjIjoiMjAyNC0wMS0xNVQxMDozMDowMCswMDowMDAiLCJpIjoiYWJjZC4uLiJ9"
}

// Next request
GET /decks/{id}/items?cursor=eyJjIjoiMjAyNC0wMS0xNVQxMDozMDowMCswMDowMDAiLCJpIjoiYWJjZC4uLiJ9&limit=20
```

### Cursor encoding/decoding

- **Encode**: `Buffer.from(JSON.stringify({ c: isoString, i: uuid })).toString('base64url')`
- **Decode**: base64url → JSON → `{ createdAt: string, id: string }` OR throw InvalidCursorError
- **Format**: `(createdAt, id) < cursor.values (both DESC)`

### Limits

- **Default**: 20 items
- **Max**: 50 items
- **>50 rejected**: request validation fails (400)
- **≤0 rejected**: request validation fails (400)

### Pagination schema

```ts
limitSchema = z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT)
pageSchema<T>(item: T) = z.object({ 
  data: z.array(item), 
  nextCursor: z.string().nullable() 
})
```

---

## Dev Authentication (Phase 1)

### Mechanism

1. **Authorization header**: `Authorization: Bearer <token>`
2. **User header**: `X-Dev-User: <email>`
3. **Bypass paths**: `/health`, `/openapi.json` require no auth
4. **Constant-time comparison**: `timingSafeEqual` prevents timing attacks
5. **Lookup**: call `lookupUser(email)` to fetch `CurrentUser` from database

### Middleware

```ts
devAuth(opts: { token: string; lookupUser: (email) => Promise<CurrentUser | null> })
  → checks Authorization header (constant-time)
  → checks X-Dev-User header
  → calls lookupUser(email.trim().toLowerCase())
  → sets c.set('user', user) or throws unauthorized()
```

### Environment

- **DEV_AUTH_ENABLED**: boolean, default false
- **DEV_API_TOKEN**: string, ≥32 chars when enabled
- **Guard**: app.ts conditionally registers middleware if enabled

### Phase 2 replacement

Dev auth is a Phase 1 scaffold. Phase 2 replaces it with:
- Magic link login (email → token sent)
- JWT tokens
- Session cookies
- `can()` function for granular access (not just ownership)

---

## Migrations & Schema Evolution

### Generation & structure

1. **Generated** by drizzle-kit: `pnpm db:generate` reads schema files in `src/schema/`, outputs SQL to `migrations/`
2. **Hand-written custom**: `migrations/0002_invariants.sql` (triggers, functions, indexes)
3. **Automatic naming**: `0000_health`, `0001_core`, `0002_invariants`, `0003_card_limits`
4. **Down files**: `migrations/down/<tag>.down.sql` for rollback

### Custom migrations: 0002_invariants

- Function `set_updated_at()`: sets `NEW.updated_at = now(); RETURN NEW;`
- Trigger `<table>_set_updated_at`: runs before UPDATE on accounts, users, decks, categories, items
- Function `create_default_category()`: inserts 'general' category
- Trigger `decks_create_default_category`: runs after INSERT on decks
- Function `protect_default_category()`: prevents deletion/modification of default category (raises P0001)
- Trigger `categories_protect_default`: runs before DELETE or UPDATE on categories
- Unique index `categories_one_default_uq`: max one default per deck

### Card limits: 0003_card_limits

Three check constraints on items table:
```sql
check('items_body_len_chk', char_length(body) <= 600)          // CARD_BODY_MAX
check('items_payload_size_chk', octet_length(payload::text) <= 9216)  // PAYLOAD_DB_BACKSTOP_BYTES
check('items_payload_object_chk', jsonb_typeof(payload) = 'object')
```

### Journal & rollback

- `migrations/meta/_journal.json`: drizzle-kit maintains this; each entry: `{ idx, when, tag }`
- **when**: bigint timestamp (ms) of migration creation
- **__drizzle_migrations** table: drizzle auto-creates on first run; stores when and name
- **getLatestMigrationTag**: query `__drizzle_migrations ORDER BY created_at DESC LIMIT 1`, match when to journal entry
- **rollbackLatest**: load down file, run in transaction, delete row from __drizzle_migrations

### Health endpoint

`GET /health` returns:
```json
{
  "ok": true,
  "db_ms": 2,
  "migration": "0003_card_limits"
}
```

Exposing the latest migration tag helps e2e tests confirm the DB is in the expected state before starting.

---

## Seeding

### Deterministic UUIDs (uuid v5)

```ts
const SEED_NAMESPACE = '6f1c2b1e-4a53-4b8e-9d5e-2a7c9f0e1b3d'
const seedId = (key: string) => v5(key, SEED_NAMESPACE)
```

Seeding the same database always produces the same IDs, making tests predictable.

### Seed data structure

**buildSeedData(devEmail)**:
- Accounts: `seedId('account/dev')` (Dev Household), `seedId('account/other')` (Other Household)
- Users: `seedId('user/dev')` (dev@example.test, Dev User), `seedId('user/other')` (other@example.test, Other User)
- Decks: `seedId('deck/<slug>')` for dev-personal, family, smoke, other-personal (all isPublic false)
- Categories: `seedId('family/<slug>')` for school, health, food, admin, home, fun (only in family deck)
- **Never manually inserts 'general'** — the DB trigger creates it

### Card seed

**seedCards[]**: 25 published + archived items with keys like `seedId(card.key)`:
- 23 published + 2 archived
- 12 published in 'food' category
- 2 table-type items
- 1 calc-type item
- 1 favorited by dev
- Multiple languages (he, el, en)

### Idempotency & prod safety

- Seed runs via `runSeed(pool, opts)`, idempotent (insert or ignore)
- Never runs in production (guard via environment check)
- Useful for local dev, testing, CI/CD

---

## Test Pyramid

### Unit tests

Location: `**/*.test.ts` (next to source)  
Environment: Node  
Test data: mocked/inline  
Examples:
- `@pb/shared/src/schemas/pagination.test.ts`: cursor encoding, Zod parse
- Service unit tests with mocked repos

### Integration tests

Location: `**/*.int.test.ts` (under `test/`)  
Environment: Node + Docker (Testcontainers PostgreSQL)  
Test data: seeded via `runSeed()`  
Examples:
- Repository tests (actual SQL via Drizzle)
- Service tests calling real repos
- API route tests via `setupApiTest()`

**Test isolation**: Each test gets a fresh DB cloned from `template_pb`:
1. Global setup: creates template DB with all migrations
2. Per-test: `withTestDb()` clones template (fast), runs test, drops clone

### E2E tests (smoke)

Location: `e2e/tests/smoke/*.spec.ts`  
Environment: Playwright  
Base URL: `http://localhost:3000` (or BASE_URL env)  
Tagging: every test title includes `@smoke`

**Pre-test**: global-setup waits for `/health` to report `ok=true` and migration tag matching the latest journal entry.

**API helpers**:
- `test.extend({ api, scratch })`: api = request context, scratch tracks item IDs for cleanup
- `ctx.as(email)`: returns auth headers for dev token + dev user

---

## Architecture Decision Record

### ADR-001: Millisecond-precision timestamps for keyset cursors

**Decision**: All `timestamptz` columns use `precision: 3`.

**Rationale**: JavaScript `Date` is millisecond-based. Keyset pagination encodes `(createdAt, id)` in the cursor. If DB precision is microsecond but JS rounds to ms, the cursor may round-trip incorrectly, causing duplicates or gaps. Fixing precision at ms guarantees accurate serialization.

---

### ADR-002: Vitest test.projects instead of vitest.workspace

**Decision**: Root `vitest.config.ts` defines two test.projects (unit, integration) instead of separate workspace packages.

**Rationale**: 
- Simpler coverage thresholds (one config applies to all)
- Integration tests can safely use globalSetup (Testcontainers) without interfering with unit tests
- Single command `pnpm test` runs all; `pnpm test:unit` or `pnpm test:int` filters by project
- FileParallelism=false for integration tests (sequential DB access); unit tests run in parallel

---

### ADR-003: TypeScript source exports, no build step

**Decision**: Packages export `.ts` files directly from `src/`, evaluated at runtime via `tsx`.

**Rationale**:
- Faster iteration: change src, tests pick it up immediately
- Single source of truth: no divergence between src and build output
- Simpler tooling: no tsconfig build path mappings, no esbuild config
- Type checking: `tsc --noEmit` validates syntax; runtime safety from Zod at boundaries

**Trade-off**: Slightly slower runtime (tsx transpiles on-the-fly), acceptable for Phase 1 API server; Web frontend (Phase 3) will bundle.

---

### ADR-004: 404 for foreign decks, not 403

**Decision**: When a user accesses a deck they don't own, return 404 (not found), not 403 (forbidden).

**Rationale**:
- Doesn't leak information about which resources exist
- Consistent with "access control as query filter" pattern (repository only sees user's own data)
- Phase 2 can refine to shared/public decks; 404 still applies to truly private ones

**Implementation**: `assertDeckAccess()` throws `notFound()` on mismatch.

---

### ADR-005: Soft deletes via `deleted_at` timestamp

**Decision**: Never physically remove rows; set `deleted_at = now()`.

**Rationale**:
- Audit trail: can query deleted items if needed
- Foreign key safety: references don't break if a category is deleted
- Reversible: undelete possible (though not exposed in Phase 1 API)
- Compliance: supports data retention policies

**Query pattern**: All reads include `WHERE deleted_at IS NULL`.

---

### ADR-006: Denormalized deck_id in item_categories

**Decision**: `item_categories` table includes `deck_id` even though it's redundant (reachable via itemId → items → deckId).

**Rationale**:
- Enables composite foreign key: `FK(itemId, deckId) → items(id, deckId)`
- Prevents a bug where an item_category references an item in a different deck
- Marginal storage cost, significant constraint benefit

---

### ADR-007: Default category auto-created and protected

**Decision**: Every deck gets an automatic 'general' category on insert. Cannot be deleted or modified to `is_default=false`.

**Rationale**:
- UX: users always have at least one category to tag items
- Safety: avoids "item with no categories and status=published" edge case
- Database enforces via trigger + unique index, not app logic

**Cascade exception**: When deck is deleted, the trigger cleanup is allowed (pg_trigger_depth > 1 check).

---

### ADR-008: Payload validation in @pb/shared, re-validated on PATCH

**Decision**: `payloadSchemaFor(type)` lives in @pb/shared. Service re-validates payload on PATCH.

**Rationale**:
- Schema is single source of truth for all consumers (API, tests, migrations)
- PATCH may not provide type (immutable), so service must know which schema applies
- Validation failure → 400, not 422 (matches Zod error convention)

---

### ADR-009: Limit >50 rejects, doesn't clamp

**Decision**: `limitSchema` rejects values >50 with a validation error, never silently reduces.

**Rationale**:
- Explicit: client knows the constraint
- Prevents accidental large result sets (DoS risk)
- Encourages clients to paginate properly

---

### ADR-010: RFC 9457 Problem+JSON for all errors

**Decision**: API always returns error responses as `application/problem+json` with type, status, title, detail, errors.

**Rationale**:
- Standardized: clients can parse error details uniformly
- OpenAPI: schema documented in /openapi.json
- Field errors: Zod validation failures list path + message for each field
- Type URL: clients can decide action (409 /conflict ≠ 422 /constraint-violation)

---

### ADR-011: Migration rollback via .down.sql

**Decision**: Each migration can be rolled back; down file executed in a transaction, then journal entry deleted.

**Rationale**:
- Not every migration is reversible (data loss possible), but metadata changes (add column) are
- Hand-written down files are explicit, not auto-generated (forces thinking)
- Single transaction: either fully rolls back or fails atomically
- Emergency recovery: can revert to prior schema without manual intervention

---

### ADR-012: Seed with uuid v5 namespace

**Decision**: Deterministic IDs via `v5(key, SEED_NAMESPACE)`.

**Rationale**:
- Reproducible: same seed produces same IDs every run
- Testable: e2e can assert on hardcoded IDs like `seedId('deck/family')`
- No collisions: different keys hash to different IDs
- Never in production: seed only used in dev/test (guarded by env check)

---

### ADR-013: Pagination cursor encodes (createdAt, id)

**Decision**: Keyset cursor is base64url-encoded JSON: `{ c: isoString, i: uuid }`.

**Rationale**:
- Immutable sort: createdAt + id is unique, immutable per-row
- Doesn't count results: scales to large tables
- Works with DESC order: clients naturally iterate forwards in time
- Human-readable when decoded

**Alternative considered**: Offset pagination (simple, bad for large tables).

---

### ADR-014: Calc expression validation with mathjs walk, no evaluation

**Decision**: `validateCalcExpression()` parses expression tree, walks nodes to check allowed functions/symbols. Never evaluates.

**Rationale**:
- Safety: code evaluation is a security risk
- Deterministic: validation is stable (no random number gen affecting outcome)
- Error messages: can report specific disallowed functions
- Phase 2: server-side evaluation can safely use validated expressions

---

### ADR-015: Item type immutable, idempotent favorites

**Decision**: PATCH rejects if `'type' in patch` (400 bad-request). Favorite add/remove is idempotent.

**Rationale**:
- Type change would require payload migration (complex), so forbid it
- Idempotence: `POST /items/{id}/favorite` twice is safe (onConflictDoNothing), `DELETE` twice is safe (no error on missing)
- Phase 2: if client retries a request, idempotence prevents duplicates

---

### ADR-016: Dev auth middleware with constant-time comparison

**Decision**: Dev token validated via `timingSafeEqual`, length checked first. Removed in Phase 2.

**Rationale**:
- Timing attack resistance: attacker can't infer token char-by-char from timing
- Phase 1 scaffold: simple bearer + header, no sessions, no magic links
- Secure default: even in dev, follow crypto best practices
- Bypass list: /health and /openapi.json for liveness/discovery

---

### ADR-017: Access control in service layer

**Decision**: `assertDeckAccess(user, deck, action)` checks ownership. Called by every service method that touches a deck.

**Rationale**:
- Centralized: consistent policy across routes
- Fail-safe: throws 404 not found (doesn't expose existence)
- Extensible: Phase 2 can add `can()` granularity (read vs write, shared decks)

---

### ADR-018: Problem schema with optional field errors, pg error mapping

**Decision**: `Problem` includes optional `errors: ProblemFieldError[]`. `mapPgError()` detects constraint codes and returns mapped Problem.

**Rationale**:
- Field errors: Zod validation can report path + message per field
- Pg error mapping: 23505 (unique) → 409, 23514 (check) → 422, P0001 (custom) → varies
- No SQL leakage: error message sanitized, constraint name omitted from response

---

### ADR-019: Migration journal↔__drizzle_migrations sync

**Decision**: `migrations/meta/_journal.json` is the source of truth. `__drizzle_migrations` table is drizzle's internal state. `getLatestMigrationTag()` matches `when` (ms) between them.

**Rationale**:
- Drizzle creates __drizzle_migrations; we can't control its schema
- Journal is our integration point: stable, human-readable
- Matching on timestamp: every migration is timestamped, can find it in both places
- Rollback: deletes from __drizzle_migrations, doesn't touch journal (audit trail)

---

### ADR-020: Testcontainers PostgreSQL with template DB cloning

**Decision**: Global setup creates `template_pb` with all migrations. Each test clones it. Integration tests in isolation, fast.

**Rationale**:
- Parallelizable: tests can run independently (each has own DB)
- Fast: clone is faster than rerunning migrations per-test
- Reliable: clean slate per test (no test-to-test pollution)
- Scalable: CI can use `-j` to run tests in parallel

---

### ADR-021: Smoke tests with @smoke tag and health wait

**Decision**: E2E tests tagged `@smoke` write only to 'smoke' deck. Global setup waits for `/health` ok=true + migration tag match.

**Rationale**:
- Isolation: smoke tests use dedicated deck (don't interfere with other tests)
- Readiness: wait for health ensures DB migrations are done before tests start
- Reproducible: tag makes `pnpm test:e2e --grep @smoke` work

---

### ADR-022: Toolchain notes from the Phase 1 build

**Decisions**:
- **pnpm 11 build approval** uses the `allowBuilds:` map in `pnpm-workspace.yaml` (esbuild allowed; cpu-features, protobufjs, ssh2 denied). `onlyBuiltDependencies` is not honoured by pnpm 11.
- **Vitest `test.projects`** in the root `vitest.config.ts` replaces the deprecated `vitest.workspace` file.
- **Root devDeps for integration globalSetup**: `@testcontainers/postgresql`, `testcontainers`, `pg`, `drizzle-orm` are also declared at the root. Vitest resolves bare imports in a project's `globalSetup` from the workspace root, not the importing package.
- **`noUncheckedIndexedAccess` off**: it produced ~100 noise errors on array/row access across tests and repos. Row lookups rely on explicit guards (`if (!row) throw notFound()`).
- **HTTP error helpers return** an `HttpError` and callers `throw` them (`throw notFound()`), so control flow is visible to TypeScript.
- **pg pool `error` listener** in `createPool`: idle clients killed server-side (restart, `DROP DATABASE ... WITH (FORCE)`) would otherwise surface as an uncaught exception. `57P01` is ignored, everything else is logged.

---

### ADR-023: Open-source repository hygiene

**Decisions**:
- **Private notes stay local**: `plans/` (personal planning docs) and `docs/thrifty/` (AI build artifacts: prompts, per-sprint cost manifests) are gitignored. The public roadmap is the neutral `PLAN.md`.
- **No personal data in fixtures**: seed data and tests use `example.test` emails and generic households only.
- **CI on GitHub-hosted runners**: `ci.yml` runs on `ubuntu-latest` so fork PRs never execute on a private machine. `smoke.yml` (main only, targets the deployed API) picks its runner from the `SMOKE_RUNNER` repo variable, defaulting to `ubuntu-latest`, and is skipped while `API_BASE_URL` is unset. Actions are pinned to their latest major tags (Node 24 runtime); pnpm comes from `packageManager`, Node from `.nvmrc`.
- **E2E env resolution** (`e2e/lib/env.ts`): GitHub passes unset vars/secrets as empty strings, so blank values are treated as unset; `BASE_URL` must be an http(s) URL, and a missing one fails fast under `CI`.
- **Standard community files**: `CONTRIBUTING.md`, `SECURITY.md` (GitHub private vulnerability reporting, no personal email), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), issue and PR templates.
- **License: MPL-2.0** (file-level copyleft): changes to project files are shared back, while the code can still be combined with proprietary code. Root `LICENSE` holds the full text; every `package.json` declares `"license": "MPL-2.0"`.
- **`"private": true` stays** in every `package.json`: it only blocks accidental npm publishing of this app monorepo.

---

## Summary

Community Pocketbook Phase 1 is a layered REST API with OpenAPI documentation, dev authentication, and comprehensive error handling. Data lives in PostgreSQL with invariants enforced at multiple levels (Zod schemas, database triggers, service checks). Pagination uses keyset cursors for stability. Seeding is deterministic and idempotent. Testing spans unit (mocked), integration (Testcontainers), and e2e (Playwright smoke). Migrations are versioned with rollback support. Architecture emphasizes single source of truth (@pb/shared), type safety (strict TypeScript), and explicit error codes (RFC 9457). Phase 2 will replace dev auth with magic links, add shared/public decks and granular `can()` checks, and introduce the web frontend.
