---

description: "Task list for 013-cloud-image"
---

# Tasks: Responsive images — `CloudImage`

**Input**: Design documents from `/specs/013-cloud-image/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cloud-image.md; `012-media-assets` merged before release (payload `width`/`height`)

**Tests**: REQUIRED (constitution V). Every row of the plan's traceability table maps to a test task below.

**Organization**: Tasks are grouped by user story.

## Format: `[ID] [P?] [Story] [Tier?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 shown-width sizing, US2 reserved box + placeholder, US3 one component everywhere
- **[Tier]**: `[unit]` `*.test.ts(x)` next to code, `[e2e:smoke]` `e2e/tests/smoke/`, `[e2e:full]` `e2e/tests/full/` (tier rule: constitution V, ADR-053)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: URL builder and the measuring hook.

- [x] T001 [P] `cloudinaryPlaceholderUrl(cloudName, publicId)` (`f_auto,q_1,e_blur:2000,w_32`) and `PLACEHOLDER_WIDTH` in apps/web/src/cards/cloudinary.ts
- [x] T002 [P] [unit] Placeholder URL and unchanged sharp URLs/srcset in apps/web/src/cards/cloudinary.test.ts
- [x] T003 Move `imageSizesFor` from apps/web/src/browse/use-image-sizes.ts to apps/web/src/cards/use-element-width.ts; add `useElementWidth(ref)` (one module-level `ResizeObserver`, a `WeakMap` of callbacks, 8 px hysteresis)
- [x] T004 [P] [unit] `ResizeObserver` stub helper in apps/web/src/test/resize-observer.ts (registered in the Vitest setup)

**Checkpoint**: Hook and URL helpers ready

---

## Phase 2: User Story 1 — Images load at the size they are shown (Priority: P1) 🎯 MVP

**Goal**: The list asks the browser for the column width, not `100vw`.

**Independent Test**: The list image's `sizes` is the column width in px; Lighthouse shows no "properly size images".

### Tests for User Story 1

- [x] T010 [P] [US1] [unit] `useElementWidth`: estimate before measuring, measured width after the observer fires, changes < 8 px ignored, unobserve on unmount, in apps/web/src/cards/use-element-width.test.ts
- [x] T011 [P] [US1] [unit] `CloudImage` `sizes`/`srcset`/`src` and lazy vs. `priority` loading in apps/web/src/cards/CloudImage.test.tsx
- [x] T012 [P] [US1] [e2e:smoke] List image card: `sizes` ends in `px` and is ≤ the column width; `srcset` has three widths, in e2e/tests/smoke/items.spec.ts

### Implementation for User Story 1

- [x] T013 [US1] `CloudImage` (wrapper span + sharp img; `sizes` from `useElementWidth`; `priority`) in apps/web/src/cards/CloudImage.tsx
- [x] T014 [US1] `ImageCard` renders `CloudImage`; remove the `sizes` prop from `ImageLoading` in apps/web/src/cards/ImageCard.tsx and apps/web/src/cards/CardBody.tsx

**Checkpoint**: Demo 2's sizing fix is in place

---

## Phase 3: User Story 2 — No layout jumps while images load (Priority: P1)

**Goal**: Reserved box from the dimensions; blurred placeholder; fade respecting reduced motion.

**Independent Test**: Throttled list: boxes have the right shape before load; blur visible; no movement below an image.

### Tests for User Story 2

- [x] T020 [P] [US2] [unit] `width`/`height` attributes when known; `cloud-image--unknown` when not; placeholder rendered `aria-hidden` with an empty alt; `load` → `cloud-image--loaded` and placeholder removed; `error` → placeholder removed and `onError` called, in apps/web/src/cards/CloudImage.test.tsx
- [x] T021 [P] [US2] [unit] `ImageCard` passes the payload dimensions; pre-010 payload (none) still renders, in apps/web/src/cards/ImageCard.test.tsx

### Implementation for User Story 2

- [x] T022 [US2] Placeholder img, load/error state and classes in apps/web/src/cards/CloudImage.tsx
- [x] T023 [US2] `.cloud-image`, `__placeholder`, `__img`, `--unknown` (4:3, contain), `--loaded`, max height `min(70vh, 640px)`, and the fade inside `@media (prefers-reduced-motion: no-preference)` in apps/web/src/styles.css; remove the superseded `.image-card__img` rules
- [x] T024 [US2] `cloudinary-images` `maxEntries` 300 → 600 in apps/web/src/sw.ts

**Checkpoint**: Stories 1 and 2 work together

---

## Phase 4: User Story 3 — One image component everywhere (Priority: P2)

**Goal**: The list, card page, Browse and editor preview share the component; the Browse-only hook is gone.

**Independent Test**: Every place shows the same behaviour; Browse's current card still has high priority.

### Tests for User Story 3

- [x] T030 [P] [US3] [unit] `BrowseStack` passes `priority` to the current card only; no `sizes` prop, in apps/web/src/browse/BrowseStack.test.tsx
- [x] T031 [P] [US3] [unit] Editor `ImageFields` preview renders `CloudImage` right after upload, in apps/web/src/editor/fields/ImageFields.test.tsx
- [x] T032 [P] [US3] [e2e:smoke] `browse.spec.ts` and `editor.spec.ts` image paths still pass (no changes expected beyond selectors)

### Implementation for User Story 3

- [x] T033 [US3] Drop `useImageSizes` from apps/web/src/browse/BrowseStack.tsx (and `ContentPane`/`BrowsePage` props); delete apps/web/src/browse/use-image-sizes.ts and its test
- [x] T034 [US3] Update any remaining `.image-card__img` selectors in e2e/tests/smoke/

**Checkpoint**: All three stories work independently

---

## Phase 5: Close-out

- [x] T040 `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:unit && pnpm build:web && pnpm budget` (record the new gzip size)
- [x] T041 [P] docs/design/card-media.md: "Responsive images" section (D161–D162) and Deviations; docs/design/browse-mode.md: replace the `useImageSizes` note; docs/design/web-pwa.md: the service worker cache size; docs/architecture.md: at most one line on the Card media row
- [x] T042 [P] README.md: no new commands; mention the Lighthouse check under the web section if it lists performance checks
- [x] T043 [P] CLAUDE.md ground rules (Web): stored images only through `CloudImage`
- [ ] T044 PLAN.md: link this spec under Phase 7 with the new bundle size; tick demo 2 only after quickstart section 2 has run on the deployed instance
- [ ] T045 Run quickstart.md validation
- [ ] T046 `/speckit-converge` until it reports Converged

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: blocks all stories
- **US1 → US2**: same component file; US2 extends it
- **US3**: after US1 (the component exists)
- **External**: `012-media-assets` for dimensions (merge order only; the code handles their absence); `014-link-snapshots` reuses the component for link previews
- **Close-out**: after all stories

### Within Each User Story

- Tests written and FAILING before implementation
- helpers → component → callers → CSS → e2e

---

## Notes

- [P] tasks = different files, no dependencies
- Log decisions the plan did not make, and deviations, in implementation-notes.md as you go
- Commit after each task or logical group (e.g. `feat(web): CloudImage with measured sizes and blurred placeholder`)
- No inline styles: the box comes from the `width`/`height` attributes and CSS classes
