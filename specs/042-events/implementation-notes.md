# Implementation notes: 042 Events

Decisions the plan didn't make, and deviations from it. At close-out these are copied into
"Deviations from the 042 plan" in `docs/design/events.md`.

The feature ships as four stacked PRs: backend (PR1), web (PR2), notifications and mutes (PR3)
and ingestion (PR4).

## Decisions made while implementing

- **The new modules are named `event-cards.*`** (`event-cards.service.ts`,
  `event-cards.events.ts`, `event-cards.repo.ts`) instead of `events.*`, because
  `events.service`/`events/` already hold the activity log (ADR-057).
- **The notice sync is a hook, not a service call from each path.** `createEventNoticeHook`
  gives `items.service`, review publish and ingestion merge one optional `noticeHook`. It runs
  inside the item transaction with `past_at_save`, `past_at_publish` or `past_at_restore`.
- **Share previews use the event summary** ("when · location") for the OG description and the
  preview image excerpt. The excerpt is part of the OG content hash, so a moved date renders a
  new image.
- **`renderLink` in `public/render-item.ts` was split** into `renderLinkFields`, so the public
  event page reuses the link block without a second link parser.
- **The public "when" lives in `public/event-summary.ts`** (`eventWhenLine`, `eventSummary`).
  Pages, cards and share previews use it, and an unreadable payload yields `null`, not an
  error.

- **Web (PR2):**
  - A new event starts tomorrow at 18:00 in the device zone. It has no end and gets the default
    notify times.
  - Switching to all day keeps the start date and turns notify times into days: rounded, at least
    1, with duplicates merged. Switching back starts at 18:00 on that date with no end.
  - Unchanged times are sent back exactly as stored, zone included, so opening and saving an
    event made in another zone doesn't move it.
  - The event link reuses `LinkEditorFields` through a `{ url, preview }` adapter.
    `previewToPayload` moved to `editor/link-preview-payload.ts` so link and event drafts share it.
  - `deviceTimeZone` moved to `lib/device-time-zone.ts`. The status line uses the accent tone and
    turns muted once the event has ended.
  - The card's styles live in `event-cards/`, because `events/` is the activity log.
  - "Add to calendar" sits in the card bar for every role, on any live event card. It is a local
    action, so it stays on offline. Its file links to the card's share URL (`/s/{id}`), and a
    timed event's description adds "Time zone: <IANA>" (D368).

## Deviations from the plan

- **Notices are synced while an event is proposed.** T027 said "none while
  proposed/archived/deleted". Syncing in every state keeps one code path. Delivery (PR3,
  `planEvents`) skips stale lifecycles with `stale`, so a proposal still sends nothing.
- **Status codes:**
  - The schema answers 400 for an end not after the start and for location or notify shape
    errors.
  - The env-tunable limits (`EVENT_*`) answer 422 `/problems/validation` with a field path
    (`unprocessableField`).
  - Every type change answers 409 `type-change-not-supported`, events or not. The old 400
    strict-schema answer is gone, because `type` was added to `itemPatchSchema` so the service
    can name the problem.
  - A link check on a card without a url stays 422 on field `type`. There is no new `not-a-link`
    409.
- **DB constraints:** the `event_cards` index predicate uses `IS NOT NULL`, and the payload CHECK
  uses `coalesce` for absent keys.
- **Ingestion merges and review publish sync notices but don't enforce the notify lock.** The
  agent never changes `notify`. PR4 revisits this when extraction proposes events.
- **Two paths stay link-only:**
  - `linkImageBackfillCandidates`: the 041 one-time pass predates events.
  - `ingest/applied-preview.ts`: until PR4.
- **The web part of PR1 is interim.** `event` has a label, a tile and a pass-through draft so
  the app type-checks, but it is not in `CREATABLE_TYPES`. PR2 adds the editor and the card.
- **T022's `media-sweep` case is not an integration test.** The `assets.unreferenced` SQL
  includes `type IN ('link','event')`, and the existing media-sweep int test covers that query.
- **T024's smoke test is in `smoke/editor.spec.ts`, not `smoke/items.spec.ts`.** `items.spec.ts`
  only calls the API, while this journey goes through the editor. The ICS download (with the app
  offline) is the first `@full` test in `full/events.spec.ts`.
