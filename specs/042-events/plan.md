# Implementation Plan: Events

**Branch**: `042-events-plan` (plan); implementation `feat/042-events` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Phase 6+ (cards)

**Input**: Feature specification from `/specs/042-events/spec.md`

## Summary

`event` is a new card type. Its content is a text note plus a flat payload: `allDay`, `start`,
optional `end`, `timeZone`, optional `location`, the link card's optional `url`/`preview`, and
`notify { before[], audience }` (D356, D357).

**Schedule.** A DB trigger derives the server-owned schedule into `event_cards`: the effective
`starts_at`/`ends_at`, where a timed event without an end lasts 1 hour and an all-day end is
exclusive (D358). Inside the item's transaction, the service turns the notify times into
`event_notices` rows (one per moment per start), computed by the shared `eventNoticeMoments`. A
moment already past when the event is saved, published, restored or undeleted is stored as skipped
(D359).

**Delivery.** Events join 037's per-minute notify tick: plan reminders → plan events → deliver
(D360). A claimed notice fans out to the current audience into `notification_deliveries`, which
gains `kind` and `notice_id`. Because the unique key includes the notice, each moment reaches each
device at most once (D361). Delivery is by push only, with no email (FR-017).

**Audience.** The audience is one pure rule over current read access. The personal deck is fixed
to "me" (D362). Only the creator changes the notify times and the audience; the owners take over
once the creator leaves (D363). Members mute an event for themselves only (D364).

**Reading.** Public, share, search and Ask see content only, never `notify` (D365). The notification
area gets a "Coming up" section that the bell ignores (D366). Cards show a status line that moves
with the clock (D367). A client-side `.ics` writer adds "Add to calendar" (D368).

**Shared plumbing.** The link machinery (preview, snapshot, checks, asset references) moves from
`type === 'link'` to a link-bearing type set (D372). The activity log names the event's
sub-fields (D369).

## Starting point

main @ `3bc4619` (042 checklists spec merged). The latest migration is `0021_reminders`, and the
feature is not deployed.

It builds on:

- `specs/037-reminders`:
  - `notification_deliveries`, `push_subscriptions`;
  - `reminder-sweep` and `notify.service`, `safe-push`;
  - `GET /me/pending`, the bell, `/notifications`.
- `specs/014` (link snapshot and checks, ADR-055).
- `specs/038` (rich-text bodies).
- `specs/007`/`017` (activity log, ADR-057).
- `specs/020` (public decks, ADR-056).

Code to read:

- **Card types**: `packages/shared/src/enums.ts`, `schemas/payloads.ts`, `schemas/item.ts`, and
  `packages/db/src/schema/common.ts`.
- **Writes**: `apps/api/src/services/items.service.ts` → `repositories/items.repo.ts`.
- **Reminder hooks**: `services/reminders.service.ts`, `repositories/reminders.repo.ts`.
- **Notifier**: `services/notify.service.ts`, `notify.message.ts`, `notify.events.ts`,
  `repositories/notifications.repo.ts`, `jobs/reminder-sweep.ts`.
- **Pending list**: `services/pending.service.ts`.
- **Public**: `services/public-dtos.ts`, `public-pages.service.ts`.
- **Link plumbing**: `repositories/link-checks.repo.ts`, `assets.repo.ts`.
- **Web**:
  - `apps/web/src/editor/` (`draft.ts`, `creatable-types.ts`, `fields/registry.ts`,
    `fields/LinkEditorFields.tsx`, `fields/ReminderFields.tsx`);
  - `apps/web/src/cards/` (`Card.tsx`, `CardBody.tsx`, `LinkCard.tsx`, `CardActionBar.tsx`);
  - `apps/web/src/routes/notifications.tsx`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: the existing stack, with no new dependency. Time maths use `Intl` (as the
reminders code does), and the ICS writer is in-house (D368). The `ics` and `ical-generator` packages
were rejected: they are heavy, lack TZID, or pull in yup/nanoid.

**Storage**: PostgreSQL 17. Migration `0022_events` (D373 renumbers it if checklists merges first)
adds:

- `item_type` + `event`;
- the enums `notification_kind` and `event_notice_state`;
- the tables `event_cards`, `event_notices` and `event_mutes`;
- the trigger `items_event_sync` and the CHECK `items_event_payload_chk`;
- on `notification_deliveries`, `kind`/`notice_id` and a new unique key;
- an `item_search_text` `event` branch, and the link preview index widened to `link`/`event`.

See [data-model.md](data-model.md).

**Testing**:

- Vitest unit tests for the pure functions in `@gobbit/shared`: span, moments (DST, all-day hour),
  audience, notify lock, phase/format and ICS. Also the editor fields, the card status line and
  "Coming up".
- Integration tests (`*.int.test.ts`):
  - the trigger and parity with `eventSpan`;
  - notice sync on edit and lifecycle;
  - sweep at-most-once and grace;
  - fan-out and mute;
  - notify lock;
  - every read path for public, search and share;
  - link plumbing on events;
  - the down file round trip.
- Playwright tests.

**E2E tier**: smoke + full.

- **Smoke**: `e2e/tests/smoke/items.spec.ts` gains "create an event → it shows in the deck with
  its status line". Creating a card of a new type is the core create journey, and the editor's
  type switch is shared code.
- **Full**: `e2e/tests/full/events.spec.ts` covers the notify settings and lock, "Coming up", mute,
  Add to calendar, the time-zone note, all-day, and the reader and personal-deck views. These are
  variants, and async, or not on the critical path.
- **Integration**: push delivery is covered here with the network-edge push fake from 037. A
  browser push service can't be driven in CI.

**Target Platform**: API and worker containers. PWA on Android Chrome first; iOS push only when the
app is installed to the home screen, as in 037.

**Project Type**: pnpm monorepo: API + worker, PWA, shared packages

**Performance Goals**:

- The tick plans at most `REMINDER_SWEEP_BATCH` notices (the shared batch size, 200) through
  the partial index on pending `fire_at`.
- "Coming up" uses one indexed query over `event_cards.ends_at` and the caller's notices.
- The card status re-renders once a minute per mounted list. There is one shared clock, not one timer
  per card.

**Constraints**:

- Body ≤ 600 code points and payload ≤ 8192 bytes.
- The push content is title, deck, start, location and link only (FR-013).
- Push is optional: without VAPID, events save and show, and notices are skipped with `push_off`.
- Web bundle ≤ 150 KB gzip: the event editor fields, `ics` and the "Coming up" code load lazily, and
  `event-time` is a zod-free subpath.
- Same origin.

**Scale/Scope**: family and community decks, with tens of events per deck and up to 3 notices each.

## Constitution Check

*Pre-design gate: passed. Re-checked after Phase 1 (data model, contracts): passed, no violations.*

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | `events.service` (notice sync hook, notify lock, mute) and `notify.service` (event plan and deliver) hold the rules. `pending.service` builds "Coming up". SQL lives only in `events.repo`, `notifications.repo` and `items.repo`. Routes parse `PUT`/`DELETE /items/{id}/mute`. Access goes through `authorize()`/`can()` and `visibleCategoriesWhere()` |
| II. One source of truth for contracts | `eventPayloadSchema` and the DTOs live in `@gobbit/shared` (`events-cards/`). The web reads the zod-free `event-time`/`ics` subpaths. Run `pnpm api:openapi` |
| III. Invariants live in the database | The trigger derives `event_cards`. CHECKs cover the span, the notice state ⇔ reason/planned_at, the delivery kind ⇔ notice, and the payload shape. Unique keys enforce at-most-once. A hand-written down file and a round-trip test |
| IV. Private by default | Events use the card's normal visibility. `eventAudience` drops anyone who can't read the item now. `notify`, mutes and notices never reach public, share, search or Ask (`eventPublicPayload` allow-list). Push goes only through `safe-push`, and link fetches only through `safe-fetch` |
| V. Tests at the right tier | Pure logic is unit tested and the DB and worker behaviour is integration tested. E2E: smoke (create) + full (the rest). See the traceability table below |
| VI. Lean, offline-first web | Lazy editor chunk and lazy ICS. `event-time` is a subpath. The status line computes from cached data, so it works offline. Mute is disabled offline |
| VII. Simple, optional, deployable | No new dependency or service. Without VAPID nothing is sent and everything else works. The six env limits have defaults (CHANGELOG entry, not a blocker) |
| VIII. Accountable by default | `event.notice`, `event.mute`, `event.notify_settings` and `event.write` decision events plus audit rows (Accountability table below). Ids only; limits are env-tunable |

## Decisions this plan pins down

Full reasoning is in [research.md](research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D356 | Flat payload with the link fields at the top level, so link plumbing reads the same paths | no |
| D357 | Timed events store ISO instants with an offset; all-day events store `YYYY-MM-DD`. The IANA `timeZone` is always stored | no |
| D358 | `event_cards`: a server-owned effective span, synced by trigger. The default length is 1 h, and an all-day end is exclusive | yes → ADR-076 |
| D359 | `event_notices`: one row per moment per start, written in the item's transaction. A past moment is stored as skipped (`past_at_*`) | yes → ADR-076 |
| D360 | Events join the existing notify tick, keeping the queue name. A late send is allowed only within `EVENT_NOTICE_GRACE_MINUTES` | yes → ADR-076 |
| D361 | `notification_deliveries` gains `kind` and `notice_id`, with a unique key `NULLS NOT DISTINCT`. Events use push only | yes → ADR-076 |
| D362 | `eventAudience`: everyone, people, me or nobody, ∩ current read access. The personal deck is forced to `me` and there's no owner fallback | no |
| D363 | Only the creator, or the owners once the creator has left, change `notify`; anyone else gets 409 `event-notify-locked` | no |
| D364 | `event_mutes` keeps one row per member, private to them. `PUT`/`DELETE /items/{id}/mute` | no |
| D365 | Public, share, search and Ask see content only. The search text has location, url and preview title/description | no |
| D366 | `GET /me/pending` gains `comingUp`, running from the first notice until the end. The bell ignores it | no |
| D367 | `eventPhase` + `formatEventWhen` (zod-free subpath) + a web minute clock | no |
| D368 | An in-house RFC 5545 writer (`@gobbit/shared/ics`), built client-side | no |
| D369 | `itemEventFields` + `when`/`location`/`link`/`notify` | no |
| D370 | Events are not candidates for ingest dedup | no |
| D371 | Six env limits (notify times, before max, start max, location, all-day hour, grace) | no |
| D372 | `LINK_BEARING_TYPES = ['link','event']` replaces the `type === 'link'` checks (preview, snapshot, checks, assets, index) | no |
| D373 | Coordination with `042-checklists`: the migration takes the next free number, and `kind` and the pending sections are shared extension points | no |

D374–D375 are held for implementation.

## Project Structure

### Documentation (this feature)

```text
specs/042-events/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md · contracts/web-ui.md
├── checklists/
├── tasks.md                 # /speckit-tasks
└── implementation-notes.md  # /speckit-implement
```

### Source Code (repository root)

```text
packages/db/
├── src/schema/common.ts              # item_type + event; notification_kind, event_notice_state
├── src/schema/event-cards.ts         # new
├── src/schema/event-notices.ts       # new
├── src/schema/event-mutes.ts         # new
├── src/schema/notification-deliveries.ts  # kind, notice_id, unique key
├── migrations/0022_events.sql        # generated + hand-added trigger/CHECK/search function
└── migrations/down/0022_events.down.sql

packages/shared/src/
├── enums.ts                          # itemTypes + event
├── schemas/payloads.ts, schemas/item.ts   # event payload + Item.event DTO
├── events-cards/                     # new: schema, span, moments, audience, public-payload, constants (+ tests)
├── event-time/                       # new zod-free subpath: eventPhase, formatEventWhen (+ tests)
├── ics/                              # new zod-free subpath: toIcs (+ tests)
├── events/constants.ts               # itemEventFields + when/location/link/notify
├── links/                            # LINK_BEARING_TYPES
├── reminders/pending.ts              # pendingListSchema + comingUp
└── limits.ts                         # EVENT_* defaults

apps/api/src/
├── services/events.service.ts        # new: eventHook (syncNotices), notify lock, mute
├── services/events.events.ts         # new: decision-event helpers (event.mute, event.notify_settings, event.write)
├── repositories/events.repo.ts       # new: notices, mutes, Coming up query
├── services/items.service.ts         # event validation, type-change refusal, hook wiring
├── services/item-dtos.ts             # Item.event
├── services/notify.service.ts        # planEvents, per-kind context/stillDue
├── services/notify.message.ts        # event push message
├── services/notify.events.ts         # event.notice
├── repositories/notifications.repo.ts # kind/notice_id claims
├── services/pending.service.ts       # comingUp
├── services/public-dtos.ts, public-pages.service.ts  # eventPublicPayload, absolute when
├── repositories/link-checks.repo.ts, assets.repo.ts  # LINK_BEARING_TYPES
├── events/diff-fields.ts             # event sub-fields
├── ai/payload-text.ts                # event text
├── ingest/                           # exclude events from dedup candidates
├── routes/items.ts                   # mute routes
└── env.ts                            # EVENT_* (+ intInRange helper)
apps/api/test/                        # events.int.test.ts, events-notify.int.test.ts, events-public.int.test.ts, migration round trip

apps/web/src/
├── editor/fields/EventFields.tsx      # new (lazy): when, where, link adapter, notifications
├── editor/fields/EventNotifyFields.tsx # new
├── editor/{draft,validate,creatable-types}.ts, fields/registry.ts, composer/*
├── cards/EventCard.tsx                # new: status line, location, link block
├── cards/CardBody.tsx, CardActionBar.tsx  # event branch; Add to calendar, Mute
├── lib/use-minute-clock.ts            # new
├── notifications/ComingUp.tsx         # new; routes/notifications.tsx section order
├── browse/source-kind.ts              # event
└── ui/icons                           # calendar, calendar-plus, map-pin, bell-off

e2e/tests/smoke/items.spec.ts          # + create event
e2e/tests/full/events.spec.ts          # new
docs/design/events.md (new), docs/adr.md (ADR-076), docs/architecture.md (one line + index row)
```

**Structure Decision**:

- Shared pure logic lives in `@gobbit/shared`, so the API, the worker, the web and the public pages
  compute the same span, moments and phase.
- The API gets one new service/repository pair for events. The existing notifier is extended rather
  than forked.
- The web gets one lazy editor chunk and one card component.
- `events-cards/` is named apart from the existing `events/` (the activity log).

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 payload shape, end ≥ start, location ≤ 200, ≤ 3 notify times | Zod + DB CHECK | `events-cards/schema.test.ts` (unit); `events.int.test.ts` (int) |
| FR-002 start ≤ 5 years ahead; a past start is allowed | service | `events.int.test.ts` (int) |
| FR-003 changing the type to or from event is refused | service | `events.int.test.ts` (int) |
| D358 `event_cards` follows payload edits and agrees with `eventSpan` | trigger | `events.int.test.ts` (int, parity cases incl. DST and all-day) |
| FR-004 event visibility = card visibility | `visibleCategoriesWhere` | `events.int.test.ts` (int) |
| FR-005 public sees content, never `notify`/notices/mutes | `eventPublicPayload`, `toPublicItem` | `public-dtos.test.ts` (unit); `events-public.int.test.ts` (int) |
| FR-006 search by location and link title | `item_search_text` | `events-public.int.test.ts` (int, member + public search) |
| FR-007/008 status line and zone note | `eventPhase`, `formatEventWhen` | `event-time/*.test.ts` (unit); `EventCard.test.tsx` (unit) |
| FR-010 notify-before rules; all-day in days | Zod | `events-cards/schema.test.ts` (unit) |
| D359 moments across DST, all-day hour | `eventNoticeMoments` | `events-cards/moments.test.ts` (unit) |
| FR-011 audience ∩ read access; personal deck = me | `eventAudience`, service | `events-cards/audience.test.ts` (unit); `events.int.test.ts` (int) |
| FR-012/013 push to each device, content limited | `notify.service`, `notify.message` | `notify.message.test.ts` (unit); `events-notify.int.test.ts` (int) |
| FR-014 at most once per person × device × moment, restart-safe; a moved start notifies again | unique keys, claims | `events-notify.int.test.ts` (int) |
| FR-015 past moments at save/publish/restore/undelete are skipped; a late send only within grace | `syncNotices`, sweep | `events.int.test.ts`, `events-notify.int.test.ts` (int) |
| FR-016 proposed/archived/deleted events send nothing | `stillDue` | `events-notify.int.test.ts` (int) |
| FR-017 no email; no device → skipped `no_channel` | `notify.service` | `events-notify.int.test.ts` (int) |
| FR-018 mute only yourself; private | `events.service` | `events.int.test.ts` (int) |
| FR-019 notify lock; owners once the creator has left | `canEditEventNotify`, service | `audience.test.ts` (unit); `events.int.test.ts` (int) |
| FR-020/021 Coming up window; bell unaffected | `pending.service` | `pending.service.test.ts` (unit); `events.int.test.ts` (int); `NotificationsBell.test.tsx` (unit) |
| FR-022 calendar file valid (UTC timed, DATE all-day, escaping, folding) | `toIcs` | `ics/*.test.ts` (unit); `events.spec.ts` (full) |
| FR-023 activity log names sub-fields | `diffFields` | `diff-fields.test.ts` (unit); `events.int.test.ts` (int) |
| D372 link preview, snapshot, checks, asset references on events | `LINK_BEARING_TYPES` | `events-link.int.test.ts` (int; asset sweep must not delete an event's preview) |
| Down file refuses while events exist; round trip | migration | `migrations.int.test.ts` (int) |
| Create an event → it shows in the deck | web + API | `e2e/tests/smoke/items.spec.ts` (smoke) |
| Notify settings, lock, mute, Coming up, ICS, reader view | web + API | `e2e/tests/full/events.spec.ts` (full) |

## Accountability

| Decision | Event / audit row | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|-------------------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Notice moment skipped at write time | `event_notices` row (`state = skipped`, `skip_reason`) | `past_at_save`, `past_at_publish`, `past_at_restore` | itemId, noticeId | audit | aggregate per day | none (expected) | `events.int.test.ts` |
| Notice planned or too late | `event.notice` log + `event_notices.state` | `planned`; `skipped` · `started`, `stale` (lifecycle or start changed) | jobId, itemId, noticeId | info | aggregate; rate of `started` | `started` > 10 % of planned per hour (sweep lag) | `events-notify.int.test.ts` |
| Per-person fan-out | `event.notice` log | `skipped` · `muted`, `no_channel`, `ineligible`, `push_off` | jobId, noticeId, userId | info | aggregate by reason | none | `events-notify.int.test.ts` |
| Delivery outcome | `event.notice` log + `notification_deliveries` row (`kind = event`) | `sent`, `retried`, `failed` · `max_attempts`, `interrupted`, `gone` · `device_missing`, `dropped` | jobId, deliveryId, noticeId, userId | info / warn on `failed` | rate | `failed` > 5 % per hour (the 037 alert, now covering both kinds) | `events-notify.int.test.ts` |
| Mute / unmute | `event.mute` log + `event_mutes` row | `muted`, `unmuted`, `refused` · `not_in_audience`, `not_an_event` | requestId, itemId, actorId | info | instance | none | `events.int.test.ts` |
| Notify settings change | `event.notify_settings` log + `item_events` (`changes` ∋ `notify`) | `changed`, `refused` · `not_creator` | requestId, itemId, actorId | info / warn on refused | instance; refusal spike = the UI offering the editor wrongly | refused > 20/h | `events.int.test.ts` |
| Event write refused (limits, unknown audience member, type change) | `event.write` log (new, `events.events.ts`) | `refused` · `start_too_far`, `end_before_start`, `audience_unknown_member`, `type_change` | requestId, deckId, actorId | info | aggregate | none | `events.int.test.ts` |
| Calendar file | none: built in the browser from data the member can already read, so the server makes no decision | — | — | — | — | — | — |

**Operator controls**: `EVENT_NOTIFY_TIMES_MAX` (3), `EVENT_NOTIFY_BEFORE_MAX_DAYS` (365),
`EVENT_START_MAX_DAYS` (1826), `EVENT_LOCATION_MAX` (200; the DB CHECK caps it at 200),
`EVENT_ALLDAY_NOTICE_HOUR` (9, 0–23) and `EVENT_NOTICE_GRACE_MINUTES` (5). The defaults are in
`@gobbit/shared/limits` and they're read in `apps/api/src/env.ts`. A runbook entry goes in
`docs/design/events.md`.

## Rollout

The work ships as small PRs, one per stream:

1. **PR 1 (backend type)**:
   - the migration;
   - the shared schema and pure functions;
   - validation and the notify lock;
   - `event_cards`/`event_notices` sync;
   - the DTO, public, search and link plumbing;
   - the activity log.

   It is API only.
2. **PR 2 (web)**: the editor fields, the card status line, Add to calendar, and the smoke spec.
3. **PR 3 (notify)**: the tick's `planEvents`, the delivery `kind`, the push message, mute routes and
   UI, "Coming up", and the full spec.

Each PR leaves main deployable.

- **Migrations**: `0022_events`, renumbered if checklists merges first. It is reversible while no
  event rows exist, and the `item_type` value stays. Existing deliveries are backfilled to
  `kind = reminder` by the default.
- **Env / config**: six optional `EVENT_*` vars are added to the README env table and Compose
  `x-api-env`. The `CHANGELOG.md` entry is not **Action required**.
- **API client**: `pnpm api:openapi` for each PR that changes routes or DTOs.
- **Deploy order / flags**: the normal CI → Dokploy flow. Push needs the existing `VAPID_*`.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A `type === 'link'` site is missed and the asset sweep deletes an event's preview image | M / H | D372 lists every site. An int test sweeps with an event-only reference |
| Time-zone or DST errors in the moments or the span | M / M | One pure function shared by the server and the web, a DST table test, and trigger ↔ `eventSpan` parity tests |
| A sweep lag sends stale "starting now" pushes | L / M | The grace window plus `skipped/started` events. Lag is visible in the alert |
| Merge collision with `042-checklists` (enum, migration, deliveries key, search function) | H / L | D373: next-free migration number, shared extension points, rebase the search `CASE` |
| A fan-out to a large "everyone" audience slows the tick | L / L | Family-sized decks; the batch cap per tick; deliveries are sent in the existing bounded loop |
| A public page leaks the audience or notices | L / H | `eventPublicPayload` allow-list, plus a public int test asserting the absent keys |

## Settle before starting

- [ ] **Duplicate rule**: the spec's edge case says the same link + the same start date is flagged as a
  duplicate, but no producer creates events from ingest, so nothing raises that flag (D370).
  Recommendation: drop the edge case from the spec, or defer it to the feature that lets ingest
  propose events.
- [ ] **Migration number vs. `042-checklists`**: whichever merges second regenerates its migration on
  top (D373). Agree on which ships first.

## Complexity Tracking

None. The Constitution Check has no violations.
