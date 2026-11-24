# Implementation Plan: Invite by link

**Branch**: `052-invite-by-link` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 16 item 7 (`community-go-list.md` H12)

**Input**: Feature specification from `/specs/052-invite-by-link/spec.md`

This is the project's override of the core template. It is written for outside readers, because the repository is public.

## Summary

The plan adds one new table, one new service and one new field on sign-in. An owner gets a single-use link that invites without signing anyone in.

- **Link invites** (D466, D467): `deck_invite_links` holds the reference name, a role (never owner, enforced by a DB CHECK), the creator, the expiry (`INVITE_TTL_DAYS`) and the end state. The state is derived from timestamps. The token is stored as is so an owner can share the same link again, which is a recorded departure from hash-only tokens.
- **The URL** (D468): `/s/invite?t=<token>`. The token travels only in query strings and bodies, never in a path, because request logs record paths.
- **Preview and invite page** (D469, D470):
  - The preview is a no-JS Open Graph page built with the existing `renderSharePage()`. It shows the deck name, the inviter's shown name and the role only while the link is waiting; in any other state it is generic.
  - The SPA `/join` page reads `GET /public/invites?t=`.
  - Both are rate-limited per IP.
- **Join** (D471): `POST /invite-links/accept`. One transaction locks the link, re-checks it, then creates the membership, or accepts the person's pending one with the link's role. Exactly one person wins.
- **A brand-new person** (D472):
  - The sign-in form on the invite page sends the token along.
  - For an address with no account and a waiting link, the sign-in mail carries the invite past the waitlist.
  - Opening that mail registers the person (`deck_invite`, by the inviter) and joins them, atomically. One link can never register two people.
  - People who already have an account get a plain sign-in mail and tap Join on return.
- **Stops working** (D473, D474): the link stops when it is accepted, revoked or expired, when its inviter is no longer an owner, or when the deck is gone. Checks run at read time, with no sweep and no triggers.
- **Owners** (D475, D476): create, list, share and revoke in the deck's members settings, behind the existing `member.invite` permission. The cap is `INVITE_LINKS_WAITING_MAX` (default 10). Share uses the share sheet, with a prefilled message, or the clipboard.
- **Accountability**: a new decision-event family, `invite_link.create`, `.open`, `.join` and `.revoke`. Registration is still recorded by `users.register`. A new callback reason, `invite_gone`, covers a link that stopped while the person was signing in. Shares are a consent-gated analytics event.

## Starting point

- `origin/main @ b693e33` (#188, after 051 member email privacy, #187). This branch carries only the 052 spec docs.
- The latest migration is `0029_invited_by_email`, so this feature adds `0030_deck_invite_links`.
- It builds on:
  - deck invites and the registration gate (D222–D224, D241);
  - share previews `/s/:itemId` (D192–D199);
  - anonymous rate limiting (ADR-056, D175);
  - member summaries and shown names (046 and 051: D417–D429, D459–D465).
- Next free ids: D466 and ADR-085. Not deployed.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22; React 19

**Primary Dependencies**: existing only. No new dependency.

**Storage**: PostgreSQL 17. There is one new table, `deck_invite_links`, and one new column, `magic_links.invite_link_id` (see `data-model.md`).

**Testing**: Vitest unit and integration (Testcontainers), and Playwright `@smoke`.

**E2E tier**: smoke. Joining a deck is a critical journey that crosses a deployment boundary: Caddy `/s/*`, the API HTML, the SPA and the sign-in mail. The spec also fixes the tier as smoke. One journey: an owner creates a link, a second user opens it and joins, lands on the deck, and a second use is refused.

**UI reference**:

| New UI | Sibling it copies | Layout |
|--------|-------------------|--------|
| "Invite by link" form in Members | `deck-admin/InviteForm.tsx` | name field + role select + submit in the same `.field-group` / action row |
| Link invite rows | pending rows in `MembersSection.tsx` (`MemberRow`) | same row layout; primary line = reference name, secondary = role · state · expiry or "accepted by" + avatar; Share and Revoke via `ui/buttons` |
| Share button | `ui/ShareButton.tsx` | same `IconButton` + toast ("Copied", "Couldn't share") |
| `/join` invite page | `routes/auth.error.tsx` (centred status card) with `ui/SignInForm.tsx` for the signed-out email form | title = deck name, one line inviter and role, a primary Join button; "Signed in as …" line in the secondary text style |
| `invite_gone` message | the existing `closed` copy in `lib/auth-error-copy.ts` | same screen and waitlist form |

**Target Platform**: Docker Compose on Dokploy. The PWA runs on Android Chrome and iOS Safari, and both have a share sheet.

**Project Type**: pnpm monorepo: API + worker, PWA, shared packages.

**Performance Goals**: N/A. The writes are rare, and each read is one indexed lookup by token.

**Constraints**:
- The web initial bundle stays at or under 150 KB gzip. The `/join` page and the deck-admin additions are route chunks.
- Same origin.
- No address in any invite-link answer (FR-015).
- Tokens never appear in logs, analytics or `Referer` headers.

**Scale/Scope**: up to `INVITE_LINKS_WAITING_MAX` waiting links per deck, for family and community decks.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `routes/invite-links.ts` parses, `services/invite-links.service.ts` decides, and `repositories/invite-links.repo.ts` holds the SQL. Owner routes use `authorize()` + `can('member.invite')`. Join and callback use `resolveRole`. |
| II. One source of truth for contracts | Every DTO is in `@gobbit/shared/schemas/invite-links.ts`, the limits in `@gobbit/shared` limits, and the `invite-shared` event in `analytics/events.ts`. `pnpm api:openapi` regenerates the client. |
| III. Invariants live in the database | Migration `0030` has a hand-written down file. CHECKs enforce: the role is never owner, accepted and revoked are mutually exclusive, the acceptor columns are set only with `accepted_at`, the name length, and `invite_link_id` only on `sign_in` links. The token is unique. Single use is enforced by a row lock inside one transaction (D471). |
| IV. Private by default | The anonymous routes go through one service method that returns only deck name, inviter shown name and role, and only while the link is waiting (D469, D470). Credentials are ignored on `/public/*`, and the anonymous per-IP limit applies on `/public/*` and `/s/invite`. Opening a link writes nothing (FR-005). Tokens stay out of paths (D468). |
| V. Tests at the right tier | Unit tests cover the service rules, the schemas and the share helper. Integration tests cover the routes, the concurrent Join, the callback registration and the DB CHECKs. One `@smoke` journey covers the critical path. See the traceability table below. |
| VI. Lean, offline-first web | No new dependency. `/join` is a lazy route. Invite-link queries are owner-only settings data, cached like members. `/join` reads are not persisted, because their state changes. |
| VII. Simple, optional, deployable | There is one new optional env var, `INVITE_LINKS_WAITING_MAX`, with a default. It needs no AI and no new service. The deploy is the normal flow. |
| VIII. Accountable by default | Every decision has an `invite_link.*` event or the existing `users.register` / `auth.*` events (Accountability below). Events carry ids and keyed hashes only, never tokens or addresses. The cap is env-tunable. |
| IX. Reuse before writing | The plan reuses `renderSharePage`, `PRIVATE_OG_IMAGE_PATH`, `publicRateLimit` and `anonLimit`, `generateToken`, `resolveRole`, `member.invite`, `users.register('deck_invite')`, `magicLinks.expireUnusedForMembership`, `member-summaries`, `lib/share` and `SignInForm`. See Pruned below. |
| X. One UI system | The UI reference is filled in above. The plan uses tokens and `ui/` primitives only. Every UI task needs phone and desktop screenshots, light and dark, compared with its sibling. |

Post-design re-check: still passes. The raw-token departure (D467) is a recorded decision under IV and does not violate it: the token grants no identity, is single use and never grants owner.

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D466 | `deck_invite_links` table; state derived from timestamps; `CHECK (role <> 'owner')` | yes → ADR-085 |
| D467 | Token stored as is (not hashed) so the same link can be shared again; departure from hash-only tokens limited to this table | yes → ADR-085 |
| D468 | Token only in query strings and bodies (`/s/invite?t=`, `/join?t=`, `/public/invites?t=`, accept body), never in a path | yes → ADR-085 |
| D469 | Chat preview = `renderSharePage()` at `/s/invite`, `no-store` + `no-referrer`, generic unless waiting, rate-limited | no |
| D470 | Invite page reads `GET /public/invites?t=`: state + deck name, inviter, role only while waiting; misses look alike | no |
| D471 | Join = one transaction with the link row locked; re-checks; accepts a pending membership with the link's role | no |
| D472 | A brand-new person's sign-in mail carries the invite past the waitlist and joins them at the callback; existing accounts tap Join; new callback reason `invite_gone` | yes → ADR-085 |
| D473 | A link is `invalid` when its creator no longer resolves to owner or the deck is gone or personal; checked at read time | no |
| D474 | Expiry recorded as `refused · expired` when met; no sweep | no |
| D475 | `INVITE_LINKS_WAITING_MAX` (default 10), counted under a deck row lock | no |
| D476 | Owner list (waiting + ended within `INVITE_TTL_DAYS`), revoke, share with prefilled text via `lib/share`; `invite-shared` content event | no |

## Project Structure

### Documentation (this feature)

```text
specs/052-invite-by-link/
├── spec.md               # /speckit-specify + /speckit-clarify (+ D472 refinement)
├── plan.md               # this file
├── research.md           # D466–D476
├── data-model.md         # table, column, accept transaction, DTOs, limits
├── contracts/invite-links.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/deck-invite-links.ts          # new table
├── src/schema/magic-links.ts                # + invite_link_id
└── migrations/0030_deck_invite_links.sql (+ down/)

packages/shared/src/
├── schemas/invite-links.ts                  # DTOs (new)
├── schemas/auth.ts                          # magicLinkRequestSchema + invite
├── limits.ts                                # INVITE_LINKS_WAITING_MAX_DEFAULT, INVITE_LINK_NAME_MAX
└── analytics/{events,screens}.ts            # invite-shared; /join and /s/invite patterns

apps/api/src/
├── env.ts                                   # INVITE_LINKS_WAITING_MAX
├── repositories/invite-links.repo.ts        # new: create (deck lock + count), list, revoke, findByToken, accept tx
├── services/invite-links.service.ts         # new: create/list/revoke/preview/accept
├── services/invite-links.events.ts          # new: event names, outcomes, reasons
├── services/auth.service.ts                 # requestMagicLink(invite), consume → register + accept
├── services/auth.events.ts                  # CALLBACK_REASONS + invite_gone; magic_link via
├── routes/invite-links.ts                   # new: owner routes, accept, GET /public/invites
├── routes/share.ts                          # GET /s/invite (before /s/:itemId)
├── routes/auth.ts                           # pass invite through
└── app.ts                                   # mount routes; publicRateLimit on /s/invite
apps/api/test/invite-links.int.test.ts       # new

apps/web/src/
├── lib/share.ts                             # shareItem({ url, title, text? })
├── lib/auth-error-copy.ts                   # invite_gone
├── deck-admin/InviteLinkForm.tsx            # new (sibling InviteForm)
├── deck-admin/InviteLinks.tsx               # new: list rows + Share/Revoke
├── deck-admin/MembersSection.tsx            # mount both for owners
├── deck-admin/deck-admin-queries.ts         # invite-link queries/mutations
├── invites/JoinScreen.tsx                   # new
└── routes/join.tsx                          # new lazy route

e2e/tests/smoke/invite-link.spec.ts          # new @smoke
```

**Structure Decision**:
- API: a new route, service and repository triple, plus changes to the auth service, the share route and `app.ts`.
- Web: two deck-admin components, one screen and one route.
- Shared: schemas, limits and analytics.
- DB: one migration.
- No worker change.

## Invariant → test traceability

| Invariant / rule (spec FR or D-number) | Enforced in | Test (file, tier) |
|----------------------------------------|-------------|-------------------|
| FR-001 only owners of shared/communal decks create; personal refused | route `can('member.invite')`, service kind check | `invite-links.int.test.ts`, int |
| FR-002 never owner | schema enum + DB CHECK | `invite-links.test.ts` (shared), unit; CHECK in `invite-links.int.test.ts`, int |
| FR-003 same link again | list returns `url` while waiting | `invite-links.int.test.ts`, int; `InviteLinks.test.tsx`, unit |
| FR-003 share sheet / copy with text | `lib/share.ts` | `share.test.ts`, unit |
| FR-004 cap, env-tunable | service under deck lock (D475) | `invite-links.int.test.ts` (limit 2), int |
| FR-005 / SC-004 opening writes nothing | GET routes read only | `invite-links.int.test.ts` (row counts before/after), int |
| FR-006 / SC-005 only deck name, inviter, role | `invite-links.service.preview`, `/s/invite` | `invite-links.int.test.ts` (deck with private card; scans HTML/JSON for card title, category, name, `@`), int |
| D468 token never in a path or log | routes, request log | `invite-links.int.test.ts` (captured log lines contain no token), int |
| FR-007 / FR-012 sign in from page | `/join` + `SignInForm` with `invite` | `JoinScreen.test.tsx`, unit; smoke journey |
| FR-008 / SC-003 single use, concurrent | accept tx `FOR UPDATE` (D471) | `invite-links.int.test.ts` (two parallel accepts → one 200, one 409 used), int |
| FR-009 revoked / expired / inviter not owner / deck gone | service checks (D473) | `invite-links.int.test.ts`, int |
| FR-010 already member → link stays waiting | accept tx step 4 | `invite-links.int.test.ts`, int |
| FR-011 registers ≤ 1, none once stopped | callback tx (D472) | `auth.int.test.ts` (two new addresses through one link; stopped link → `invite_gone`, no user), int |
| FR-011 registered via deck_invite by inviter | `users.register` | `auth.int.test.ts`, int |
| FR-013 owners see links; others don't | `member.invite`; DTO | `invite-links.int.test.ts` (editor → 403), int |
| FR-014 revoke | service | `invite-links.int.test.ts`, int |
| FR-015 no addresses | `inviteLinkSchema` uses `MemberSummary` | `invite-links.int.test.ts` (answer scan for `@`), int |
| FR-016 / FR-017 everything else unchanged | — | existing `members` and auth suites stay green |
| Pending invite closed by a link join | accept tx step 5 | `invite-links.int.test.ts`, int |
| Critical journey | — | `e2e/tests/smoke/invite-link.spec.ts`, smoke |

## Accountability

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Create a link | `invite_link.create` + the row | created; refused · limit, personal | requestId, actorId, deckId, linkId, role | info | aggregate by outcome | refused · limit > 20/h | `invite-links.service.test.ts`, unit |
| Show a link's invite (page, preview) | `invite_link.open` | shown; refused · used, revoked, expired, invalid | requestId, linkId (when known), deckId (when known), ipHash, surface (`page`/`preview`) | debug (shown) / info (refused) | rate of refused · invalid by ipHash (guessing) | refused · invalid > 100/h | `invite-links.service.test.ts`, unit |
| Join through a link | `invite_link.join` | accepted; refused · used, revoked, expired, invalid, already_member | requestId, actorId, linkId, deckId, membershipId, via (`join`/`sign_in`) | info | aggregate by outcome | refused · used > 20/h | `invite-links.service.test.ts`, unit; `invite-links.int.test.ts`, int |
| Register through a link | existing `users.register` (`deck_invite`, `registeredBy`) + `users.registered_via/by` columns | registered | as today | info | as today | as today | `auth.int.test.ts`, int |
| Send a sign-in mail past the waitlist | existing `auth.magic_link` | sent, with `via = invite_link` | requestId, emailHash, ipHash, linkId | info | aggregate by `via` | — (bounded by the link cap and the per-email/IP limits) | `auth.service.test.ts`, unit |
| Callback for a stopped link | existing `auth.callback` | refused · invite_gone | requestId, linkId | info | aggregate | refused · invite_gone > 20/h | `auth.int.test.ts`, int |
| Revoke a link | `invite_link.revoke` + `revoked_at/by` | revoked; refused · not_waiting | requestId, actorId, deckId, linkId | info | aggregate | — | `invite-links.service.test.ts`, unit |
| Link expired | the row (`expires_at`, no end state) + `refused · expired` above (D474) | — | — | — | count by SQL (`quickstart.md`) | — | `invite-links.int.test.ts`, int |
| Link shared | analytics `invite-shared` (`deckId`, `channel`) | share-sheet, copy-link | deckId | — | Umami event count; **consenting owners only** (D476) | — | `share.test.ts` / `InviteLinks.test.tsx`, unit |
| Anonymous rate limit hit | existing `rate_limit` refused (`rate-limit-refused.ts`) | refused | path, ipHash | as today | as today | as today | existing |

**Operator controls**:
- `INVITE_LINKS_WAITING_MAX` (default 10, in `@gobbit/shared` limits). It goes in the README env table, Compose `x-api-env` and `CHANGELOG.md`; it is not a deploy blocker.
- The anonymous per-IP budget is the existing `anonLimit`.

## Rollout

- **Migrations**: `0030_deck_invite_links` is additive. It creates the table and adds a nullable `magic_links.invite_link_id` with its CHECK. It is reversible: the down file drops the column, then the table. No backfill.
- **Env / config**: `INVITE_LINKS_WAITING_MAX` is optional. It goes in the README env table, `infra/docker-compose.yml` `x-api-env` and a `CHANGELOG.md` entry, which is not marked Action required.
- **API client**: run `pnpm api:openapi`. The new routes and the `magicLinkRequestSchema.invite` field change it.
- **Caddy**: no change. `/s/*` already reaches the API unchanged.
- **Deploy order / flags**: the normal CI → Dokploy flow.
- **Docs**:
  - `docs/design/auth.md` gets an "Invite links" section, with flows, events and Deviations;
  - `docs/adr.md` gets ADR-085;
  - `docs/architecture.md` gets one index row;
  - `CLAUDE.md`'s Roles rule gets one clause: link invites are owner-only, single use, never owner, and the token is never in a path;
  - `specs/README.md` gets D466–D476 and ADR-085;
  - `community-go-list.md` Tracking gets a plan row now and a tick on merge.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| The wrong person joins with a forwarded link | M / M | Single use, the role is never owner, the owner sees who accepted, and removal works as today (US3 #6). Spec accepted. |
| A stored token leaks from a DB dump | L / L | It grants one non-owner membership to someone who must still sign in, and it expires. Anyone holding a dump already has the cards (D467). |
| The token is logged somewhere unexpected (proxy access log, error report with a URL) | L / M | Query string, not path (D468). The int test checks captured request and error log lines. Caddy has no access log configured. `no-referrer` on the preview. |
| The route `/s/invite` is read as an item id by `/s/:itemId` | M / L | Register it first. The int test covers it. |
| A sign-in mail and an invite claimed in the wrong order, so one link registers two people | L / H | Registration only inside the callback transaction with the link locked (D472). Concurrent int test. |
| A stranger floods sign-in mails through a known waiting link | L / M | The existing per-email and per-IP limits on `/auth/magic-link`. Each mail joins at most one person. The owner can revoke. |
| Chat apps cache an old preview | M / L | Out of Gobbit's hands (spec edge case). New previews are `no-store`. |
| "Shared" counts only consenting owners | H / L | Stated in Accountability. Created and accepted counts are complete. |

## Settle before starting

- [ ] Confirm the D472 spec refinement: a brand-new person joins when they open the sign-in mail, without a second Join tap.

## Complexity Tracking

No violations.

## Pruned from the plan (constitution IX)

| Removed | Why |
|---------|-----|
| A new permission (`invite_link.manage`) | `member.invite` already admits exactly the owners (D476). |
| A new `magic_link_purpose` value | Purpose stays `sign_in`; a nullable `invite_link_id` says which invite rides along (D472). |
| An expiry sweep job | Expiry is recorded when met, like magic links and waitlist confirms; the row is the count (D474). |
| Triggers that revoke links when an owner is demoted or the deck is deleted | Read-time check of `resolveRole` and `deleted_at` (D473). |
| A dedicated OG image with the deck name | The existing private OG image plus title and description is enough (D469). |
| A server endpoint to log shares | The analytics content event covers it, as the spec says (D476). |
| A separate HMAC key for rebuildable tokens | Needs a new required secret for no real gain (D467). |
| Claiming at the callback for existing accounts | No FR forces it; the spec's explicit Join tap stays (D472). |
| A `status` column | Derived from timestamps (D466). |
| Generalising `ShareButton` | It is bound to items; the share button in `InviteLinks.tsx` calls the shared `shareItem` (D476). |
| A Caddy change | `/s/*` already proxies to the API (D468). |
