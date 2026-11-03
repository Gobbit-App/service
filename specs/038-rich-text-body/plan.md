# Implementation Plan: Rich-text card bodies

**Branch**: `038-rich-text-body` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md) | **Roadmap**: `PLAN.md` § Phase 6+ (editor polish)

**Input**: Feature specification from `/specs/038-rich-text-body/spec.md`

## Summary

Card bodies stay Markdown strings. Every renderer gains two things: single line breaks render as
breaks (`remark-breaks`), and three extension styles (underline, small/large, a six-colour palette)
written as **CommonMark generic directives** (`:u[…]`, `:small[…]`, `:large[…]`, `:color[…]{.red}`)
parsed by `remark-directive`. One shared remark plugin in `@gobbit/shared/rich-text` maps those
directives to HTML and turns anything unknown into plain text, so the app reader (react-markdown),
the public pages (unified on the server, replacing bare micromark) and the editor all read the same
grammar the same way. The body field becomes a lazily loaded **Milkdown** editor with our own
formatting toolbar. Plain-text consumers (share previews, public excerpts, language detection)
strip through the Markdown tree instead of regexes. No migration, no API change.

## Starting point

main @ `ba27fb4` (036 bottom bar, 035 analytics consent, 037 reminders spec), latest migration
`0020_analytics_consent`, deployed. Reader body: `apps/web/src/cards/TextCard.tsx` (react-markdown,
`skipHtml`). Public body: `apps/api/src/public/markdown.ts` (micromark, D177). Plain text:
`apps/api/src/share/excerpt.ts` (regex `stripMarkdown`). Editor body: `editor/fields/BodyField.tsx`
(`TextInput` textarea + `LimitMeter`), also used by `review/ReviewEditForm.tsx`. Design docs:
`docs/design/card-editor.md`, `docs/design/public.md`, `docs/design/icons-and-actions.md`.

## Technical Context

**Language/Version**: TypeScript (strict, ESM, no build step) on Node ≥ 22

**Primary Dependencies**: existing stack + `remark-directive`, `remark-breaks`, `unist-util-visit`
(shared/web/api), `unified`, `remark-parse`, `remark-rehype`, `rehype-sanitize`, `rehype-stringify`,
`mdast-util-to-string` (api; `micromark` removed), `@milkdown/kit` (web, async chunk). Reasons in
[research.md](research.md#dependencies-added).

**Storage**: PostgreSQL 17 — no change (FR-021)

**Testing**: Vitest (unit, integration), Playwright `@smoke` / `@full`

**E2E tier**: smoke + full — editing a card is a critical journey (constitution V), so one smoke
journey formats a body (bold + line break), saves and sees it rendered; the toolbar's keyboard
path, colours/sizes, Clear formatting, undo/redo and the public page rendering are `@full`.

**Target Platform**: Docker Compose on Dokploy; PWA on Android Chrome (iOS where stated)

**Project Type**: pnpm monorepo — API + worker, PWA, shared packages

**Performance Goals**: editor chunk loads once per session and is cached offline by the service
worker precache like other route chunks.

**Constraints**: card body ≤ 600 code points counted on the stored Markdown (formatting counts,
FR-012); web initial bundle ≤ 150 KB gzip (reader gains `remark-breaks` + `remark-directive` +
the plugin, est. +5 KB; Milkdown stays out of the initial chunks); same origin.

**Scale/Scope**: every card body in every deck; no data rewrite.

## Constitution Check

| Principle | How this plan complies |
|-----------|------------------------|
| I. Layered API | No route/service/repo changes beyond the plain-text helpers used by existing services (`share.service`, public pages) and `extract-validate`. |
| II. One source of truth for contracts | The body stays `z.string()`; the style vocabulary (names, sizes, palette) lives once in `@gobbit/shared/rich-text`. No OpenAPI change. |
| III. Invariants live in the database | Unchanged: the 600 code-point CHECK counts the stored Markdown; no migration. |
| IV. Private by default | No new reads. Raw HTML never renders; link protocols are filtered on both renderers (react-markdown `urlTransform`, `rehype-sanitize`). |
| V. Tests at the right tier | Unit: shared plugin, plain text, palette contrast, server renderer, editor serialisation/no-op, toolbar. Int: none (no SQL change). E2E smoke + full as above. Traceability below. |
| VI. Lean, offline-first web | Milkdown in a lazy chunk; reader gains ≈ 5 KB; `pnpm budget` checked; imports via `@gobbit/shared/rich-text` subpath. |
| VII. Simple, optional, deployable | Established libraries only (D282–D286), each justified; no env, no AI dependency. |
| VIII. Accountable by default | No decision about a person — see Accountability (None, with reason). |

## Decisions this plan pins down

| ID | Decision | ADR? |
|----|----------|------|
| D282 | Extension styles are CommonMark generic text directives `:u`, `:small`, `:large`, `:color{.name}` parsed by `remark-directive` | yes → ADR-069 |
| D283 | `remark-breaks` on every renderer; the editor writes a line break as a plain newline | yes → ADR-069 |
| D284 | One shared mapping plugin (`@gobbit/shared/rich-text`): known directives → `<u>`/`rt-*` spans, anything else → plain content | yes → ADR-069 |
| D285 | Public pages render via unified + `rehype-sanitize`; raw HTML is dropped as in the app | no |
| D286 | Milkdown (`@milkdown/kit`) editor with our own toolbar in a lazy chunk; baseline compare keeps no-op saves | yes → ADR-069 |
| D287 | Six-colour palette and two sizes, light/dark values ≥ 4.5:1, mirrored in both stylesheets | no |
| D288 | Plain text and model text through the Markdown tree (`toPlainText`, `toModelText`); agent bodies stripped of styles | no |
| D289 | `search_text` keeps raw Markdown (no migration); style words may match on their own (accepted) | no |
| D290 | Toolbar: `role="toolbar"`, roving focus, `IconButton`s, 18 new icons, colour swatches, inline link row, sticky wrap | no |

## Project Structure

### Documentation (this feature)

```text
specs/038-rich-text-body/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/body-markdown.md   # the body grammar and its HTML mapping
├── tasks.md                     # /speckit-tasks
└── implementation-notes.md      # /speckit-implement
```

### Source Code

```text
packages/shared/src/rich-text/
├── constants.ts            # STYLE names, sizes, PALETTE (light/dark hex), class names
├── remark-styles.ts        # remarkNormalizeStyles, remarkStylesToHast
├── contrast.ts             # WCAG ratio (test helper used by the palette test)
└── index.ts                # subpath @gobbit/shared/rich-text

apps/api/src/rich-text/
├── render.ts               # unified pipeline → sanitized HTML string
└── plain-text.ts           # toPlainText, toModelText, stripStyleDirectives
apps/api/src/public/markdown.ts      # delegates to rich-text/render
apps/api/src/public/styles.ts        # rt-* classes, palette variables
apps/api/src/share/excerpt.ts        # excerpt() uses toPlainText; stripMarkdown removed
apps/api/src/share/share.service.ts  # language detection on plain text
apps/api/src/public/pages.ts         # language detection on plain text
apps/api/src/ai/ask-prompt.ts, jobs/ingest.ts, ai/extract-prompt.ts, ai/extract-validate.ts

apps/web/src/cards/TextCard.tsx      # remark-breaks + remark-directive + shared plugins
apps/web/src/cards/rich-text.css     # rt-* classes, palette variables (light/dark)
apps/web/src/editor/rich/            # lazy chunk
├── RichBodyEditor.tsx      # Milkdown lifecycle, baseline/no-op, value sync
├── milkdown-setup.ts       # editor factory: commonmark, history, listener, remark plugins, marks
├── style-marks.ts          # underline / textSize / textColor marks ↔ textDirective
├── commands.ts             # toolbar commands + active-state queries
├── FormatToolbar.tsx       # toolbar UI, roving focus
├── ColorPicker.tsx · LinkRow.tsx
└── rich-editor.css
apps/web/src/editor/fields/BodyField.tsx   # lazy RichBodyEditor + LimitMeter + retry fallback
apps/web/src/ui/icons/icon-paths.ts        # new icons

e2e/tests/smoke/editor.spec.ts       # + format, save, rendered
e2e/tests/full/rich-text.spec.ts     # toolbar keyboard, colours, clear, undo/redo, public page
```

**Structure Decision**: the vocabulary and mapping live in `packages/shared` because the web reader,
the editor and the API must agree (FR-004). The API owns the unified HTML/plain-text pipelines
(server-only deps). The editor is a folder of its own under `editor/rich/` loaded on demand.

## Invariant → test traceability

| Invariant / rule | Enforced in | Test (file, tier) |
|------------------|-------------|-------------------|
| FR-001 single break → `<br>`, blank line → paragraph | shared pipeline (web + api) | `TextCard.test.tsx` (unit), `rich-text/render.test.ts` (unit), `rich-text.spec.ts` (full) |
| FR-002/FR-004 same output app vs public for sample bodies (SC-002) | shared plugin | `rich-text/parity.test.ts` web vs api fixtures (unit) |
| FR-005 unknown name/colour/size, unclosed directive, raw HTML → plain | `remarkNormalizeStyles`, remark-rehype, sanitize | `remark-styles.test.ts`, `render.test.ts` (unit) |
| FR-005 unsafe link protocols dropped | react-markdown `urlTransform`, `rehype-sanitize` | `render.test.ts`, `TextCard.test.tsx` (unit) |
| FR-006 palette ≥ 4.5:1 both themes; stylesheets match | constants + CSS | `palette.test.ts` (unit) |
| FR-008/009 toolbar actions, pressed state, roving focus, shortcuts | `FormatToolbar`, `commands.ts` | `FormatToolbar.test.tsx` (unit), `rich-text.spec.ts` (full) |
| FR-010 Enter/Shift+Enter survive reload | serializer `break` → `\n` | `milkdown-setup.test.ts` round-trip (unit) |
| FR-011 paste keeps only supported styles | ProseMirror schema | `rich-text.spec.ts` paste case (full) |
| FR-012 meter counts stored Markdown | `BodyField` | `BodyField.test.tsx` (unit), `editor.spec.ts` 601 case (smoke, existing) |
| FR-013 open + save with no edit = no change | baseline compare | `RichBodyEditor.test.tsx` (unit) |
| FR-014 drafts keep Markdown | unchanged draft model | existing `use-draft-autosave.test.ts` + `CardEditor.test.tsx` |
| FR-016 editor not in initial chunks; budget | lazy import | `pnpm budget`, `initial-chunks.test.ts` |
| FR-017 plain text has no syntax (SC-003) | `toPlainText` | `plain-text.test.ts`, `excerpt.test.ts`, `share.service` tests (unit) |
| FR-018 words inside styles found | generated `search_text` | `search.int.test.ts` styled-word case (int) |
| FR-019 agent proposals carry no extension styles | `extract-validate` | `extract-validate.test.ts` (unit) |
| SC-004 existing bodies without single breaks unchanged | pipeline | `render.test.ts` regression fixtures (unit) |
| SC-001/SC-005 format → save → rendered | UI | `editor.spec.ts` (smoke) |

## Accountability

| Decision | Event / audit row | Outcomes · reasons | Fields | Level | Watched | Alert | Test |
|----------|-------------------|--------------------|--------|-------|---------|-------|------|
| None | — | — | — | — | — | — | — |

**Reason**: rendering and editing formatting decides nothing about a person, their content's
acceptance or their experience (FR-022). Card writes keep their existing `item_events` rows
(ADR-057); no-op saves still log nothing (FR-013). The editor failing to load is a client-side
fallback (retry message, draft kept) with no server decision.

**Operator controls**: none.

## Rollout

- **Migrations**: none.
- **Env / config**: none.
- **API client**: no (`pnpm api:openapi` unchanged).
- **Deploy order / flags**: normal CI → Dokploy. Public pages change output (breaks, styles, raw
  HTML dropped instead of escaped); `purgeDeck` is not needed because pages are rendered per request.
  OG images are cached by `contentHash` of title + excerpt, so cards whose excerpt changes get a new
  image on next request.

## Risks

| Risk | L / I | Mitigation |
|------|-------|------------|
| Milkdown + ProseMirror in jsdom unit tests is flaky | M / M | Test commands and serialisation against a headless editor instance; cover UI behaviour in Playwright `@full`. |
| `remark-directive` turns prose like `Re:Plan` into a directive | H / M | Normaliser restores label-less directives to their exact source (offset slice), tested. |
| Editor serialisation rewrites Markdown on first edit (`*a*` → `_a_`, `\:` escapes) | M / L | Allowed by FR-013 after an edit; renders the same (parity tests). |
| Bundle growth in the reader | L / M | Budget check in CI; plugins are a few KB. |
| Mobile keyboard hides toolbar | M / M | Sticky toolbar at the top of the field; e2e at phone width (`mobile-fit`). |

## Settle before starting

- [x] Palette names (D287) — chosen against the D272 theme; revisit visually in review.

## Complexity Tracking

None.
