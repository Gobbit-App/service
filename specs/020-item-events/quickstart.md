# Quickstart: Deck activity log

Validates [spec.md](./spec.md) end to end. Setup per `README.md`; 019 merged for the co-owner screen (or invite via `api.http`). Contract: [events-api](./contracts/events-api.md).

## 1. Automated

```sh
pnpm db:migrate && pnpm db:rollback && pnpm db:migrate
pnpm test:unit                 # diff-fields, can
pnpm test:int                  # item-events.int
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm build:web && pnpm budget
pnpm test:e2e -- full/activity-log.spec.ts
```

## 2. Demo 5

1. As the owner, invite a second admin as Co-owner (019) and accept in another browser profile.
2. As an editor (or via sharing), propose a card. As the co-owner, publish it from the review queue.
3. As the owner, edit another card's title and archive a third.
4. As the owner, open Deck menu → Activity: newest first — archived (owner), updated `title` (owner), published (co-owner), proposed (editor, via share).
5. Open the published card → History: its proposed and published lines.
6. As an editor, open `/d/<slug>/log`: "Only admins can see activity".

## 3. Deployed instance

Run section 2 on the community deck with the real second admin; tick demo 5 in `PLAN.md`.
