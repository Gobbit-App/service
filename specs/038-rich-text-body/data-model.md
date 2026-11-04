# Data model: Rich-text card bodies (038)

No tables, columns, constraints or API shapes change (FR-021). The only "model" is the grammar of
the existing `items.body` string, specified in [contracts/body-markdown.md](contracts/body-markdown.md).

| Field | Type | Rule | Enforced |
|-------|------|------|----------|
| `items.body` | `text` | ≤ 600 Unicode code points of the **stored Markdown**, formatting included | DB CHECK (unchanged), `@gobbit/shared` schema, editor meter |
| `items.search_text` | generated | built from the raw body (directive syntax included, D289) | DB (unchanged) |

## Style vocabulary (`@gobbit/shared/rich-text`)

| Constant | Values |
|----------|--------|
| `STYLE_NAMES` | `u`, `small`, `large`, `color` |
| `TEXT_SIZES` | `small` (0.875em), `large` (1.25em) |
| `PALETTE` | `red`, `orange`, `green`, `blue`, `purple`, `grey` — each `{ light, dark }` hex |
| Classes | `rt-small`, `rt-large`, `rt-color rt-color--<name>`; underline is `<u>` |

## Editor document (client only)

Milkdown/ProseMirror commonmark schema plus three marks:

| Mark | Attrs | Markdown |
|------|-------|----------|
| `underline` | — | `:u[…]` |
| `textSize` | `size: 'small' \| 'large'` | `:small[…]` / `:large[…]` |
| `textColor` | `color: PaletteName` | `:color[…]{.name}` |

Drafts (IndexedDB, D145) keep storing `Draft.body` as the Markdown string; no draft-shape change.
