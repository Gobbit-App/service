---

description: "Tasks for 037 reminders and the notification area"
---

# Tasks: Reminders and the notification area

**Input**: Design documents from `/specs/037-reminders/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/web-ui.md

**Tests**: REQUIRED (constitution V). Every traceability row in plan.md maps to a test task below.

## Format: `[ID] [P?] [Story] [Tier?] Description`

Rollout: PR1 = Phases 1–3 (backend type, visibility, dismiss), PR2 = Phase 4 (web), PR3 = Phase 5
(notifications), PR4 = Phase 6 (pending + bell), Phase 7 = docs at close-out (each PR carries its
own docs slice).

---

## Phase 1: Foundational

- [x] T001 Shared `reminders/` subpath in packages/shared/src/reminders/: `schema.ts` (`reminderPayloadSchema`, units, limits, `dismissReminderSchema`, `reminderStateSchema`), `schedule.ts` (`revealAt(deadline, showBefore)`, `showBeforeMs`, `formatDue` helpers), `dismissers.ts` (D293 pure function); export from `./reminders` in package.json
- [x] T002 [P] [unit] packages/shared/src/reminders/schema.test.ts — deadline/amount/unit bounds, userIds only with `people`, strict keys, timeZone
- [x] T003 [P] [unit] packages/shared/src/reminders/schedule.test.ts — revealAt per unit, 0 show-before, DST-independent (instant arithmetic)
- [x] T004 [P] [unit] packages/shared/src/reminders/dismissers.test.ts — me / writers / people, lost access, category visibility, owner fallback, personal deck
- [x] T005 Item type `reminder` in `itemTypes` + `payloadSchemaFor`; `itemEventKinds` + `completed`, `dismissed`; `Item.reminder` DTO; `itemListStatuses` + `upcoming` (packages/shared/src/schemas)
- [x] T006 Migration `0021_reminders` (+ down): enums, `items.reveal_at` + CHECK + index, `reminders`, `push_subscriptions`, `notification_deliveries`, `users.reminder_emails`, sync triggers; Drizzle schema files in packages/db/src/schema
- [x] T007 [int] packages/db trigger test: reveal_at/reminders row follow payload edits; type change rejected by CHECK

## Phase 2: US1 — create, hide, reveal (P1) 🎯 MVP

- [x] T008 `itemRevealedWhere()` in apps/api/src/access/visibility.ts; apply in items.repo (list, link flags, archived), search.repo arms, categories count, favorites, dedup
- [x] T009 Exclude `type = 'reminder'` on public-deck.service reads, public search, sitemap, share previews
- [x] T010 `loadItem` allows a hidden reminder only to its creator and `category.read_private` roles (404 otherwise)
- [x] T011 `status=upcoming` list in items.repo/service (owner/maintainer: all hidden; others: own)
- [x] T012 reminders.service: validate on create/update (future deadline, max distance, dismissers are writers, personal deck → `me`, only creator changes `dismiss`), DTO enrichment (`reminder` field via reminders.repo + dismissers)
- [x] T013 [P] [int] apps/api/src/routes/reminders.int.test.ts — hidden from list/search/category counts/favorites for readers; visible to creator + owner by id and in Upcoming; revealed after reveal time; public/sitemap/share never show reminders

## Phase 3: US2 — dismiss with an outcome (P1)

- [x] T014 `POST /items/{id}/dismiss` route + reminders.service.dismiss (eligibility, archive, outcome, item event, decision event) ; restore clears outcome; restore/undelete/publish after deadline marks notified
- [x] T015 Creator may delete own reminder; `reminder.*` decision events catalog (`reminders.events.ts`)
- [x] T016 [P] [int] dismiss: eligible vs not (403), done/resolution recorded, archived, activity event; restore → pending; delete by creator editor

## Phase 4: Web (US1–US2 UI)

- [x] T017 Editor: `reminder` in CREATABLE_TYPES/TYPE_LABELS, `ReminderFields` (deadline, show before, who can dismiss), draft defaults, validate
- [x] T018 Card: `ReminderCard` status line (due/overdue/done/dismissed/shows on); Dismiss action in CardActionBar; `DismissDialog`
- [x] T019 Upcoming screen `/d/$slug/upcoming` + menu link (owners/maintainers)
- [x] T020 [P] [unit] ReminderFields, ReminderCard, DismissDialog, validate tests
- [x] T021 [P] [e2e:full] e2e/tests/full/reminders.spec.ts — create, hidden for reader, upcoming, dismiss with done

## Phase 5: US3 — notifications (P2)

- [x] T022 `createSafePush` in apps/api/src/fetch/safe-fetch.ts (POST, allow-listed hosts, no redirects); push sender with `web-push`; env VAPID_* + limits in config
- [x] T023 Repos: push-subscriptions, notification-deliveries; `/me/push-subscriptions` (+ test), `/me/notification-preferences`; `/config.push`
- [x] T024 Worker `reminder-sweep`: plan (one tx) + deliver (claim/send/backoff/gone/interrupted); reminder email template
- [x] T025 [P] [unit] safe-push host allow-list, payload builder, backoff
- [x] T026 [P] [int] sweep at most once across two ticks and a crash between claim and send; opted-out email skipped; 410 removes subscription; ineligible members skipped
- [x] T027 Web: Settings → Notifications (email switch, push enable/disable/test), service worker `push` + `notificationclick`

## Phase 6: US4 — notification area (P2)

- [x] T028 `GET /me/pending` (repo query + service using dismissers)
- [x] T029 [P] [int] pending: overdue first, only eligible, upcoming = own hidden
- [x] T030 Web: bell in BottomBar with light + aria-label, `/notifications` screen
- [x] T031 [P] [unit] Bell + NotificationsScreen tests

## Phase 7: Close-out

- [ ] T032 docs/design/reminders.md, ADR-070 + architecture.md row, README env, CHANGELOG (VAPID **Action required** only to enable push), implementation-notes.md
- [ ] T033 `pnpm api:openapi`, typecheck, lint, unit, int; /speckit-converge
