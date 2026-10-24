# Implementation notes: 020-item-events

Plan: `specs/020-item-events/plan.md`, tasks: `tasks.md`. Branch `phase8-020-item-events`, stacked on 018 (`phase8-018-public-search`); 019 is not a code dependency.

Migration `0015_item_events` (enums `actor_via`, `item_event_kind`; table `item_events`). No queue or env var. E2E tier: full (`e2e/tests/full/activity-log.spec.ts`): an admin screen, not a critical journey.

## Decisions not specified by the plan

- **`insertItemEvents(tx, item, events)`** in `repositories/item-events.repo.ts` is the one write helper; `items.repo` and the review transaction repos call it with the written row.
- **Ordering inside one write**: lines get `created_at = now() + i ms`, otherwise a PATCH's `updated` and `published` share a timestamp and the id tie-break orders them randomly.
- **`eventFrom(actor, kind, title, changes?)`** maps `Actor.via` to `actor_via`; `proposeItem` builds its input directly with `via: 'ingest'`.
- **Web**: `events/` holds `EventLog`, `EventRow`, `event-copy.ts`, `ActivityLink` and `log-search.ts`; `ItemHistoryLink` lives in `items/`. `EVENTS_KEY` is in `NOT_PERSISTED`.

## Deviations from the plan

- **`events` array instead of `event?`** on repository writes (one PATCH can log two lines).
- **`status` added to the field names**; a PATCH status move logs `updated` then `published`/`archived`.
- **Publish logs no `changes`**; merge `changes` include `verifiedAt` when publishing sets it.
- **Title** comes from the written row (after the change); ids use `gen_random_uuid()` like other tables.
- **"Former member"** when the user row is missing or soft-deleted.
- **The proposal's own soft delete on merge logs nothing**; the target gets one `merged` line.
- **"Activity" is a header link** next to the Review pill (there is no deck menu in the PWA).
- **Empty-state copy** has no deploy date.
- **T010 "forced failure"** is covered by a refused write (a foreign category) rolling back with no line.
- **T013**: a second admin can't sign in from e2e, so the owner publishes and archives; other admins' names are covered by the integration test.
- **T054–T056**: not run; the PLAN demo and quickstart need the deployed instance.
