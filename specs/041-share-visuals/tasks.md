---

description: "Task list for 041-share-visuals"
---

# Tasks: Share visuals

**Input**: Design documents from `/specs/041-share-visuals/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (crawler-identity, preview-builder, decision-events); 012, 014, 015 merged

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 social post, US2 video lookups, US3 best picture, US4 existing cards
- **[Tier]**: `[unit]` `*.test.ts` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker). E2E tier: none (plan, Technical Context)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared constants, the payload markers, the crawler identity, the event vocabulary and the single builder that every story extends.

- [ ] T001 [P] Constants `LINK_IMAGE_RULES_VERSION`, `LINK_IMAGE_CANDIDATES_MAX`, `LINK_IMAGE_TRIES`, `LINK_IMAGE_MIN_STORED_PX`, `LINK_ARTICLE_IMAGE_MIN_PX`, `LINK_LOOKUP_TIMEOUT_MS`, `LINK_LOOKUP_MAX_BYTES`, `LINK_IMAGE_BACKFILL_HOST_SPACING_S` in packages/shared/src/links/constants.ts (re-exported from the subpath)
- [ ] T002 [P] `imageLookup` (int ≥ 1) and `imageRemoved` (literal true) optional on `linkPayloadSchema.preview` in packages/shared/src/schemas/payloads.ts; `linkPreviewSchema` omits them in packages/shared/src/schemas/media.ts; `linkPreview?`, `imageCandidates?` on `normalizedSourceSchema` in packages/shared/src/schemas/ingest.ts; [unit] schema tests next to them
- [ ] T003 [P] [unit] Identity header per kind (`crawler` default, `browser`), `createSafeJsonFetch` (JSON content type, size cap, timeout, invalid JSON, guarded redirect) in apps/api/src/fetch/safe-fetch.test.ts
- [ ] T004 `CRAWLER_USER_AGENT`/`BROWSER_USER_AGENT` in apps/api/src/fetch/user-agents.ts; `identity` option, crawler UA on image fetches, `createSafeJsonFetch` in apps/api/src/fetch/safe-fetch.ts
- [ ] T005 [P] Event names and closed sets (outcomes, reasons, image/title sources, callers) in apps/api/src/fetch/preview-events.ts, plus a `previewHost(url)` helper (lower-case, no `www.`)
- [ ] T006 [unit] `buildLinkPreview` base: one fetch, extract, preview from `og` + first candidate, `none`/`fetch_failed`/`nothing` decisions, never throws, in apps/api/src/fetch/build-preview.test.ts
- [ ] T007 `buildLinkPreview` in apps/api/src/fetch/build-preview.ts; `toLinkPreview` takes the image from candidates and `fetchLinkPreview` delegates to the builder in apps/api/src/fetch/link-preview.ts
- [ ] T008 Wire identities and the builder: link checks `identity: 'browser'`, the snapshot handler and ingest use the builder, in apps/api/src/worker.ts; the editor service uses the builder and logs `link_preview.built` (caller `editor`) in apps/api/src/services/link-preview.service.ts
- [ ] T009 [int] The fixture HTTP server records the User-Agent: page, image and oEmbed requests send `GobbitBot/1.0`, link checks send the browser identity, in apps/api/test/link-preview.int.test.ts and apps/api/test/link-checks.int.test.ts
- [ ] T010 `docs/crawler.md` (contract crawler-identity)

**Checkpoint**: every preview path goes through one builder with an honest identity; behaviour otherwise unchanged

---

## Phase 2: User Story 1 — A shared social post shows its picture and real title (Priority: P1) 🎯 MVP

**Goal**: Real locked-host previews are used and walls are discarded. The caption beats the page description, and nothing is invented.

**Independent Test**: A share of a locked-host URL whose fixture page has a real OG title and image gives a proposal with that title and image. A wall page gives the caption only, with an honest title.

### Tests for User Story 1

- [ ] T020 [P] [US1] [unit] `lockedPreviewVerdict`: site-name only → generic; wall words → login_wall; "Page not found · Instagram" → unavailable; real title → real, in apps/api/src/fetch/locked-host-preview.test.ts
- [ ] T021 [P] [US1] [unit] Builder on locked hosts: real preview used with image; wall discarded whole (image too); `discarded` decision with reason, in apps/api/src/fetch/build-preview.test.ts
- [ ] T022 [P] [US1] [unit] `validateProposal`: caption beats page description; member image beats page image; locked host with no real title and no caption → `<Label> link` + honest body, no description; non-locked unchanged, in apps/api/src/ai/extract-validate.test.ts
- [ ] T023 [P] [US1] [unit] Prompt includes the two title-honesty rules, in apps/api/src/ai/extract-prompt.test.ts
- [ ] T024 [US1] [int] Ingest with a fixture locked host (`lockedHostOf` override or a test host on the list): real OG → proposal with title and `preview.image`, snapshot enqueued with candidates; wall → caption only; `link_preview.built` and `link_preview.applied` asserted, in apps/api/test/ingest-pipeline.int.test.ts
- [ ] T025 [P] [US1] [unit] Snapshot job copies a locked host's preview image (no requeue on a lost race, unchanged), in apps/api/src/jobs/link-snapshot.test.ts

### Implementation for User Story 1

- [ ] T026 [US1] `lockedPreviewVerdict` + `LOCKED_UNAVAILABLE_TITLES` in apps/api/src/fetch/locked-host-preview.ts; locked rule in the builder
- [ ] T027 [US1] `normalizeRaw` uses the builder and stores `linkPreview` + `imageCandidates` in apps/api/src/ingest/normalize-raw.ts (and apps/api/src/fetch/normalize-source.ts)
- [ ] T028 [US1] Ingest: preview from `source.linkPreview` (fallback `toLinkPreview(og)`), `link_preview.built` (caller ingest), `link_preview.applied`, candidates passed to `enqueueIfNeeded` in apps/api/src/jobs/ingest.ts and apps/api/src/ingest/propose.ts
- [ ] T029 [US1] Caption first + honest title/body in apps/api/src/ai/extract-validate.ts; prompt rules in apps/api/src/ai/extract-prompt.ts

**Checkpoint**: locked-host shares use real previews; walls never show; no invented titles

---

## Phase 3: User Story 2 — Video links show a thumbnail (Priority: P2)

**Goal**: Key-free oEmbed fills missing titles and thumbnails for YouTube, TikTok and Vimeo.

**Independent Test**: A YouTube URL whose page has no OG gives a preview from the (fixture) oEmbed answer. An oEmbed failure still gives a preview from the page.

- [ ] T030 [P] [US2] [unit] `lookupHostOf` (hosts, subdomains, youtu.be, Instagram/Facebook absent, non-http); endpoint URLs; answer parsing (title clip, thumbnail http(s) and length, empty), in apps/api/src/fetch/lookup-hosts.test.ts
- [ ] T031 [P] [US2] [unit] Builder lookups: only when needed, at most once, thumbnail appended as `host_lookup`, title only when missing, failure → page preview, `link_preview.lookup` logged, in apps/api/src/fetch/build-preview.test.ts
- [ ] T032 [US2] `LOOKUP_HOSTS`, `lookupHostOf`, `lookupPreview` in apps/api/src/fetch/lookup-hosts.ts; lookup step in apps/api/src/fetch/build-preview.ts; `fetchJson` wired in apps/api/src/worker.ts and apps/api/src/services/link-preview.service.ts
- [ ] T033 [US2] [int] Editor "Fetch preview" for a lookup host via the fixture server (endpoint override injected) returns the oEmbed title/thumbnail; failing oEmbed still answers the page preview, in apps/api/test/link-preview.int.test.ts

**Checkpoint**: video links carry a thumbnail when the host answers

---

## Phase 4: User Story 3 — Ordinary pages show their best picture (Priority: P2)

**Goal**: The ordered image candidates, and snapshot tries that drop a dead image.

**Independent Test**: The corpus test passes (SC-002/SC-003). A card whose first image is dead stores the second one.

### Tests for User Story 3

- [ ] T040 [P] [US3] [unit] `collectImageCandidates`: order, every source kind, JSON-LD shapes and bad JSON, relative/data URIs, length cap, dedup, cap 5, article size/srcset/icon rules, in apps/api/src/fetch/page-images.test.ts
- [ ] T041 [P] [US3] Corpus: 16 hand-written pages + `manifest.json` in apps/api/src/fetch/__fixtures__/preview-pages/
- [ ] T042 [US3] [unit] Corpus test: ≥ 90% found, no OG-only page lost, no-image pages none, in apps/api/src/fetch/page-images.corpus.test.ts
- [ ] T043 [P] [US3] [unit] Snapshot tries: next candidate on image-level failures and too-small copies; storage failure keeps the remote image unstamped; all failed → `image` removed + stamped; `link_snapshot.image` outcomes, in apps/api/src/jobs/link-snapshot.test.ts
- [ ] T044 [US3] [int] Snapshot with the fixture server: first image answers HTML, second ok → second stored with `publicId`; all bad → no `image`, `imageLookup` set (replaces "keeps the remote image when the image URL answers HTML"), in apps/api/test/link-snapshot.int.test.ts

### Implementation for User Story 3

- [ ] T045 [US3] `collectImageCandidates` in apps/api/src/fetch/page-images.ts; `images` + article HTML from the same Readability parse in apps/api/src/fetch/extract-page.ts
- [ ] T046 [US3] Candidate tries, drop, stamp, `LinkSnapshotJob.candidates` in apps/api/src/jobs/link-snapshot.ts and apps/api/src/jobs/queues.ts; env-read tries in apps/api/src/worker.ts

**Checkpoint**: richer pictures, never a dead remote image

---

## Phase 5: User Story 4 — Existing imageless link cards get their picture (Priority: P3)

**Goal**: Once-per-card lookups that respect "Remove photo", plus the one-time pass.

**Independent Test**: The pass enqueues qualifying cards with per-host spacing, skips member-edited ones, and a rerun enqueues none.

### Tests for User Story 4

- [ ] T050 [P] [US4] [unit] `needsLinkSnapshot`: title/description, no image, no publicId, lookup due, not removed; stamped or removed → false, in apps/api/src/jobs/link-snapshot-queue.test.ts
- [ ] T051 [P] [US4] [unit] `link-preview-fields`: client markers ignored, stored carried, `publicId: null` sets `imageRemoved`, a new `publicId` or URL change clears it, in apps/api/src/services/link-preview-fields.test.ts
- [ ] T052 [P] [US4] [unit] Public DTO strips the markers, in apps/api/src/services/public-dtos.test.ts
- [ ] T053 [US4] [int] Remove photo via PATCH stores `imageRemoved`, and the job then logs `member_choice` and adds nothing, in apps/api/test/items.int.test.ts (or link-snapshot.int.test.ts)
- [ ] T054 [US4] [int] Pass: qualifying cards enqueued with `startAfter` spaced per host; member-payload-edited, `imageRemoved`, stamped and deleted cards skipped; rerun enqueues 0; `--dry-run` sends nothing; summary event, in apps/api/test/links-image-backfill.int.test.ts

### Implementation for User Story 4

- [ ] T055 [US4] `needsLinkSnapshot` lookup rule in apps/api/src/jobs/link-snapshot-queue.ts
- [ ] T056 [US4] Markers carried/stripped in apps/api/src/services/link-preview-fields.ts; stripped in apps/api/src/services/public-dtos.ts
- [ ] T057 [US4] `linkImageBackfillCandidates` in apps/api/src/repositories/items.repo.ts; the script in apps/api/scripts/links-image-backfill.ts (testable `runImageBackfill(deps, opts)`), plus a `links:image-backfill` script in apps/api/package.json and the root package.json

**Checkpoint**: existing cards backfilled once, member choices kept

---

## Phase 6: Polish & Cross-Cutting

- [ ] T060 `pnpm api:openapi` (payload schema drift)
- [ ] T061 [P] Docs:
  - ADR-075 in docs/adr.md;
  - one row in the docs/architecture.md ADR index, plus at most one line;
  - detail and the "Deviations" list in docs/design/links.md (builder, candidates, lookups, markers, pass runbook) and docs/design/ingestion.md (locked previews, title honesty);
  - D-number pointer updates where docs name the next free number.
- [ ] T062 [P] README (script + env table), CHANGELOG.md (three optional env vars), PLAN.md link, `x-api-env` in infra/docker-compose.yml if env vars are listed there
- [ ] T063 specs/041-share-visuals/implementation-notes.md (decisions and deviations)
- [ ] T064 `pnpm format && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:int`

---

## Dependencies & Execution Order

- Phase 1 blocks everything. T004 comes before T007/T008, and T007 before T008.
- US1 depends on Phase 1. US2 and US3 depend on Phase 1 and touch `build-preview.ts`, so do them in sequence: US1 → US2 → US3.
- US4 depends on US3 (stamping happens in the job's try loop).
- Polish comes last.

## Parallel Opportunities

- T001/T002/T003/T005 (different packages and files).
- Within each story, the `[P]` test tasks.
- T061/T062 (docs).

## Implementation Strategy

1. **MVP**: Phase 1 + US1. This alone fixes the reported Instagram card, if Instagram answers the crawler.
2. Then US2 and US3, which add pictures for more links.
3. Then US4, which reaches back to existing cards.
4. Ship as one PR. The stories share the builder, and splitting them would ship a half-wired builder.
