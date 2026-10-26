# Implementation notes: 024-card-actions

Plan: `specs/024-card-actions/plan.md`, tasks: `tasks.md`. Branch `feat/024-card-actions`. It already contains the merges of 022-editor-navigation (#56) and 023-editor-inputs (#57), and should merge after both.

Web only: no API, schema or OpenAPI change. E2E tier: smoke + full (D216).

## Decisions not specified by the plan

- **The More actions menu is portalled to `<body>`.** `MoreMenu` positions it from the trigger's rect. A card clips overflow (`.card` has rounded corners and `overflow: hidden`), so an in-card menu would be cut off.
- **`Button` accepts `aria-label`.** A few pill buttons need a longer accessible name than their visible label, for example a token row's Revoke, named "Revoke Phone". `IconButton` still takes `label` only.
- **Browse uses the full `CardActionBar`.** The bar is the same on the list, the card page and browse. The plan had left open whether browse would get a trimmed bar.
- **The sign-out tooltip replaces `title`.** It reads "Sign out (email)" through `tip`. This follows D212 (no `title`).
- **Deck settings uses the `list` icon.** `settings` (the gear) stays with account settings in the same header, so the two can be told apart.
- **Entity chips draw a 28 px remove control inside a 44 px hit area.** A 44 px visual inside a chip would make the chip taller than its row.
- **The footer's Previous/Next view buttons are also removed.** D215 lists them; FR-012 names only the card arrows. Views stay reachable through the tabs, the arrow keys and swipes.
- **The app header has no gap below 400 px** (`gap: 0`, `padding-inline: 8px`). The deck page header now holds seven 44 px icon controls: back, browse, review, activity, deck settings, settings and sign-out. With the old 6 px gap the page was 362 px wide at 360 px, which the `@smoke` overflow check caught. The hit areas still touch edge to edge. The deck title gets only about 36 px there and truncates with an ellipsis. Moving Activity and Deck settings into a deck menu is a follow-up.
- **The CSS unit tests read the sheets with `node:fs`.** Vitest stubs CSS imports, even with `?raw`.
- **`no-glyphs.test.ts`** scans every non-test `.tsx` under `apps/web/src` for the old glyphs (◂▸⚙✕✖×★☆⤴↑↓←→‹›⋯) outside comments. This makes SC-002 a unit check.

## Deviations from the plan

- **`WEB_SPECS` in `e2e/playwright.config.ts` now lists `shares`, `editor-inputs` and `card-actions`.** `full/shares.spec.ts` and `full/editor-inputs.spec.ts` didn't match the regex before, so they ran in the `api-smoke` project without the session cookie. They now run in Chromium like the other web specs, and both pass.
- **The axe pages are not the ones the plan listed.** It runs on the card page (bar and open menu), the deck list, `/settings` and deck admin, in light and dark. It does not run on browse, review or the editor. Those pages use the same primitives; their names are covered by `getByRole` in their own specs, and their contrast by the token test in `styles.test.ts`.
- **The ImportLink visible label is now "Import notes"** (it was "Import"), so the label shown on wide screens says what it imports. The `@full` import spec already used that name.
- **These controls keep their text** (D211 scope): EditorTabs, CategoryChips, the search ModeToggle, RecentSearches and the CategoryMenu items. They are choices, not actions.
- **The browse e2e helpers open the position menu** (`moveCard`, `expectMoveDisabled`). Category changes use the category menu or the arrow keys, and swipes are unchanged.
- **`lifecycle`, `activity-log` and `links` specs reach Archive, Delete, History and Dismiss through "More actions"** (menu items).

## Gates

- `pnpm typecheck`, `pnpm lint`: clean. Prettier is clean on changed files.
- `pnpm test:unit`: 325 files, 2894 tests. The web share is 163 files and 1267 tests.
- `pnpm build:web` passes. `pnpm budget`: initial JS 117.5 KB gzip, 2.8 KB over the 114.7 KB baseline. That is under SC-005's 6 KB limit and the 150 KB budget.
- E2E ran on the local Compose stack (`DB_PORT=55432`, because a local Postgres holds 5432) with a seeded smoke session and a fake Cloudinary URL. The full suite (93 tests, `@smoke` and `@full`) passed, including the 6 new `card-actions` tests. Two failures on the first run were fixed: the 360 px header overflow above, and `links.spec.ts` still looking for a Dismiss button.
