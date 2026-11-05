# Data model: 040 Browse rework

No server data changes. Everything below is client state.

## 1. Address (unchanged from 034)

`/d/<slug>/browse?c=<all|categorySlug>&i=<itemId>`, parsed leniently by `browse-params.ts`.
Card and category changes replace the entry. `pane` is ignored.

## 2. Router location state

| Field | Type | Set by | Meaning |
|-------|------|--------|---------|
| `fromList`, `listC` | `true`, string | the list's Browse button (034) | where Close returns to |
| `browseLayer` | `'categories' \| 'full'` | opening the category list or full view (push) | the open layer; absent = main view |

Card and category replaces keep the state (`state: prev => prev`). Closing a layer from the UI is
`history.back()`, so the pushed entry never survives (FR-018). `browseLayerFromState(state)`
reads it leniently: any other value means no layer.

## 3. Screen state (`BrowseScreen`)

| State | Type | Notes |
|-------|------|-------|
| `cycle` | `CycleEntry[]` | All + visible categories in chip-row order (034) |
| `c` | string | the address's category, resolved against the cycle |
| `visits` | `Record<slug, number>` | bumped when a category is left or jumped to; part of its stack's key, so it remounts (first card, or the jump's card) |
| `jumpTargets` | `Record<slug, itemId>` | the card a jump opens on (card category tap); cleared when that category is left |
| `banner` | `{ kind: 'category', entry, count } \| { kind: 'end', direction } \| null` + a nonce | the peek banner; gone after 2 s |
| `position` | `BrowsePosition \| null` | from the active stack (034) |
| `currentItem` | `Item \| null` | from the active stack, for the dock and full view |

## 4. Category counts

`knownCategoryTotal(queryClient, deckSlug, c)` reads the list query's cache for `c`. It returns
the number of cards when the last loaded page has no `nextCursor`, otherwise null (only the name
shows).

## 5. Detected text (render-only)

`segmentText(text)` → `Segment[]`:

| Kind | Value | Rendered as |
|------|-------|-------------|
| `text` | the text | plain text |
| `email` | the address | `<a href="mailto:…">`, "Email …" |
| `phone` | `+` and digits | `<a href="tel:…">`, "Call …" |
| `url` | normalised `http(s)` URL | `<a target="_blank" rel="noopener noreferrer">`, "Open …" |
| `number` | the number as written | `<button>`, "Copy …" |

Rules are in research D339. The remark plugin turns body text nodes outside links into mdast
nodes with `data.hName = 'span'` and `data-detect`/`data-value` properties; the Browse `span`
renderer turns those into the controls above.

## 6. Device storage

| Key | Value | Change |
|-----|-------|--------|
| `gobbit:browse-hint:v3` (localStorage) | `'dismissed'` | was `v2` |
| `gobbit:browse-return`, `gobbit:browse-opener` (sessionStorage) | 034 | unchanged; written only by the active stack |
