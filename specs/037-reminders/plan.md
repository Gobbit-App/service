# Implementation Plan: Reminders and the notification area

**Branch**: `feat/037-reminders` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Phase 6+ (cards)

**Input**: Feature specification from `/specs/037-reminders/spec.md`

## Summary

A sixth card type, `reminder`: a text note plus a payload with `deadline`, `showBefore`, a
`dismiss` rule and the creator's `timeZone`. A DB trigger derives two server-owned facts from the
payload: `items.reveal_at` (deadline − show before) and a `reminders` row (deadline, outcome,
dismissal record, `notified_deadline`). One predicate, `itemRevealedWhere()`, joins every member
read path next to `itemHasVisibleCategory()`, so a hidden reminder is absent from lists, counts,
search, Ask, favorites and link flags; the card page lets its creator and the deck's owners and
maintainers through, and they list hidden ones with `status=upcoming`. Anonymous and share paths
exclude the type outright.

`POST /items/{id}/dismiss` records `done`/`dismissed`, archives the card and logs a `completed` or
`dismissed` item event; eligibility is one pure function (`reminderDismissers`) used by dismiss,
the DTO's `canDismiss`, the pending list and the notifier. A per-minute `reminder-sweep` job claims
due reminders (`notified_deadline := deadline`, `SKIP LOCKED`) and writes one
`notification_deliveries` row per person × channel × target in the same transaction (unique key =
at most once), then sends them: email through the existing mailer, Web Push through `web-push`
(VAPID + encryption) posted by a new guarded `safe-push` client restricted to known push-service
hosts. The web app gets a reminder editor and card, a dismiss modal, an Upcoming list, a bell with
an alert light in the bottom bar opening `/notifications` (`GET /me/pending`), a Notifications
section in Settings (reminder emails, push on this device, test) and service-worker `push` /
`notificationclick` handlers.

## Starting point

main @ `91e5aa0` (038 rich-text bodies), latest migration `0020_analytics_consent`. Card types:
`packages/shared/src/enums.ts` + `schemas/payloads.ts` + `schemas/item.ts`; item writes:
`apps/api/src/services/items.service.ts` → `repositories/items.repo.ts` (events in-tx, D187);
visibility: `apps/api/src/access/visibility.ts` (D38). Mail: `apps/api/src/mail/*`. Worker:
`apps/api/src/worker.ts` (pg-boss schedules). Outbound HTTP: `apps/api/src/fetch/safe-fetch.ts`
(GET only today). Web: editor registry `apps/web/src/editor/fields/registry.ts`, cards
`apps/web/src/cards/Card.tsx`, bottom bar `apps/web/src/app/BottomBar.tsx`, settings
`apps/web/src/settings/`, service worker `apps/web/src/sw.ts`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: existing stack + `web-push` (api: VAPID JWT and RFC 8291 payload
encryption via `generateRequestDetails`; we send the request ourselves through `safe-push`).

**Storage**: PostgreSQL 17 — migration `0021_reminders`: enum `item_type` + `reminder`, enum
`item_event_kind` + `completed`/`dismissed`, `items.reveal_at`, tables `reminders`,
`push_subscriptions`, `notification_deliveries`, `users.reminder_emails`, trigger
`items_reminder_sync` (see [data-model.md](data-model.md)).

**Testing**: Vitest unit (pure eligibility, schedule maths, payload schema, push request, web
components), integration (`*.int.test.ts`: every read path, dismiss, sweep at-most-once, push
cleanup), Playwright.

**Target Platform**: API/worker containers; PWA (Chrome/Edge/Firefox/Safari; iOS push only when
installed to the home screen).

**Performance Goals**: sweep every minute, ≤ 200 reminders claimed per tick; the reveal predicate
is one indexed column comparison (`reveal_at` is null for every other card).

**Constraints**: push content = title, deck, deadline, link (FR-011); push optional (no VAPID env →
absent); email optional (no mailer → push + area only); web bundle budget 150 KB gzip (reminder
editor fields and the notifications page load lazily).

**E2E tier**: full — creating a reminder, the bell and dismissing are new journeys but not on the
critical path (sign-in → read → share stay smoke); `e2e/tests/full/reminders.spec.ts` covers
create → reveal → dismiss and a reader's view. Push and email are covered at the integration tier
(the browser push service can't be driven in CI).

## Constitution Check

| Principle | Gate | How this plan meets it |
| --- | --- | --- |
| I. Layering | Routes parse, services decide, repos query | `reminders.service` (dismiss, upcoming, pending), `notify.service` (sweep), `push-subscriptions.service`; SQL only in `reminders.repo`, `notifications.repo`, `push-subscriptions.repo` |
| II. Invariants in the DB | Derived facts can't drift | `reveal_at` and `reminders.deadline` set by trigger from the payload; CHECK `reveal_at` ⇔ type reminder; unique delivery key; outcome/dismissal columns CHECKed together |
| III. Private by default | Every read path filters | `itemRevealedWhere()` added next to every `itemHasVisibleCategory()` use; anonymous paths exclude `type = 'reminder'`; traceability table below |
| IV. Safe outbound | Only guarded fetch | push sends through `createSafePush` (allow-listed push hosts, IP guard, no redirects); subscription endpoints validated on registration |
| V. Tests at the right tier | Unit/int/e2e, traceability | table below; E2E tier full |
| VI. Docs | Compact map + design doc | `docs/design/reminders.md`, ADR-070, one index row |
| VII. Env | Optional, documented | `VAPID_*` optional, CHANGELOG entry; limits env-tunable |
| VIII. Accountability | Named decision events | table below |

No violations.

## Decisions this plan pins down

See [research.md](research.md): D291 data model, D292 reveal predicate, D293 eligibility, D294
dismiss and lifecycle, D295 sweep and deliveries, D296 Web Push transport, D297 subscriptions and
preferences, D298 pending items and the bell, D299 limits. Durable record: ADR-070.

## Project Structure

### Documentation (this feature)

```text
specs/037-reminders/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
├── contracts/api.md          # new and changed endpoints, DTOs
├── contracts/web-ui.md       # editor, card, modal, bell, notifications page, settings
└── implementation-notes.md   # deviations while implementing
```

### Source Code

```text
packages/shared/src/
├── enums.ts                         # itemTypes + reminder; itemListStatuses + upcoming
├── reminders/                       # NEW subpath @gobbit/shared/reminders
│   ├── schema.ts                    # reminderPayloadSchema, dismiss DTOs, pending DTOs
│   ├── schedule.ts                  # revealAt(), showBeforeMs(), remaining()
│   └── dismissers.ts                # reminderDismissers() pure eligibility (D293)
├── schemas/item.ts                  # reminder create schema, Item.reminder
└── limits.ts                        # REMINDER_* and NOTIFY_* defaults
packages/db/
├── src/schema/{reminders,push-subscriptions,notification-deliveries}.ts
└── migrations/0021_reminders.sql (+ down)
apps/api/src/
├── access/visibility.ts             # itemRevealedWhere()
├── repositories/{reminders,notifications,push-subscriptions}.repo.ts
├── services/reminders.service.ts    # dismiss, upcoming, pending, payload rules
├── services/reminders.events.ts     # decision event catalog
├── services/notify.service.ts       # claim + plan + deliver
├── services/push-subscriptions.service.ts
├── push/{safe-push,web-push-request,push-hosts}.ts
├── mail/templates.ts                # reminderDueMail
├── jobs/reminder-sweep.ts           # worker entry
└── routes/{items,me,notifications}.ts
apps/web/src/
├── editor/fields/ReminderFields.tsx (+ registry, draft, validate)
├── cards/ReminderCard.tsx, reminders/{DismissDialog,ReminderStatus,use-dismiss}.tsx
├── notifications/{NotificationsBell,NotificationsScreen,use-pending}.tsx
├── routes/{notifications.tsx,d.$slug.upcoming.tsx}
├── settings/NotificationsSection.tsx, push/{push-client,use-push}.ts
└── sw.ts + sw/push-handlers.ts
```

## Invariant → test traceability

| Invariant | Test |
| --- | --- |
| Hidden reminder absent from list, category view, favorites, link flags, counts | `reminders-visibility.int.test.ts` |
| … from search and Ask retrieval | `reminders-visibility.int.test.ts` (search arm) |
| … from card page except creator/owner/maintainer | `reminders-visibility.int.test.ts` |
| Never on public pages/API/search/share/sitemap | `reminders-public.int.test.ts` |
| `reveal_at` follows payload edits (trigger) | `reminders.int.test.ts` |
| Deadline future/≤ max, show-before range | `schema.test.ts` (shared) + `reminders.int.test.ts` |
| Eligibility (rule × role × category × membership, owner fallback) | `dismissers.test.ts` |
| Dismiss refused for the ineligible; creator-only rule change | `reminders.int.test.ts` |
| Editor deletes own reminder, not others' | `reminders.int.test.ts` |
| At most once per person × channel × deadline, restart-safe | `notify.int.test.ts` |
| New deadline notifies again; restore/publish after deadline don't | `notify.int.test.ts` |
| Gone push subscription removed | `notify.int.test.ts` |
| Push only to allow-listed hosts | `push-hosts.test.ts`, `push-subscriptions.int.test.ts` |
| Dismiss modal: Done off, confirm disabled | `DismissDialog.test.tsx` |
| Bell light/overdue/aria count | `NotificationsBell.test.tsx` |
| Create → reveal → dismiss journey | `e2e/tests/full/reminders.spec.ts` |

## Accountability

| Decision | Event (`event` / outcomes) | Where | Watched by |
| --- | --- | --- | --- |
| Dismiss refused (not eligible) | `reminder.dismiss` refused `not_eligible` | reminders.service | log query; spike = UI offering Dismiss wrongly |
| Dismiss accepted | item event `completed`/`dismissed` (same tx) + `reminder.dismiss` accepted | reminders.repo / service | activity log |
| Rule change refused | `reminder.dismissers` refused `not_creator` | reminders.service | log |
| Delete refused for an editor on others' cards | `reminder.delete` refused `not_creator` | items.service | log |
| Notification planned per person | `reminder.notify` `planned`/`skipped` (`opted_out`, `no_channel`, `ineligible`) | notify.service | `notification_deliveries` + log |
| Delivery outcome | `reminder.notify` `sent`/`retried`/`failed`/`interrupted`/`gone` | notify.service | alert: `failed` rate > 5 % per hour |
| Push subscription change | `push.subscription` `added`/`removed`/`refused` (`host_not_allowed`) | push-subscriptions.service | log |

Ids only (user, item, delivery, job). `notification_deliveries` is the audit row for each
attempt.

## Rollout

1. PR 1 — plan docs + backend reminder type, visibility, Upcoming, dismiss (no UI yet; API only).
2. PR 2 — web: editor fields, card, dismiss modal, Upcoming list.
3. PR 3 — notifications: deliveries, sweep, email, Web Push, subscriptions/preferences API,
   Settings section, service worker handlers. **Action required** (optional): set `VAPID_*`.
4. PR 4 — notification area: `GET /me/pending`, bell + light, `/notifications`.

Each PR leaves main deployable; reminders are creatable from PR 2 and notify from PR 3.

## Risks

- **A read path missed** → hidden reminder leaks. Mitigation: the predicate lives beside the
  category predicate; the int test walks every route in FR-004.
- **Push services change hosts** → sends refused. Mitigation: host list in one module, refusal is a
  named event; email and the area still work.
- **iOS push quirks** → explained in Settings; never blocks email.

## Complexity Tracking

None.
