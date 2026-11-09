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
- **Mute/Unmute (T064) is in the card's "More actions" menu, not the bar.** It's a rare action
  and the bar already holds Add to calendar on events. Muted shows "Unmute notifications" with
  the `bell` icon. A reader in the audience now gets a menu on events.
- **T061's tests are in `EventFields.test.tsx`.** `EventNotifyFields` renders only inside
  `EventFields`, whose tests already covered rows, lock and personal deck. They gained all-day
  days-only and the past-moment hint. There is no separate `EventNotifyFields.test.tsx`.
- **T073 empty state:** "Nothing waiting on you" still keys off `items` (as in 037). Coming up and
  Upcoming render under it when they have entries. The screen reads `comingUp ?? []` because a
  list persisted before 042 lacks it.
- **T074 is narrower than listed.** `@full` covers Add to calendar, Coming up and mute/unmute.
  Notify settings, the lock, zone note, all-day and the personal deck are covered by the editor
  unit tests and the API int tests. A browser run would add only rendering already asserted there.

- **Ingestion (PR4):**
  - **Migration `0023_events_ingest`** widens the `ingest_jobs.auto_publish` CHECK with
    `held_event_unverified`. The plan had no migration for US7, but the CHECK lists every outcome.
    Its down file narrows it back (and fails while a row holds the new value).
  - **An extra fallback reason, `invalid_event`.** It covers an event that passes the start, end and
    zone checks but still fails the shared event payload schema (for example a structured `url`
    that is not a URL). The event then becomes a link card, or a text card when there is no URL.
  - **`directCardTypes` (text, link, image).** MCP and bulk import proposals keep this list, so a
    direct proposal can never skip the event rules that extraction applies.
  - **No MCP `timeZone`.** The repo has no MCP ingest tool yet (Phase 13), so only `POST /ingest`
    (share target, paste box, Shortcut) accepts the zone.
  - **`resolveEventZone` lives in `ingest/event-extract.ts`**, next to `logEventExtract`, not in
    `normalize-raw.ts`. The raw payload stays a plain input, and the zone choice and its decision
    log are kept together.
  - **`eventDedupVerdict` returns the verdict itself** instead of feeding `dedupVerdict`. Events
    have no vector arm, so the threshold logic does not apply. `run-dedup` picks the event path
    before any embedding.
  - **The share result shows "Proposed as an event" for published shares too.** On a published
    share it reads "Published as an event: …", because auto-publish can publish a verified event.
  - **The Shortcut sends its zone from a Format Date action with the custom format `VV`.** iOS
    Shortcuts has no time-zone variable, and `VV` is the IANA id.
  - **T098 edits the notify time through "Edit fully".** The inline review form edits only the
    title, body and categories, so the full editor is where an event's times and notify are
    changed before publishing.
