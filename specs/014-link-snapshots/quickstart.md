# Quickstart: Link snapshots and link checks

Validates [spec.md](./spec.md) end to end. Setup per `README.md` (`pnpm dev`, a signed-in editor, `CLOUDINARY_URL` set for section 2). Contract: [link-checks](./contracts/link-checks.md).

## 1. Automated

```sh
pnpm db:migrate                          # applies 0013_link_checks
pnpm test:unit                           # link-status, link-checks.service, link-snapshot-queue, extract-validate, LinkCard
pnpm test:int                            # link-snapshot.int, link-checks.int, items.int, search.int, media-sweep.int, ingest-pipeline.int
pnpm api:openapi && git diff --exit-code packages/api-client
pnpm test:e2e -- links.spec.ts
pnpm db:rollback && pnpm db:migrate      # down file round-trips (search_text regenerated both ways)
```

## 2. Snapshots (PLAN.md Phase 7 demo 3, part 1)

1. Prepare a public test page you control, with an `og:image` (e.g. a static page on any host). `safe-fetch` blocks localhost and private addresses by design, so local fixture servers are only reachable from the integration tests.
2. In the editor, create a link card for the test page. Fetch the preview and save.
3. Within 30 s, `GET /items/<id>` shows `payload.preview.publicId` (`gobbit/links/<deckId>/…`) with `width`/`height`. The card's image now loads from `res.cloudinary.com`.
4. Remove the OG image file (404) and reload the card. It still shows the image.
5. Search for the `publicId` text: no result. Search for the title: the card is found.
6. Change the card's URL and save. A new snapshot replaces the old one. The old asset is removed by the sweep after 7 days (backdate as in 012's quickstart §3 to see it now).
7. Share a link into the deck (ingest). The proposal shows the page's title, description and image (the snapshot).

## 3. Link checks (demo 3, part 2)

1. Remove the test page (404).
2. Run the sweep now: `pnpm --filter @pb/api exec tsx scripts/run-job.ts link-check-sweep`. In SQL, `link_checks` shows `consecutive_failures = 1` and the status is not `dead`.
3. `UPDATE link_checks SET next_check_at = now()`, then run the sweep again. The status is `dead`, and the card shows "Link may be dead".
4. As a reader, the badge is visible, and there are no "Check again"/"Dismiss" actions and no "Links to check".
5. As an editor, open `/d/<slug>/links`: the card is listed. Tap "Dismiss": the badge disappears for everyone, and the list is empty.
6. Put the page back with a different `<title>`, then tap "Check again" on the card page. The card shows "Link may have changed". Tap "Check again" 10 more times: the 11th says to try later (429).
7. Restore the original title and "Check again": the badge clears.
8. On the deployed instance: run `pnpm links:snapshot-backfill`, then repeat section 2 steps 2–4 with a real page you control, and section 3 with a link to a removed test page. Tick demo 3 in `PLAN.md`.
