# Implementation Plan: 034 Browse redesign

**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md) · **Contract**: [contracts/browse-ui.md](./contracts/browse-ui.md) · **Phase**: Usability pass

## Technical context

- Web only (`apps/web/src/browse/`). No API, DB, OpenAPI or env change.
- **E2E tier: smoke**. Browse is a critical reading journey, and its smoke spec (`e2e/tests/smoke/browse.spec.ts`) asserts the old zones. The spec is rewritten for the new model.
- Bundle: the Browse chunk loses `@use-gesture` (~8.5 KB gzip). Initial chunks are unchanged.

## Constitution check

- Accessibility and no-gesture parity: every move has a button and a key (contract §3). Pass.
- Accountability (VIII): Browse is a read-only UI and makes no decision about a person or their content, so there are no decision events. Pass.
- Tests: unit tests sit next to the changed modules, and the smoke e2e is rewritten. Pass.

## Structure

| Module | Change |
|--------|--------|
| `BrowseScreen` | top bar + track + dock; `pane` gone |
| `TopBar`, `CategoryRail` | new: close, chips, "3 / 25" + progress bar |
| `BrowseStack` | horizontal track, end page, dock wiring |
| `BrowsePage` | one card + `sections/CardDetails` + `sections/CardSource` |
| `BrowseDock`, `EndPage` | new |
| `browse-keys` | ←/→ for cards, ↑/↓ native |
| `motion` | `scrollIntoView({ inline: 'start', block: 'nearest' })` |
| removed | `HeaderBand`, `FooterBand`, `PositionMenu`, `CategoryMenu`, `swipe`, `use-zone-swipe`, `edge-guard`, `panes/` |

## Accountability

None. This is a read-only UI and makes no decisions about people or content.
