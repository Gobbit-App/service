---

description: "Task list for 042 Events"
---

# Tasks: Events

**Input**: Design documents from `/specs/042-events/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: REQUIRED (constitution V). Every task that adds logic has a matching test task, and every row of the
plan's traceability table maps to a test task below.

**Organization**: grouped by user story. Each task also names its rollout PR (plan § Rollout):
**PR1** backend type · **PR2** web · **PR3** notify · **PR4** ingestion.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: US1–US7 from spec.md
- **[Tier]**: `[unit]`, `[int]`, `[e2e:smoke]`, `[e2e:full]`

---

## Phase 1: Foundational (Blocking Prerequisites) — PR1

**Purpose**: the `event` type in the DB and in `@gobbit/shared`, its pure functions and the limits.

### Database

- [x] T001 Add `event` to `itemTypes` in packages/shared/src/enums.ts and to `item_type` in packages/db/src/schema/common.ts; add pg enums `notification_kind ('reminder','event')` and `event_notice_state ('pending','planned','skipped')` in packages/db/src/schema/common.ts
- [x] T002 [P] New Drizzle table packages/db/src/schema/event-cards.ts: `item_id uuid PK FK items ON DELETE CASCADE`, `deck_id uuid FK decks`, `all_day boolean`, `starts_at`/`ends_at timestamptz(3)`, `time_zone text`, `updated_at`; CHECK `event_cards_span_chk (ends_at > starts_at)`; indexes `event_cards_ends_idx (ends_at)` and `(deck_id)`
- [x] T003 [P] New Drizzle table packages/db/src/schema/event-notices.ts: `id uuid PK`, `item_id FK items ON DELETE CASCADE`, `starts_at`, `before_amount integer ≥ 0`, `before_unit text CHECK IN ('minutes','hours','days')`, `fire_at`, `state event_notice_state`, `skip_reason text?` with CHECK `(state = 'skipped') = (skip_reason IS NOT NULL)`, `planned_at?` with CHECK `(state = 'planned') = (planned_at IS NOT NULL)`, timestamps; UNIQUE `event_notices_once_uq (item_id, starts_at, before_amount, before_unit)`; partial index `event_notices_due_idx (fire_at) WHERE state = 'pending'`
- [x] T004 [P] New Drizzle table packages/db/src/schema/event-mutes.ts: PK `(item_id, user_id)`, both FK ON DELETE CASCADE, `muted boolean`, timestamps
- [x] T005 packages/db/src/schema/notification-deliveries.ts: `kind notification_kind NOT NULL DEFAULT 'reminder'`, `notice_id uuid NULL FK event_notices ON DELETE CASCADE`, CHECK `notification_deliveries_kind_chk ((kind = 'event') = (notice_id IS NOT NULL))`, unique key replaced by `(item_id, kind, notice_id, deadline, user_id, channel, target) NULLS NOT DISTINCT`; export new tables from packages/db/src/schema/index.ts
- [x] T006 `pnpm db:generate` → packages/db/migrations/0022_events.sql, then hand-add: trigger function + `items_event_sync` (AFTER INSERT OR UPDATE OF type, payload, deck_id, `WHEN (NEW.type::text = 'event')`) upserting `event_cards` per D358 (timed: `end` or start + 1 h; all-day: start 00:00 in zone → (end or start) + 1 day 00:00 in zone); CHECK `items_event_payload_chk` (allDay boolean, start/timeZone strings, `location` `char_length ≤ 200`, `notify.before` array `jsonb_array_length ≤ 3`); `item_search_text` `WHEN 'event'` branch (location, url, preview.title, preview.description); `items_link_preview_public_id_idx` recreated `WHERE type IN ('link','event')`. Compare the enum as `type::text`
- [x] T007 Hand-written packages/db/migrations/down/0022_events.down.sql: refuse while any `type = 'event'` item exists; drop mutes/notices/cards, trigger, function; restore old unique key; drop `kind`/`notice_id` and new enums; restore 0021 `item_search_text` and link-only index
- [x] T008 [P] [int] Migration round trip + down refusal with an event present in apps/api/test/migrations.int.test.ts (or packages/db/test/), enums sync in packages/shared/src/enums.test.ts

### Shared (`@gobbit/shared`)

- [x] T009 [P] Limits in packages/shared/src/limits.ts: `EVENT_NOTIFY_TIMES_MAX=3`, `EVENT_NOTIFY_BEFORE_MAX_DAYS=365`, `EVENT_START_MAX_DAYS=1826`, `EVENT_LOCATION_MAX=200`, `EVENT_ALLDAY_NOTICE_HOUR=9`, `EVENT_NOTICE_GRACE_MINUTES=5`, `INGEST_DEFAULT_TIME_ZONE='UTC'`
- [x] T010 [P] Zod-free time helpers in packages/shared/src/event-time/ (zone wall-clock ↔ instant via `Intl`, reused by span and moments); `eventPhase(span, now)` and `formatEventWhen(span, viewerTz)` (relative + absolute forms) with subpath export `@gobbit/shared/event-time`
- [x] T011 [P] [unit] packages/shared/src/event-time/*.test.ts: phases upcoming/tomorrow/today/now/ended, all-day spans, viewer in another zone, DST (SC-005)
- [x] T012 `eventPayloadSchema` (strict) + `eventAudienceModes`, `eventNoticeUnits`, `eventNoticeSkipReasons`, default notify `[{amount:1,unit:'days'}]`/`everyone` in packages/shared/src/events-cards/schema.ts + constants.ts; register `payloadSchemas.event` in packages/shared/src/schemas/payloads.ts; `Item.event` DTO in packages/shared/src/schemas/item.ts; subpath export `@gobbit/shared/events-cards`
- [x] T013 [P] `eventSpan(payload)` in packages/shared/src/events-cards/span.ts; `eventNoticeMoments(payload, limits)` in moments.ts (days keep wall-clock, minutes/hours exact, all-day at the notice hour)
- [x] T014 [P] `eventAudience(input)` and `canEditEventNotify(input)` in packages/shared/src/events-cards/audience.ts; `eventPublicPayload(payload)` allow-list in public-payload.ts
- [x] T015 [P] [unit] packages/shared/src/events-cards/{schema,span,moments,audience,public-payload}.test.ts (FR-001, FR-010, FR-011, FR-019, D359 DST + all-day hour)
- [x] T016 [P] `LINK_BEARING_TYPES = ['link','event']` + `isLinkBearing(type)` in packages/shared/src/links/; `itemEventFields` + `when`, `location`, `link`, `notify` in packages/shared/src/events/constants.ts

**Checkpoint**: the `event` type exists in DB and shared code; nothing in the API accepts it yet.

---

## Phase 2: User Story 1 - Add an event to a deck (P1) 🎯 MVP — PR1 (API) + PR2 (web)

**Goal**: events can be created, edited, listed, searched, shown publicly and carry link plumbing.

**Independent Test**: create an event 3 days out with a link and a location; every reader sees it in list,
Browse and search with date, location and preview; public JSON shows content but no `notify`.

### Tests

- [x] T020 [P] [US1] [int] apps/api/test/events.int.test.ts: create/edit validation (422 `payload.end`, `payload.start` > 5 y, location, notify.before rules; 422 `event-audience-unknown-member`), past start accepted, type change → 409 `type-change-not-supported`, trigger parity with `eventSpan` (DST, all-day), visibility via categories, personal deck audience forced to `me`, activity log names `when`/`location`/`link`/`notify`
- [x] T021 [P] [US1] [int] apps/api/test/events-public.int.test.ts: public read API, public pages and public search include content, never `notify`/`event`; member search by location and link title; share preview description = date · location
- [x] T022 [P] [US1] [int] apps/api/test/events-link.int.test.ts: link-check/link-flag accept events with a `url` (409 `not-a-link` without), `?flag=link` lists flagged events, snapshot runs, `media-sweep` keeps an event-referenced preview asset
- [x] T023 [P] [US1] [unit] apps/api/src/events/diff-fields.test.ts (event sub-fields); apps/api/src/services/public-dtos.test.ts (event allow-list)
- [x] T024 [P] [US1] [e2e:smoke] e2e/tests/smoke/items.spec.ts: create an event → it shows in the deck with its status line

### Implementation (API, PR1)

- [x] T025 [US1] apps/api/src/env.ts: read the `EVENT_*` limits + `INGEST_DEFAULT_TIME_ZONE` with `intInRange` (defaults from shared limits)
- [x] T026 [US1] apps/api/src/repositories/events.repo.ts: read `event_cards` for items, notices for current start, mutes for a user; `syncNotices(tx, …)` (insert pending/skipped, delete only pending rows no longer wanted)
- [x] T027 [US1] apps/api/src/services/events.service.ts + events.events.ts: `validateEventWrite` (start ≤ max days when start changes, end ≥ start, audience members live, personal deck → `me`), `eventHook` called by items.service inside the item transaction (sync notices with `past_at_save|publish|restore`; none while proposed/archived/deleted), notify lock (D363 → 409 `event-notify-locked`), `event.write`/`event.notify_settings` decision events
- [x] T028 [US1] apps/api/src/services/items.service.ts: route event validation, refuse type change to/from event, call the event hook on create/update/publish/restore/undelete; problems registered in the central handler
- [x] T029 [US1] apps/api/src/services/item-dtos.ts: `Item.event` (`startsAt`, `endsAt`, `allDay`, `timeZone`, `notices`, `muted`, `inAudience`, `canEditNotify`) for member paths only
- [x] T030 [US1] apps/api/src/services/public-dtos.ts + public-pages.service.ts + share preview: `eventPublicPayload`, absolute "when" in the event zone
- [x] T031 [US1] Link plumbing via `LINK_BEARING_TYPES`: link-preview fields, link-snapshot job, link-checks.repo.ts, assets.repo.ts, `?flag=link`
- [x] T032 [US1] apps/api/src/events/diff-fields.ts event sub-fields; apps/api/src/ai/payload-text.ts event text (location, url, preview title/description)
- [x] T033 [US1] `pnpm api:openapi` (regenerate @gobbit/api-client)

### Implementation (web, PR2)

- [x] T034 [P] [US1] Icons `calendar`, `calendar-plus`, `map-pin`, `bell-off` in apps/web/src/ui/icons
- [x] T035 [US1] Editor: `event` in apps/web/src/editor/creatable-types.ts (after Reminder, hint "A date, a place, and a heads-up"), draft defaults in draft.ts, client checks in validate.ts, lazy entry in fields/registry.ts
- [x] T036 [US1] apps/web/src/editor/fields/EventFields.tsx (lazy): text, When (all-day switch, datetime-local/date in device zone, zone note), Where (location counter 200), Link via an adapter over `LinkEditorFields`; 422/409 problems mapped to fields
- [x] T037 [US1] apps/web/src/cards/EventCard.tsx + CardBody.tsx branch: status line, location with `map-pin`, link preview block (LinkCard parts) + `LinkHealthBadge`; apps/web/src/browse/source-kind.ts event
- [x] T038 [P] [US1] [unit] apps/web/src/editor/fields/EventFields.test.tsx + validate tests

**Checkpoint**: US1 complete — events can be made and read everywhere.

---

## Phase 3: User Story 2 - See at a glance how close an event is (P1) — PR2

**Goal**: a minute-ticking status line on every event card.

**Independent Test**: one event viewed at 3 days before / morning of / during / day after, in two zones.

- [x] T040 [P] [US2] [unit] apps/web/src/cards/EventCard.test.tsx: each phase, zone note, all-day ranges (fake clock)
- [x] T041 [US2] apps/web/src/lib/use-minute-clock.ts: one shared minute clock (single timer, subscribers)
- [x] T042 [US2] Wire `useMinuteClock` + `eventPhase`/`formatEventWhen` into EventCard (accent tone for now, muted for ended)

**Checkpoint**: US2 complete.

---

## Phase 4: User Story 3 - Get notified as an event approaches (P1) — PR3

**Goal**: the per-minute notify tick plans event notices and pushes them at most once per device.

**Independent Test**: event in 2 h with "1 hour before": every reader with push gets exactly one push.

- [ ] T050 [P] [US3] [int] apps/api/test/events-notify.int.test.ts: plan → deliver at most once per user × device × notice across reruns; grace skip `started`; proposed/archived/deleted send nothing (`stale`); moved start notifies again; no email; no device → `no_channel`; no VAPID → `push_off`; audience ∩ read access
- [ ] T051 [P] [US3] [unit] apps/api/src/services/notify.message.test.ts: event push = title, `<deck> · <start in event zone>[ · <location>]`, tag `event:<itemId>:<noticeId>`, url `/i/<itemId>`, no body
- [ ] T052 [US3] apps/api/src/repositories/notifications.repo.ts: claims/deliveries carry `kind`/`notice_id`; events.repo.ts: claim due pending notices (`FOR UPDATE SKIP LOCKED`, batch `REMINDER_SWEEP_BATCH`)
- [ ] T053 [US3] apps/api/src/services/notify.service.ts: `planEvents` (grace → `skipped/started`; stale lifecycle → skip; fan out to `eventAudience` − mutes − ineligible into push deliveries) and per-kind context/`stillDue` in deliver; apps/api/src/jobs/reminder-sweep.ts tick order reminders → events → deliver
- [ ] T054 [US3] apps/api/src/services/notify.message.ts event message; notify.events.ts `event.notice` decision events

**Checkpoint**: US3 complete.

---

## Phase 5: User Story 4 - Control who is notified, and mute (P2) — PR2 (fields) + PR3 (mute)

**Goal**: audience choice in the editor (creator-only), per-member mute.

**Independent Test**: each audience mode notifies the right people; a reader mutes and gets nothing.

- [x] T060 [P] [US4] [int] events.int.test.ts: `PUT`/`DELETE /items/{id}/mute` (204 idempotent, 409 `not-an-event`, 409 `event-not-in-audience`, 404 unreadable), mutes private, `event.mute` events; notify lock for non-creator and owner fallback when the creator left
- [x] T061 [P] [US4] [unit] apps/web/src/editor/fields/EventNotifyFields.test.tsx: ≤ 3 rows, days only for all-day, "At the start", past-moment hint, read-only when `!canEditNotify`, hidden audience on the personal deck
- [x] T062 [US4] apps/web/src/editor/fields/EventNotifyFields.tsx (PR2): collapsed section with summary, notify-before rows, audience radios + people checklist
- [x] T063 [US4] events.service mute/unmute + events.repo upsert; apps/api/src/routes/items.ts `PUT`/`DELETE /items/{id}/mute`; `pnpm api:openapi`
- [x] T064 [US4] apps/web/src/cards/CardActionBar.tsx Mute/Unmute (`bell-off`), only when `inAudience`, disabled offline

**Checkpoint**: US4 complete.

---

## Phase 6: User Story 5 - Coming up in the notification area (P2) — PR3

- [x] T070 [P] [US5] [unit] apps/api/src/services/pending.service.test.ts comingUp window and order; apps/web NotificationsBell.test.tsx bell ignores comingUp; ComingUp.test.tsx
- [x] T071 [P] [US5] [int] events.int.test.ts: `GET /me/pending` `comingUp` (first notice ≤ now < ends; muted / not in audience / archived excluded)
- [x] T072 [US5] `comingUp` in packages/shared/src/reminders/pending.ts; events.repo Coming-up query; apps/api/src/services/pending.service.ts; `pnpm api:openapi`
- [x] T073 [US5] apps/web/src/notifications/ComingUp.tsx; section order Waiting → Coming up → Upcoming in apps/web/src/routes/notifications.tsx; empty state when all three empty
- [x] T074 [US5] [e2e:full] e2e/tests/full/events.spec.ts: notify settings + lock, Coming up, mute, Add to calendar, zone note, all-day, personal deck

---

## Phase 7: User Story 6 - Add to my calendar (P3) — PR2

- [x] T080 [P] [US6] [unit] packages/shared/src/ics/*.test.ts: UTC timed, DATE all-day (exclusive end), escaping, 75-octet folding, CRLF
- [x] T081 [US6] `toIcs(event, opts)` in packages/shared/src/ics/ (zod-free subpath `@gobbit/shared/ics`)
- [x] T082 [US6] "Add to calendar" (`calendar-plus`) in CardActionBar, lazy-loading ics, downloads `<title>.ics`, works offline

---

## Phase 8: User Story 7 - Share an event page (P2) — PR4

- [x] T090 [P] [US7] [unit] apps/api/src/fetch/structured-event.test.ts against HTML fixtures in fetch/__fixtures__ (event pages → one event, articles → none, several events → count > 1)
- [x] T091 [P] [US7] [unit] packages/shared/src/events-cards/parse.test.ts `parseEventStart`; apps/api/src/ai/extract-validate.test.ts event overrides/fallbacks; apps/api/src/ingest/dedup-verdict.test.ts `eventDedupVerdict`; auto-publish.test.ts `held_event_unverified`
- [x] T092 [P] [US7] [int] apps/api/test/ingest-events.int.test.ts (fake extractor): event page → Event proposal, article → link, zone fallback + hold, auto-publish only when verified, dedup by link + date
- [x] T093 [US7] packages/shared: `ingestCardTypes` + `event`, `POST /ingest` `timeZone`, `autoPublishOutcomes` + `held_event_unverified`, `ShareSummary.item.type`/`event`
- [x] T094 [US7] apps/api/src/fetch/structured-event.ts + extract-page.ts/page-images.ts shared JSON-LD walk → `normalized.structuredEvent(Count)`
- [x] T095 [US7] apps/api/src/ai/extract-prompt.ts / extract-validate.ts / fake-extractor.ts: event type, `<event_data>`, structured overrides, fallbacks; ingest/normalize-raw.ts + run-extraction.ts zone resolution, `extraction.event`
- [x] T096 [US7] apps/api/src/ingest/auto-publish.ts hold; run-dedup.ts + dedup.repo.ts event-only candidates; jobs/ingest.ts `ingest.event_extract`
- [x] T097 [US7] Web: share target + paste box send `timeZone`; share result "Proposed as an event: …" + held note; review queue renders event proposals via EventCard; docs/shortcut/README.md Time zone field
- [x] T098 [US7] [e2e:full] events.spec.ts: event proposal (API fixture) in review queue → edit notify → publish

---

## Phase 9: Close-out

- [x] T100 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int` (+ `pnpm budget`)
- [ ] T101 e2e: `@smoke` passes in CI; `@full` events spec passes with `pnpm test:e2e --grep @full`
- [x] T102 [P] docs/design/events.md (new): detail, runbook for `EVENT_*`, "Deviations" from implementation-notes.md
- [x] T103 [P] docs/adr.md ADR-076; docs/architecture.md one line + index row (< 250 lines)
- [x] T104 [P] README.md env table + infra Compose `x-api-env`; CHANGELOG.md entry (not Action required)
- [x] T105 [P] CLAUDE.md: event type / ingestion convention line if changed
- [x] T106 PLAN.md: link 042-events
- [x] T107 quickstart.md validation
- [ ] T108 `/speckit-converge` until Converged

---

## Dependencies & Execution Order

- **Phase 1** blocks everything.
- **US1 (API)** → PR1; then **US1 (web) + US2 + US4 fields + US6** → PR2; **US3 + US4 mute + US5** → PR3; **US7** → PR4.
- US3 depends on US1's notices sync; US5 depends on US3's audience/mute; US7 depends on US1 (and US4 fields for review).

### Within each story

Tests first (failing) → schema → repository → service → route → `api:openapi` → web.

## Parallel opportunities

- T002–T004, T009–T016 in Phase 1.
- T020–T024 tests in US1; T034 icons alongside API work.
- US6 (`ics`) is independent of US3–US5 and can be built any time after Phase 1.

## Implementation strategy

MVP = Phase 1 + US1 API (PR1). Then PR2 makes events usable in the app, PR3 adds notifications, PR4
makes shared event pages arrive as events. Each PR leaves main deployable.
