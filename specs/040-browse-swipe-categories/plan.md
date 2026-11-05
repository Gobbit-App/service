# Implementation Plan: 040 Browse rework

**Branch**: `feat/040-browse-rework` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md) | **Roadmap**: `PLAN.md` § Usability passes

**Input**: Feature specification from `specs/040-browse-swipe-categories/spec.md`

Research: [research.md](./research.md) · Data model: [data-model.md](./data-model.md) · Contract: [contracts/browse-ui.md](./contracts/browse-ui.md) · Validation: [quickstart.md](./quickstart.md)

## Summary

Browse goes back to 009's model with 034's native scrolling. Cards move vertically and categories
move sideways, on two nested native scroll-snap tracks. The main view shows only the card's
content, on its own surface. The metadata moves to a full view overlay, opened from the dock or
with a long press. A short banner names each new category, and tapping it (or the top bar's
category name) opens a one-handed category list. Emails, phones, web addresses and numbers in a
card's text become tap targets, inside the Browse chunk only. Web only: no API, DB, OpenAPI or env
change.

## Starting point

main @ `34fc327`: 034 Browse (horizontal card track, chip rail, dock, end page; ADR-065) and
the merged 040 spec (#107). The tooltip fix (#106) took D324, so this plan uses D325–D340. The
latest ADR is ADR-071. Browse is deployed. The code is in `apps/web/src/browse/`
(`docs/design/browse-mode.md`).

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: React + Vite + TanStack Router/Query (web). New: `linkify-it`
(URL/email detection, D339) and `unist-util-visit` (already in the tree through remark, now
direct). Both are only in the lazy Browse chunk.

**Storage**: none. Browse keeps reading the list's query cache; the hint key moves to `v3`.

**Testing**: Vitest (unit, jsdom) next to the modules; Playwright `@smoke` and `@full`.

**E2E tier**: smoke. Reading a deck in Browse is a critical journey, and the current smoke spec
asserts the sideways card model this feature reverses. `e2e/tests/smoke/browse.spec.ts` is
rewritten (vertical swipes, sideways category swipe and banner, list jump, full view, card
category tap). Variants go to full (`e2e/tests/full/browse-rework.spec.ts`): detected text, keys,
ends banner, full view swipe-out.

**Target Platform**: PWA on Android Chrome first, iOS Safari as stated in the spec.

**Project Type**: pnpm monorepo, web package only.

**Performance Goals**: no JS on the gesture path; swiping 20 image cards shows no main-thread
task over 50 ms (SC-007).

**Constraints**: initial bundle ≤ 150 KB gzip, unchanged (Browse is lazy). Same origin. Text
detection never changes stored data.

**Scale/Scope**: decks with tens of categories and hundreds of cards each.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | N/A: no API change. |
| II. One source of truth for contracts | N/A: no DTO change; no `pnpm api:openapi`. |
| III. Invariants live in the database | N/A: no data change. |
| IV. Private by default | Browse reads the list's own visibility-filtered query; hidden categories never appear in the cycle (FR-008). Detected web addresses open only `http(s)`; `mailto:`/`tel:` are built from detected text, never from markup. |
| V. Tests at the right tier | Unit tests for the pure modules (segmenter, remark plugin, keys, layer state, cycle, long press, banner timer) and components. Smoke e2e is rewritten; variants go to full. Table below. |
| VI. Lean, offline-first web | No change to the initial chunk. `linkify-it` and the renderers sit in the Browse chunk (budget check). Offline reading works as before from the persisted cache; detected-text actions work offline except opening a web address (FR-028). |
| VII. Simple, optional, deployable | Native scroll-snap, no gesture library (ADR-065 kept). One small, maintained dependency for detection; rejected `libphonenumber-js` (research D339). No deploy change. |
| VIII. Accountable by default | No decisions about people or content: see Accountability. |

Post-design re-check: no violations; Complexity Tracking stays empty.

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D325 | Two nested native snap tracks: categories on x, cards on y | yes → ADR-072 |
| D326 | A tall card is an oversized snap area, not an inner scroller | ADR-072 |
| D327 | 24 px `pan-y` edge strips; wide content contains its x overscroll | ADR-072 |
| D328 | Mount current category ±1; leaving a category resets it to its first card | ADR-072 |
| D329 | No wrap-around; a pull at the ends shows the end banner | no |
| D330 | One banner, peek (2 s) or open; counts only when known | no |
| D331 | The category list is a panel down to the dock, with a scrim and roving focus | no |
| D332 | Layers (list, full view) are pushed history entries in router state | ADR-072 |
| D333 | Full view is a snap scroller with a transparent tail (swipe-out) | ADR-072 |
| D334 | Long press: 500 ms, 10 px slop, links/buttons/detected text excluded | no |
| D335 | Content-first card surface; `Card meta={false}` | no |
| D336 | Top bar: close · category name · counter; dock gains Full view | no |
| D337 | Keys: ↑/↓ cards (tall cards scroll first), ←/→ categories, `f`, Escape | no |
| D338 | First-run sheet `gobbit:browse-hint:v3` | no |
| D339 | Detection: `linkify-it` + own number rules, as a remark plugin via context | ADR-072 |
| D340 | Tap actions: `mailto:`/`tel:`/open links, copy button with a toast | no |

## Project Structure

### Documentation (this feature)

```text
specs/040-browse-swipe-categories/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/browse-ui.md
├── tasks.md
└── implementation-notes.md
```

### Source Code

```text
apps/web/src/
├── browse/
│   ├── BrowseScreen.tsx        # cycle, category track, layers, banner, keys (rewritten)
│   ├── CategoryTrack.tsx       # NEW outer x track: one page per category, ±1 mounted
│   ├── BrowseCards.tsx         # + active flag; state pages on the y track
│   ├── BrowseStack.tsx         # y track; only the active stack is live; tall-card keys
│   ├── BrowsePage.tsx          # content only, card surface, edge strips, long press
│   ├── TopBar.tsx              # category name button replaces the rail
│   ├── CategoryRail.tsx        # REMOVED
│   ├── CategoryBanner.tsx      # NEW peek/end banner
│   ├── CategoryList.tsx        # NEW list panel + scrim
│   ├── FullView.tsx            # NEW overlay: sheet + tail, metadata, category buttons
│   ├── BrowseDock.tsx          # arrow-up/down, Full view
│   ├── browse-layer.ts         # NEW layer state helpers
│   ├── browse-keys.ts          # new key map
│   ├── category-counts.ts      # NEW known totals from the query cache
│   ├── use-current-card.ts     # attribute + coverage over the root
│   ├── use-long-press.ts       # NEW
│   ├── motion.ts               # axis-aware scrollToPage
│   ├── hint-store.ts · FirstRunHint.tsx   # v3 tips
│   ├── sections/CardDetails.tsx            # category buttons in full view
│   └── detect/                 # NEW segment.ts, remark-detect.ts, Detected.tsx, detection.tsx
├── cards/
│   ├── Card.tsx                # `meta` prop
│   ├── TextCard.tsx · TableCard.tsx        # read the detection context
│   └── text-detection.ts       # NEW context (types only, no detection code)
└── ui/icons/icon-paths.ts      # `expand`

e2e/tests/smoke/browse.spec.ts            # rewritten
e2e/tests/full/browse-rework.spec.ts      # NEW
```

**Structure Decision**: only `apps/web` and `e2e` change. The detection code stays in
`browse/detect/` so it ships in the Browse chunk; `cards/` gets only a context it reads.

## Invariant → test traceability

| Rule | Enforced in | Test (file, tier) |
|------|-------------|-------------------|
| FR-001 no metadata on the main view | `BrowsePage` (`meta={false}`, no sections) | `BrowseScreen.test.tsx`, unit; `browse.spec.ts`, smoke |
| FR-003 top bar, no chip rail | `TopBar` | `TopBar.test.tsx`, unit |
| FR-004 dock order, disabled ends | `BrowseDock` | `BrowseDock.test.tsx`, unit |
| FR-005/006/007 vertical paging, tall cards, end page | `.browse__track` CSS, `BrowseStack` | `browse.spec.ts`, smoke; `BrowseStack` keys in `BrowseScreen.test.tsx`, unit |
| FR-008 category order, no wrap | `category-cycle.ts`, `CategoryTrack` | `category-cycle.test.ts`, unit; `browse.spec.ts`, smoke |
| FR-009 edge strips, wide content | CSS (`touch-action`, `overscroll-behavior`) | `browse-rework.spec.ts`, full |
| FR-011 banner within 2 s, end banner | `CategoryBanner` | `CategoryBanner.test.tsx`, unit; `browse.spec.ts`, smoke |
| FR-012–014 list: pick, dismiss, keyboard | `CategoryList`, layers | `CategoryList.test.tsx`, unit; `browse.spec.ts`, smoke; `browse-rework.spec.ts`, full |
| FR-015 long press rules | `use-long-press.ts` | `use-long-press.test.tsx`, unit |
| FR-016/017 full view content and metadata | `FullView` | `FullView.test.tsx`, unit; `browse.spec.ts`, smoke |
| FR-018 no surviving history entry | `browse-layer.ts`, route | `browse-layer.test.ts`, unit; `browse.spec.ts`, smoke |
| FR-019 card category tap | `FullView` → `BrowseScreen.jumpTo` | `BrowseScreen.test.tsx`, unit; `browse.spec.ts`, smoke |
| FR-029 swipe-out | `FullView` tail observer | `browse-rework.spec.ts`, full |
| FR-020 keys | `browse-keys.ts` | `browse-keys.test.ts`, unit; `browse-rework.spec.ts`, full |
| FR-022 hint v3 | `hint-store.ts` | `hint-store.test.ts`, unit |
| FR-024–028 detection | `detect/*` | `segment.test.ts`, `remark-detect.test.tsx`, `Detected.test.tsx`, unit; `browse-rework.spec.ts`, full |
| FR-023 lazy, budget | Browse route chunk | `pnpm budget` |

## Accountability

None. Browse is a read-only UI. It makes no decision about a person, their content or their
experience that the server doesn't already make (visibility comes from the list query). Copying
a number and opening links happen on the device and are not recorded. Screen tracking is
unchanged: full view and the category list count as part of the Browse screen.

**Operator controls**: none.

## Rollout

- **Migrations**: none.
- **Env / config**: none (no CHANGELOG entry).
- **API client**: no `pnpm api:openapi`.
- **Deploy order / flags**: normal CI → Dokploy. The hint key bump shows the new sheet once per
  device.

## Risks

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Nested snap scrollers latch differently on iOS Safari (diagonal swipes move both) | M / M | Each track only scrolls on its own axis (`overflow: hidden` on the other), so a gesture can only latch one. Full e2e runs a diagonal swipe on Chromium; iOS is checked by hand in quickstart. |
| A tall card never becomes "current" (its ratio stays under 60 %) | M / H | `use-current-card` measures how much of the root a page covers, not the page's own ratio. Unit test with a 3-screen page. |
| The `tel:`/copy heuristics mark too much | M / L | Rules from the spec (≥ 3 digits, years, dates, letters); unit table of cases. When unsure, copy. |
| The full view tail closes by accident on a short scroll | L / M | Mandatory snapping settles back unless the tail is ≥ 50 % in; close needs ≥ 95 % visible. |
| Neighbour categories double the requests on open | L / L | They are the list's own queries and cached, and the next swipe needs them anyway. |

## Settle before starting

- [x] D-range collision with #106 → D325–D340 (spec header updated).

## Complexity Tracking

None.
