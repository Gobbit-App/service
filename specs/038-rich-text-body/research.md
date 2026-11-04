# Research: Rich-text card bodies (038)

Decisions continue the project-wide series at **D282** (D281 was used by the 035 amendment).

## D282 — Extension syntax: CommonMark generic directives (ADR-069)

- **Decision**: The three styles plain Markdown lacks use the
  [generic directives proposal](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444)
  (text directives `:name[label]{attributes}`), parsed by `micromark-extension-directive` through
  `remark-directive` (with `mdast-util-directive` for writing). Gobbit uses four names:

  | Style | Markdown |
  |-------|----------|
  | Underline | `:u[text]` |
  | Small text | `:small[text]` |
  | Large text | `:large[text]` |
  | Text colour | `:color[text]{.red}` (one palette class) |

- **Rationale**: It is the only published Markdown extension syntax that covers arbitrary inline
  styles with attributes, has maintained parsers for every place we need one (micromark/remark on
  the server, react-markdown in the reader, Milkdown in the editor all use the same parser), and
  degrades to readable text in any plain Markdown viewer. Styles nest (`:large[:color[**x**]{.red}]`).
- **Alternatives**:
  - *Inline HTML* (`<u>`, `<span style>`): needs an HTML sanitiser on every surface and breaks the
    "raw HTML never renders" rule (FR-005).
  - *Pandoc bracketed spans* (`[text]{.red}`): no maintained micromark/remark parser.
  - *`markdown-it-attrs` / `++ins++` / `==mark==`*: markdown-it only, so the app (react-markdown)
    and the editor would need a second parser; no size or colour.
  - *Custom tokens*: forbidden by FR-003.

## D283 — Single line breaks render as breaks: `remark-breaks` everywhere

- **Decision**: Every renderer (reader, public pages, editor) runs `remark-breaks`, which turns a
  single newline inside a paragraph into a `break` node. The editor writes a line break back as a
  plain newline (remark-stringify `break` handler → `"\n"`), so a body stays `"Milk\nEggs"`, not
  `"Milk\\\nEggs"`.
- **Rationale**: Existing bodies typed over several lines start rendering as typed without a data
  migration (FR-001, FR-021). Blank-line paragraphs are unchanged (SC-004).
- **Alternatives**: Rewriting stored bodies to hard breaks (migration, touches search and
  embeddings); CSS `white-space: pre-line` (also affects list/heading source whitespace and does
  not reach the editor).

## D284 — One shared mapping plugin, no parser of our own

- **Decision**: `@gobbit/shared/rich-text` exports the style vocabulary (names, sizes, palette)
  and two small remark (mdast) transforms that only map nodes the directive parser produced:
  - `remarkNormalizeStyles` — keeps only known, well-formed text directives; anything else becomes
    plain content: a directive with a label is unwrapped to its label, one without a label
    (e.g. `Re:Plan`) is restored to its exact source text; leaf/container directives become a
    paragraph of their label/source, or their children. A size inside a heading is unwrapped.
  - `remarkStylesToHast` — sets `data.hName`/`hProperties` so remark-rehype emits `<u>` or
    `<span class="rt-small|rt-large|rt-color rt-color--{name}">`.
  The reader and public pages run both; the editor runs only the normaliser (so Milkdown never
  meets a node type it can't parse).
- **Rationale**: FR-003 (no parser of our own), FR-004 (same rendering in app and public pages:
  one plugin, one vocabulary), FR-005 (unknown → plain). Depends only on `unist-util-visit`.

## D285 — Public pages render through unified instead of bare micromark

- **Decision**: `apps/api/src/public/markdown.ts` becomes
  `remark-parse → remark-breaks → remark-directive → normalise → toHast → remark-rehype →
  rehype-sanitize → rehype-stringify`. Raw HTML is **dropped** (remark-rehype default), matching
  the app's `skipHtml` (FR-004); `rehype-sanitize` with GitHub's default schema plus our classes
  enforces safe link protocols (`http`, `https`, `mailto`) and strips anything unexpected.
- **Rationale**: micromark has no break or directive-to-HTML mapping we can share with the app.
  Before, public pages escaped raw HTML to visible text while the app hid it; they now agree.
- **Alternatives**: `micromark` + `micromark-extension-directive` HTML handlers (a second,
  HTML-string implementation of the mapping, so app and server could drift).

## D286 — Editor: Milkdown (`@milkdown/kit`), our own toolbar, lazy chunk

- **Decision**: The body field becomes a Milkdown 7 editor (ProseMirror view, remark parser and
  serializer). We use `@milkdown/kit` (core, commonmark preset, history, listener) with
  `remark-directive`, `remark-breaks` and `remarkNormalizeStyles` added to its remark pipeline, and
  three marks of our own (`underline`, `textSize`, `textColor`) whose parse/serialize runners map
  to and from `textDirective` nodes. The toolbar is ours (React, `ui/buttons`, `ui/icons`). The
  whole editor is a `React.lazy` chunk loaded when the editor opens.
- **No-op saves (FR-013)**: when the field mounts, the editor serialises its document once as the
  *baseline*. While the serialised Markdown equals that baseline the field reports the original
  string unchanged, so opening, focusing or undoing back to the start never changes the body.
- **Paste (FR-011)**: ProseMirror keeps only what the schema can represent (our marks parse only
  from `<u>`/`<strong>`/`<em>`/`<code>`/`<a>` and our own `rt-*` classes); nothing is stored as raw
  HTML because pasted DOM is never stored as an `html` node.
- **Rationale**: Milkdown is the established "Markdown-native" WYSIWYG editor: its parser *is*
  remark, so the same `remark-directive` grammar and the same normaliser drive editor and reader.
- **Alternatives**:
  - *TipTap + `@tiptap/markdown`*: marked-based; directives would need a hand-written tokenizer.
  - *Lexical / MDXEditor*: Lexical's Markdown transformers are regex-based (hand-written grammar);
    MDXEditor is far heavier and brings its own UI kit.
  - *Milkdown Crepe*: ships its own toolbar/UI and theme; we need ADR-059 buttons and icons.

## D287 — Palette and sizes

- **Decision**: Six colours `red`, `orange`, `green`, `blue`, `purple`, `grey`, defined in
  `@gobbit/shared/rich-text` with a light and a dark value each, and mirrored as CSS custom
  properties (`--rt-red` …) in the app and the public stylesheet. Sizes: `small` = 0.875em,
  `large` = 1.25em. Light values meet ≥ 4.5:1 on `#ffffff`, dark values on `#1a2629` (card
  surfaces); a unit test computes the WCAG ratio and checks both stylesheets carry the same hexes.
- **Rationale**: FR-006, US3.1. Text colour is decoration only; no product meaning depends on it.

## D288 — Plain text through the Markdown tree

- **Decision**: `apps/api/src/rich-text/plain-text.ts` `toPlainText(md)` parses with
  remark-parse + remark-directive + the normaliser and joins `mdast-util-to-string` per block
  (breaks → space). It replaces the regex `stripMarkdown` in excerpts, OG description/image,
  public list summaries and language detection (FR-017). `toModelText(md)` unwraps only the style
  directives (keeps standard Markdown) for the Ask prompt and the ingestion examples (FR-019).
  `extract-validate` passes the agent's body through `stripStyleDirectives` so a proposal never
  carries extension styles, and the extract prompt says so.
- **Rationale**: A tree-based strip removes every syntax remark knows, directives included, with
  no regex edge cases; remark is already in the API for public pages.

## D289 — Search keeps the stored Markdown (no migration)

- **Decision**: `items.search_text` stays generated from the raw body (FR-021 forbids a
  migration). Words inside a style are found (directive brackets are non-word characters for
  trigram and substring matching). Style words (`color`, `red`, `large`) inside the syntax may
  still make a card match on their own; we accept that for this feature (FR-018 is a SHOULD) and
  record it as a follow-up rather than re-generating `search_text` and re-embedding every card.

## D290 — Toolbar behaviour and icons

- **Decision**: `role="toolbar"` with one tab stop and arrow-key/Home/End roving focus; each
  action is an `IconButton` with a label and `pressed` from the current selection. New icons drawn
  on the D210 grid: `bold`, `italic`, `underline`, `text-small`, `text-large`, `code`,
  `text-color`, `heading-1`…`heading-4`, `paragraph`, `list-ordered`, `quote`, `code-block`,
  `redo`, `clear-format` (`list`, `link`, `undo` exist). Colour opens a small swatch group
  (`Default` + six colours); Link opens an inline URL row (Apply / Remove). Shortcuts: Milkdown's
  `Mod-b`, `Mod-i`, `Mod-e` (code), history `Mod-z` / `Shift-Mod-z`, plus `Mod-u` for underline.
  The toolbar is `position: sticky` at the top of the field and wraps (FR-015).

## Dependencies added

| Package | Where | Why |
|---------|-------|-----|
| `remark-directive`, `remark-breaks`, `unist-util-visit` | shared, web, api | the grammar (D282), breaks (D283), the mapping plugin (D284) |
| `@types/mdast` (+ `mdast-util-directive` types) | shared (dev) | typed plugin |
| `unified`, `remark-parse`, `remark-rehype`, `rehype-sanitize`, `rehype-stringify`, `mdast-util-to-string` | api | public rendering and plain text (D285, D288); `micromark` removed |
| `@milkdown/kit` | web | editor (D286), async chunk only |
