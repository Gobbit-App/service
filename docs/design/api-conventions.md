# API conventions: layering, errors, logging, pagination

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

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
- Metadata: method, path, security (`AUTH_SECURITY` = `SessionCookie` or `BearerToken`), description
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
  security: AUTH_SECURITY
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
- **Access control**: `authorize(user, deck, permission, memberships)` resolves the role and asserts the permission
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
| PATCH archived → published (Phase 6, D131) | 409 | /problems/use-restore | Conflict | Points to `POST /items/{id}/restore` |
| Archive/restore a proposal (D131) | 409 | /problems/invalid-transition | Conflict | "A proposal can't be archived/restored; …" |
| Undelete after 30 days (D132) | 410 | /problems/undo-expired | Gone | "Deleted cards can be brought back for 30 days" |
| `?status=deleted` without `item.delete` (D132) | 403 | /problems/forbidden | Forbidden | Names the permission |
| 5xx (unhandled) | 500 | /problems/internal | Internal Server Error | (omit internals from response) |

### Error handler middleware

- Catches exceptions during request handling
- `instanceof HttpError`: convert to Problem
- `instanceof ZodError`: convert via `problemFromZodError()`
- `instanceof InvalidCursorError`: 400 /problems/invalid-cursor
- `mapPgError(err)` detects pg codes (23505, 23514, 23503, P0001); non-null → respond with mapped Problem
- All other errors: log with requestId, respond 500 /problems/internal (no stack trace to client)
- Request log (`middleware/request-log.ts`): one JSON line per request, `{"component":"http","msg":"request","requestId","method","path","status","durationMs"}`, at `error` for 5xx, `warn` for 4xx and `info` otherwise. It is registered first, so CSRF rejections are logged too. The query string is never logged (search text stays out of logs), `/health` is skipped, and it is off when `NODE_ENV=test`.

### Logging

The API and the worker write JSON lines to stdout through pino (`lib/logger.ts`). Each line is `{"level":"info","time":"<ISO>","component":"<area>","msg":"…", …fields}`, and errors go under `err` (`type`, `message`, `stack`, `code`). Modules take a child logger (`childLogger('media')`). The older string sinks (`log(message, err?)` deps used by mailers, queues and services) default to `lineSink(component, level)`, which writes the same JSON shape, so tests still inject plain functions. `@pb/db`'s idle-client error handler writes one JSON line by default, and the API and worker pass `logDbIdleError`. `LOG_LEVEL` (`trace`…`fatal`, `silent`) defaults to `info`, or `silent` under Vitest. Filter with `jq`, e.g. `docker logs <api> | jq 'select(.level=="error")'`.

### Decision events

Constitution VIII and ADR-060 require a record for every decision the service makes about a person, their content or their experience. That record is a decision event, written next to the request line.

| Field | Rule |
|-------|------|
| `event` | Stable name `<area>.<decision>`, lower case, e.g. `waitlist.join`, `auth.magic_link`, `rate_limit.refused`. A rename is a breaking change for dashboards and alerts. |
| `outcome` | Closed set per event (`accepted`, `refused`, `dropped`, `sent`, `failed`, …), declared as a const array in code |
| `reason` | Closed set, present whenever `outcome` isn't the happy path (`per_ip`, `per_email`, `honeypot`, `existing_user`, …) |
| `requestId` / `jobId` | Always present. `requestId` comes from `middleware/request-id.ts`, `jobId` from pg-boss. |
| `actorId` | The user id when a signed-in person or an admin caused the decision |
| subjects | Ids (`entryId`, `deckId`, `itemId`) or a keyed hash (`emailHash`, `ipHash`). Never a raw email, IP address, query text or card content. |

- **Level**:
  - `info` for expected outcomes, refusals included;
  - `warn` for outcomes an operator should look at in aggregate;
  - `error` only for failures.
- **Audit rows**: a change to durable data also writes an audit row in the same transaction (ADR-057). The log event is then the cheap signal and the row is the reviewable record.
- **Plans**: each plan's Accountability table lists its events and how each is watched:
  - **instance**: alert on one occurrence, e.g. an admin action or a failure;
  - **aggregate**: count per window by `outcome`/`reason`;
  - **rate**: share of all outcomes, or an average such as a duration, compared with its baseline.

  The table gives default alert thresholds. Tests assert each event through an injected logger or a pino destination stream.
- **Reading until a monitoring backend exists**: `docker logs <api> | jq -c 'select(.event=="waitlist.join") | {outcome, reason}' | sort | uniq -c`.

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
