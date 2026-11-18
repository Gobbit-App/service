# Data model: Self-contained e2e

No database change and no migration. These are the test-side entities from the spec, as they exist in code.

## Stack (one per run)

| Field | Rule |
|-------|------|
| `project` | `gobbit-e2e-<epoch base36>-<4 random [a-z0-9]>`; unique per run; the embedded time is what the reaper reads |
| `webPort`, `mailboxPort` | two distinct free loopback ports chosen by the runner before `up` |
| `webUrl` | `http://127.0.0.1:<webPort>`; the same origin is `APP_URL`, and `API_URL` is `<webUrl>/api` |
| `mailboxUrl` | `http://127.0.0.1:<mailboxPort>` (Mailpit REST) |
| lifetime | created by the runner, removed by the runner (`down -v --remove-orphans`); never reused |

## Stack file (`e2e/.stack/stack.json`)

Written by the runner after the stack is healthy, deleted at teardown. Shape in
[contracts/stack-file.md](./contracts/stack-file.md). Read only through `e2e/lib/stack.ts`.

## Test user (one per test)

| Field | Rule |
|-------|------|
| `email` | `<tag>-<8 random chars>@example.test`, lowercase; used once |
| `api` | `APIRequestContext` holding the `gobbit_session` cookie obtained by following the real magic link |
| `storageState` | the same cookie, for new browser contexts |
| `profile` | `GET /me` result at sign-in (id, personal deck slug) |
| lifetime | exists only in the disposable database; no cleanup required |

## Test member

A test user plus `deckSlug` and `role` (`owner` | `maintainer` | `editor` | `reader`, the roles in
`@gobbit/shared/authz`). Created by: owner invites the new address by email → member opens the invite
mail's link in their own context. Returned `api` and `context` are separate from the owner's.

## Mailbox message

Mailpit's JSON for one message: recipient, subject, text. The only fields the tests use are the recipient
list (to pick *their own* messages, FR-010), `Subject`, and the first `/auth/callback?token=…` link in the
text body. Messages are never deleted by tests; the stack is discarded.

## Stack constants (`e2e/lib/stack-config.ts`)

| Constant | Value rule |
|----------|-----------|
| `PROJECT_PREFIX` | `gobbit-e2e-` |
| `STALE_AFTER_MS` | 2 hours |
| `CLOUDINARY_DUMMY` | `{ cloudName: 'e2e-cloud', apiKey: 'e2e-key', apiSecret: <label "dummy, e2e only"> }` |
| `ADMIN_EMAIL` | one `@example.test` address written to the stack's `PLATFORM_ADMINS` |
| `EMAIL_DOMAIN` | `example.test` |
| `TIMEOUTS` | stack up 300 s, health 120 s, mail wait 10 s |

## Post-deploy probe result

Not stored. One line per check (`ok` or `FAIL <name>: <reason>`) on stdout; exit 0 only if all pass.
