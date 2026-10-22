---

description: "Task list for 015-locked-host-links"
---

# Tasks: Links from locked social hosts

**Input**: Design documents from `/specs/015-locked-host-links/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/locked-hosts.md; `012-media-assets` and `014-link-snapshots` merged

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 shared posts, US2 host label, US3 Add photo, US4 checks
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[int]` `apps/api/test/*.int.test.ts` (Docker), `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The registry every story uses.

- [x] T001 [unit] Registry tests (contract §1 table, uppercase, trailing dot, ports, look-alikes, non-http) in packages/shared/src/links/locked-hosts.test.ts
- [x] T002 `LOCKED_HOSTS`, `lockedHostOf` in packages/shared/src/links/locked-hosts.ts; `LOCKED_CAPTION_MAX` in packages/shared/src/links/constants.ts; re-export from packages/shared/src/links/index.ts (no zod import)

**Checkpoint**: `@pb/shared/links` exports the registry

---

## Phase 2: User Story 1 — A shared social post becomes a useful card (Priority: P1) 🎯 MVP

**Goal**: Locked-host shares become link cards with the caption and the shared image as their preview.

**Independent Test**: Share a post URL + caption + image → link card proposal with both.

### Tests for User Story 1

- [x] T010 [P] [US1] [unit] `validateProposal` with `ctx.lockedHost`: model `image`/`text` → `link`; generic OG title ignored; caption trimmed at 500 on a sentence boundary; `preview.publicId` from ctx and no `image`; non-locked URL unchanged, in apps/api/src/ai/extract-validate.test.ts
- [x] T011 [P] [US1] [int] Ingest pipeline: locked URL + text + image → link proposal, `preview.publicId` = the ingest asset with `width`/`height`; no snapshot copy enqueued for the image; text-only share → caption only, in apps/api/test/ingest-pipeline.int.test.ts
- [x] T012 [P] [US1] [unit] Snapshot job for locked hosts: one try, no requeue on failure, generic OG discarded, set `publicId` never replaced, in apps/api/src/jobs/link-snapshot.test.ts

### Implementation for User Story 1

- [x] T013 [US1] `ctx.lockedHost`, `ctx.sharedText` and the locked-host branch in apps/api/src/ai/extract-validate.ts
- [x] T014 [US1] Pass `lockedHostOf(sourceUrl)` and `job.raw.text` in apps/api/src/jobs/ingest.ts (and the extractor-off direct draft path)
- [x] T015 [US1] Locked-host handling and the "skip when `publicId` is set" rule in apps/api/src/jobs/link-snapshot.ts and `enqueueIfNeeded` in apps/api/src/jobs/link-snapshot-queue.ts

**Checkpoint**: Demo 4 works locally with a test share

---

## Phase 3: User Story 2 — Readers can tell where a link goes (Priority: P1)

**Goal**: Host label on locked-host link cards.

**Independent Test**: Each listed host shows its label; other sites don't.

- [x] T020 [P] [US2] [unit] `LinkCard` label for locked hosts (incl. subdomains), domain line otherwise, in apps/web/src/cards/LinkCard.test.tsx
- [x] T021 [US2] Label in apps/web/src/cards/LinkCard.tsx (import from `@pb/shared/links`); `.link-card__host` in apps/web/src/styles.css

---

## Phase 4: User Story 3 — Members can add a photo to any link card (Priority: P2)

**Goal**: "Add photo"/"Remove photo" in the link editor; member photos survive URL changes.

**Independent Test**: Add a photo to a link card, change the URL, the photo stays.

### Tests for User Story 3

- [x] T030 [P] [US3] [unit] `LinkPhoto`: fake uploader → `preview.publicId`; cancel/fail leaves none; remove clears `publicId`/`width`/`height`, in apps/web/src/editor/fields/LinkPhoto.test.tsx
- [x] T031 [P] [US3] [int] Update rule: URL change keeps an `editor`/`ingest` preview asset, drops a `link_snapshot` one; foreign `preview.publicId` → 422, in apps/api/test/items.int.test.ts

### Implementation for User Story 3

- [x] T032 [US3] Asset source lookup for the update rule (`assets.repo` `sourceOf`, if 012 doesn't expose one) in apps/api/src/repositories/assets.repo.ts
- [x] T033 [US3] Drop only `link_snapshot` previews in apps/api/src/services/items.service.ts
- [x] T034 [US3] `LinkPhoto` in apps/web/src/editor/fields/LinkPhoto.tsx (reuses `useImageUpload`); render in `previewSlot` in apps/web/src/editor/fields/LinkEditorFields.tsx; CSS in apps/web/src/styles.css

**Checkpoint**: Hand-made locked-host cards can have an image

---

## Phase 5: User Story 4 — Locked links are not flagged as dead (Priority: P2)

**Goal**: Sweep writes `unchecked` without a probe; manual checks are refused.

**Independent Test**: A due locked-host card ends up `unchecked`, and the host is never contacted.

- [x] T040 [P] [US4] [unit] `sweep` with a fake fetch: locked host never fetched, row `unchecked`, flags null, `next_check_at` in the window; `checkNow` → validation error before the rate limit, in apps/api/src/services/link-checks.service.test.ts
- [x] T041 [P] [US4] [int] Sweep row and `POST /items/{id}/link-check` 422 with the label in `detail`; rate counter unchanged; not listed in `?flag=link`, in apps/api/test/link-checks.int.test.ts
- [x] T042 [US4] Locked-host branch in `sweep` and `checkNow` in apps/api/src/services/link-checks.service.ts

---

## Phase 6: Close-out

- [x] T050 [P] [e2e:full] Label on a locked-host link card; Add photo → saved card shows it; Remove photo, in e2e/tests/full/links.spec.ts
- [x] T051 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm test:int && pnpm budget`
- [x] T052 [P] docs/design/links.md: "Locked social hosts" section (D166–D168, extends ADR-055) and Deviations; docs/design/ingestion.md: the locked-host rule in extraction; docs/architecture.md: no change beyond the Links row
- [x] T053 [P] README.md: the host list and what members should share (caption + image)
- [ ] T054 PLAN.md: link this spec under Phase 7; tick demo 4 only after quickstart section 4 step 4 has run on the deployed instance
- [ ] T055 Run quickstart.md validation
- [ ] T056 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1, US2, US4**: independent of each other after Phase 1
- **US3**: independent; its update rule touches the same service as 014's D163 code
- **External**: `012-media-assets` (asset sources, D160), `014-link-snapshots` (snapshot job, link checks, preview fields); `013-cloud-image` for `CloudImage` in `LinkCard`
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- shared → repo → service → job → web

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(api): locked-host ingest previews`)
- Test fixtures use `example.test` hosts and test images only; never real people's posts
