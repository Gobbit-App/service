# Implementation Plan: Share visuals

**Branch**: `feat/041-share-visuals` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Phase 6+

**Input**: Feature specification from `/specs/041-share-visuals/spec.md`

## Summary

Shared links should arrive with a real picture and an honest title. Today the server fetches pages with a browser-like identity, reads only `og:image`, and gives up on locked hosts. As a result Instagram shares come back as login walls and many ordinary pages have no picture.

This plan makes six changes:

1. **Crawler identity**: preview fetches identify honestly as `GobbitBot` (D343). Link checks keep the browser identity.
2. **One preview builder**: a single builder serves ingest, the snapshot job and the editor (D346). It collects image candidates in a fixed order (D344) and asks YouTube/TikTok/Vimeo through key-free oEmbed when the page falls short (D345).
3. **Locked hosts**: a real preview is used; a wall or "unavailable" page is discarded whole. The member's caption beats the page description (D347).
4. **Title honesty**: a locked-host share with nothing readable gets an honest title instead of an invented one (D348).
5. **Snapshot job**: it tries up to three candidates and drops a dead remote image (D349). Two server-owned jsonb markers make that once per card and respect "Remove photo" (D350).
6. **One-time pass**: a host-spaced pass backfills existing imageless link cards (D351).

Every outcome is a decision event (D352). A committed page corpus measures SC-002/SC-003 (D353). There is no migration and no new dependency.

## Starting point

- main @ `bf922dd` (041 spec merged, #111), latest migration `0021_reminders`, deployed.
- Builds on:
  - 012 media: `uploadFromUrl`, assets, `media-sweep` (ADR-054);
  - 014 link snapshots and checks (ADR-055, D163);
  - 015 locked hosts (D166–D168);
  - safe-fetch (ADR-048, D102).
- Relevant code:
  - `apps/api/src/fetch/`: `safe-fetch`, `extract-page`, `link-preview`, `locked-host-preview`, `normalize-source`;
  - `ingest/normalize-raw.ts`;
  - `jobs/ingest.ts`, `jobs/link-snapshot*.ts`;
  - `ai/extract-{prompt,validate}.ts`;
  - `services/link-preview{,-fields}.ts`, `services/link-preview.service.ts`;
  - `scripts/links-snapshot-backfill.ts`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: existing only: undici (via safe-fetch), linkedom + `@mozilla/readability`, zod, pg-boss. No new package (research D344/D345).

**Storage**: PostgreSQL 17. No schema change. Two optional server-owned keys on the link payload's `preview` jsonb (data-model.md) and two optional keys on the stored normalized source.

**Testing**: Vitest unit (candidates, corpus, lookups, builder, validator, job), integration (Testcontainers, a local fixture HTTP server for pages, oEmbed and images), no real third-party calls.

**E2E tier**: none. No new UI or flow. Sharing and editing a link are already covered by `@smoke` (`share.spec.ts`, `editor.spec.ts`), and their UI is unchanged. What changes is server-side and depends on third-party sites, which a smoke test can't use without faking them. That is covered by unit tests and integration tests against a local site. SC-001 (Instagram from production) is a manual post-deploy check (quickstart §5).

**Target Platform**: Docker Compose on Dokploy (API + worker)

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**:

- SC-005: at most 3 s added to a share's processing. A lookup is capped at 2.5 s and runs at most once; image tries happen in the snapshot job, after the proposal exists.
- The editor lookup is cached as today.

**Constraints**: card payload ≤ 8192 bytes. The new markers are a few bytes, and the candidates live in job data, not the payload. Outbound only through safe-fetch. AI keys optional (the title rule for locked hosts is deterministic).

**Scale/Scope**: family/community decks, up to low thousands of link cards per instance for the pass.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | Fetching and extraction stay in `fetch/`. Rules sit in `extract-validate`, `link-preview-fields` and the job handler. The pass's SQL is a repository method. No route changes. |
| II. One source of truth | One preview builder for all callers. One lookup-host list. Limits and the rules version in `@gobbit/shared/links/constants.ts`. `linkPayloadSchema` gains the two markers, and the DTOs omit them. |
| III. Invariants in the DB | No new DB invariant. The markers are server-owned in the service, like `publicId`/`width`/`height` (D163). The D160 asset check is unchanged. |
| IV. Private by default | Fetches only URLs members shared or cards hold. The identity is honest and needs no login, cookies or scripts. Lookups go through safe-fetch. Events carry the host and ids, never URLs or content. The markers are left out of the public DTO. |
| V. Tests at the right tier | Unit tests for all pure logic plus the corpus (SC-002/003); integration tests for ingest, the job, the editor route and the pass. E2E tier none, with the reason above. Traceability below. |
| VI. Lean offline-first web | No web code change beyond keeping the editor from sending markers (it already drops non-string preview fields). No bundle impact. |
| VII. Simple, optional, deployable | No dependency. No key needed (key-free oEmbed only). Works without Cloudinary: no copies, and the remote image rule is unchanged when uploads are off. Three optional env vars. |
| VIII. Accountable by default | Four events plus the pass summary (table below); closed sets; host plus ids only; limits env-tunable. |

No violations. Re-checked after Phase 1 design (data-model, contracts): unchanged.

## Decisions this plan pins down

Full reasoning in [research.md](./research.md).

| ID | Decision | ADR? |
|----|----------|------|
| D343 | `GobbitBot/1.0` crawler identity (+ `docs/crawler.md`) for preview pages, lookups and image downloads; link checks keep the browser identity | yes → ADR-075 |
| D344 | Ordered image candidates: OG → secure OG → Twitter → JSON-LD → `image_src` → video poster → largest stated-size article image (≥ 300 px, no icon names); absolute http(s), ≤ 5 | no |
| D345 | Key-free oEmbed for YouTube/TikTok/Vimeo through `createSafeJsonFetch` (64 KB, 2.5 s), only when the page falls short; never Instagram/Facebook | no (part of ADR-075) |
| D346 | One `buildLinkPreview` for ingest, the snapshot job and the editor | no |
| D347 | Locked hosts: real previews used; generic/wall/unavailable discarded whole; caption beats page description (revises D167/D168) | no (extends ADR-055) |
| D348 | Prompt rules for page titles; a deterministic honest title/body for unreadable locked-host shares | no |
| D349 | Snapshot job tries up to `LINK_IMAGE_TRIES` candidates and drops a dead remote image; storage failures keep it | no (extends ADR-055) |
| D350 | `preview.imageLookup` (rules version) and `preview.imageRemoved`, server-owned, no migration | no (extends ADR-055) |
| D351 | `pnpm links:image-backfill`: qualifying cards, skips member payload edits, per-host spacing | no |
| D352 | Events `link_preview.built`, `link_preview.lookup`, `link_preview.applied`, `link_snapshot.image`, `link_snapshot.backfill` | no |
| D353 | Hand-written HTML corpus + manifest for SC-002/SC-003 | no |

## Project Structure

### Documentation (this feature)

```text
specs/041-share-visuals/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── crawler-identity.md
│   ├── preview-builder.md
│   └── decision-events.md
├── quickstart.md
├── tasks.md
└── implementation-notes.md   # during /speckit-implement
```

### Source Code (repository root)

```text
packages/shared/src/
├── links/constants.ts                     # + LINK_IMAGE_* / LINK_LOOKUP_* / LINK_ARTICLE_IMAGE_MIN_PX, rules version
├── schemas/payloads.ts                    # linkPayloadSchema.preview + imageLookup, imageRemoved
├── schemas/media.ts                       # linkPreviewSchema omits them
└── schemas/ingest.ts                      # normalizedSourceSchema + linkPreview?, imageCandidates?

apps/api/src/
├── fetch/user-agents.ts                   # NEW: CRAWLER_USER_AGENT, BROWSER_USER_AGENT
├── fetch/safe-fetch.ts                    # identity option; createSafeJsonFetch; image fetch uses crawler UA
├── fetch/extract-page.ts                  # + images (candidates), article HTML from the same Readability parse
├── fetch/page-images.ts                   # NEW: ordered candidates (D344)
├── fetch/lookup-hosts.ts                  # NEW: oEmbed host list + lookup (D345)
├── fetch/build-preview.ts                 # NEW: buildLinkPreview (D346)
├── fetch/link-preview.ts                  # toLinkPreview takes candidates; fetchLinkPreview → builder
├── fetch/locked-host-preview.ts           # generic = site name | wall | unavailable, with reason (D347)
├── fetch/__fixtures__/preview-pages/      # NEW: corpus + manifest (D353)
├── ingest/normalize-raw.ts                # uses the builder; stores linkPreview + imageCandidates
├── jobs/ingest.ts                         # preview from source.linkPreview; applied event; candidates → snapshot
├── jobs/queues.ts                         # LinkSnapshotJob.candidates?
├── jobs/link-snapshot-queue.ts            # needsLinkSnapshot: lookup due; enqueueIfNeeded(row, candidates?)
├── jobs/link-snapshot.ts                  # candidate tries, drop, stamp, image event (D349)
├── ai/extract-prompt.ts                   # title-honesty rules (D348)
├── ai/extract-validate.ts                 # caption first; unreadable locked share → honest title/body
├── services/link-preview-fields.ts        # carry/strip markers; imageRemoved on Remove photo
├── services/link-preview.service.ts       # builder + cache; built event (caller editor)
├── services/public-dtos.ts                # strip markers
├── repositories/items.repo.ts             # linkImageBackfillCandidates(afterId, n)
└── worker.ts                              # wiring: identities, json fetch, builder
apps/api/scripts/links-image-backfill.ts   # NEW: the pass (D351)
apps/api/test/*.int.test.ts                # link-snapshot, link-preview, ingest-pipeline, links-image-backfill (NEW)

docs/crawler.md                            # NEW
docs/design/links.md, docs/design/ingestion.md, docs/adr.md (ADR-075), docs/architecture.md (1 row)
README.md (script + env), CHANGELOG.md (env vars), PLAN.md (link)
```

**Structure Decision**: everything new is in `apps/api/src/fetch/`, which already owns outbound fetching and page reading. The builder sits there, not in a service, because the worker and the API both call it with injected fetchers. Shared limits go in the existing `@gobbit/shared/links` subpath.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 crawler identity on page, lookup, image fetches | `safe-fetch.ts`, `user-agents.ts` | `safe-fetch.test.ts` (unit: header per identity); `link-preview.int.test.ts` (int: fixture server records the UA) |
| FR-002 link checks keep browser identity | `worker.ts` wiring | `safe-fetch.test.ts` (unit); `link-checks.int.test.ts` (int: recorded UA) |
| FR-003 locked real preview used | `build-preview.ts` | `build-preview.test.ts` (unit); `ingest-pipeline.int.test.ts` (int: locked fixture host with real OG → preview + image) |
| FR-004 member image wins; caption beats description | `extract-validate.ts` | `extract-validate.test.ts` (unit) |
| FR-005 locked image copied | `link-snapshot.ts` | `link-snapshot.int.test.ts` (int) |
| FR-006 locked hosts still not probed | unchanged `link-checks.service` | existing `link-checks.int.test.ts` |
| FR-007/008 key-free lookup list only | `lookup-hosts.ts` | `lookup-hosts.test.ts` (unit: list, Instagram/Facebook absent, URL building) |
| FR-009 lookup failure never fails a share | `build-preview.ts` | `build-preview.test.ts` (unit: timeout, bad JSON, 404 → preview from page) |
| FR-010 candidate order | `page-images.ts` | `page-images.test.ts` (unit) + corpus |
| FR-011 article image rules | `page-images.ts` | `page-images.test.ts` (unit: size, icon names, srcset) |
| FR-012 absolute http(s), length cap | `page-images.ts` | `page-images.test.ts` (unit) |
| FR-013 tries, then drop | `link-snapshot.ts` | `link-snapshot.test.ts` (unit); `link-snapshot.int.test.ts` (int: first image HTML, second ok → second stored; all bad → image removed) |
| FR-014 once per card, member choice respected | `link-snapshot-queue.ts`, `link-preview-fields.ts` | `link-snapshot-queue.test.ts`, `link-preview-fields.test.ts` (unit); `items.int.test.ts` (int: Remove photo sets `imageRemoved`, client value ignored) |
| FR-015 pass spreads per host | `links-image-backfill.ts` | `links-image-backfill.int.test.ts` (int: `startAfter` per host; member-edited card skipped; rerun enqueues none) |
| FR-016 no invented titles | `extract-prompt.ts`, `extract-validate.ts` | `extract-prompt.test.ts`, `extract-validate.test.ts` (unit) |
| FR-017/018 decision events | builder, ingest, job, pass | asserted in the tests above through an injected logger |
| SC-002/SC-003 corpus | `page-images.ts` | `page-images.corpus.test.ts` (unit) |
| SC-005 ≤ 3 s | lookup timeout, one lookup | `build-preview.test.ts` (unit: lookup only when needed, at most once) |
| SC-001 Instagram from production | — | quickstart §5 (manual, post-deploy) |

## Accountability

| Decision | Event | Outcomes · reasons | Fields (ids/hashes only) | Level | Watched | Alert threshold (default) | Test |
|----------|-------|--------------------|--------------------------|-------|---------|---------------------------|------|
| Which preview a link gets (or none) | `link_preview.built` | `preview`, `none`, `discarded` · `generic`, `login_wall`, `unavailable`, `fetch_failed`, `nothing` | caller, jobId/requestId, itemId?, deckId?, host, lockedHost?, imageSource, titleSource, lookup, ms | info (`discarded` warn) | aggregate per host by outcome; rate of `discarded` per locked host (FR-018) | `discarded` > 80% of ≥ 10 builds for one host in 24 h → warn | `build-preview.test.ts`, `ingest-pipeline.int.test.ts` |
| Host lookup used and its result | `link_preview.lookup` | `ok`, `empty`, `failed` · `timeout`, `http_error`, `invalid`, `blocked` | caller, jobId/requestId, host, ms | info (`failed` warn) | rate of `failed` per host | `failed` > 50% of ≥ 5 per host in 1 h → warn | `lookup-hosts.test.ts`, `build-preview.test.ts` |
| What a share's card got (image/description source) | `link_preview.applied` | image `member_share`, `page`, `none`; description `caption`, `page`, `none`; `honest_title` true when D348 replaced the title | jobId, itemId, deckId, host, lockedHost? | info | aggregate per locked host | none (dashboard) | `ingest-pipeline.int.test.ts` |
| Snapshot image kept, replaced or dropped | `link_snapshot.image` | `copied`, `dropped`, `kept`, `none`, `member_choice` · last failure reason (`http_error`, `not_image`, `too_large`, `blocked`, `timeout`, `too_small`, `upload_failed`, `unavailable`) | jobId, itemId, deckId, host, tries | info (`dropped` warn) | rate of `dropped` | `dropped` > 30% of ≥ 20 runs in 24 h → warn | `link-snapshot.test.ts`, `link-snapshot.int.test.ts` |
| One-time pass enqueued cards | `link_snapshot.backfill` | `done` · counts: scanned, enqueued, skipped_member_edit, hosts | runId | info | instance | none (operator-run) | `links-image-backfill.int.test.ts` |

**Operator controls** (defaults in `@gobbit/shared/links/constants.ts`, README env table, CHANGELOG):

- `LINK_IMAGE_TRIES`: default 3.
- `LINK_LOOKUP_TIMEOUT_MS`: default 2500.
- `LINK_ARTICLE_IMAGE_MIN_PX`: default 300.
- Script flag `--host-spacing <s>`: default 60.

## Rollout

- **Migrations**: none.
- **Env / config**: three optional vars (above). CHANGELOG entry, not "Action required". README env table.
- **API client**: `pnpm api:openapi`. The `linkPayloadSchema` markers appear in the item schema as optional; the lookup DTO is unchanged. CI checks drift.
- **Deploy order**:
  1. Deploy normally.
  2. Run the quickstart §5 Instagram check from production.
  3. Run `pnpm links:image-backfill` once, inside the API container (see `docs/design/links.md`).

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Instagram walls the production server despite the crawler identity | M / M | 015 behaviour remains: the wall is discarded, and the caption and member image apply. The per-host discard rate shows it. |
| Some ordinary site refuses `GobbitBot` where it served a browser | L / L | Previews only. Link checks keep the browser identity. Event per host. |
| oEmbed endpoint changes or rate-limits | M / L | Failure only means less preview. `lookup.failed` alert. One list to edit. |
| Article image picks a wrong picture | M / L | Stated-size rule, icon-name filter, last in order. Members can replace or remove it. |
| Pass touches cards a member cleared before markers existed | L / M | Skips any card with a member payload edit (conservative). |

## Settle before starting

- [x] The crawler info page lives in the public repository (`docs/crawler.md`). No app route needed.
- [x] No impersonation of other crawlers (D343).

## Complexity Tracking

None.
