# Feature Specification: Rich-text card bodies

**Feature**: `038-rich-text-body` · **Status**: Draft · **Created**: 2026-11-03 · **Decisions**: from D281

**Input**: "Item body needs to be in MD format — respect line breaks and other stylings. Need a toolbar for style options (bold, italic, underline, small/large text, H1–H4, code, paragraph, undo/redo, text colour, clear formatting). Use a 3rd-party editor and reader to support this rich-text behaviour. If there's already an extension-based Markdown solution (writer and reader), don't invent one ourselves."

## Why

Card bodies are already stored as Markdown, and the reader and public pages already render them. Writing them is still a plain text box, though:

- **Line breaks vanish**: a family member types a recipe over three lines and it shows as one run-on line. Standard Markdown joins single line breaks.
- **Formatting is invisible**: only people who know Markdown can bold a word or add a heading, and nobody can underline, resize or colour text. The editor has no buttons for any of it.
- **Phones**: typing `**`, `#` and `[]()` on a phone keyboard is slow and error-prone.

## Outcome

A card body is written in a "what you see is what you get" editor with a formatting toolbar, and reads back exactly as written, line breaks included, everywhere the card appears. The body stays Markdown, so search, Ask, share previews, import and the public pages keep working.

The few styles plain Markdown lacks (underline, text size, text colour) use an **existing, published Markdown extension syntax** with existing parser libraries. Gobbit invents no syntax and writes no parser of its own.

## User scenarios

### US1 — Line breaks show as typed (P1)

A family member writes a shopping note on three lines, or opens an older card that was written that way. The card shows three lines in the deck list, card page, Browse, the public page and the editor preview.

**Independent test**: create a card whose body has single line breaks through the API; every reader surface shows them as breaks.

**Acceptance**:
1. **Given** a body `"Milk\nEggs\nBread"`, **when** it is shown in the reader, the card page, Browse or a public page, **then** it reads as three lines.
2. **Given** an existing card with paragraphs separated by blank lines, **when** it is shown, **then** it renders as before (paragraphs unchanged).

### US2 — Format with a toolbar (P1)

An editor opens the card editor, selects a word and taps **B**; the word turns bold in place. They add a heading, a list and a link without typing any Markdown symbol, then save. The card reads back with the same formatting.

**Independent test**: in the editor, apply every toolbar action, save, and compare the rendered card with the editor content.

**Acceptance**:
1. **Given** selected text, **when** the editor taps Bold, Italic, Underline, Small, Large, Code or a colour, **then** the selection shows that style at once, and the button shows as active while the cursor is inside it.
2. **Given** the cursor in a paragraph, **when** they tap H1–H4, Paragraph, List, Numbered list or Quote, **then** the block changes to that kind.
3. **Given** styled text, **when** they tap Clear formatting, **then** inline styles (bold, italic, underline, size, colour, code, link) are removed from the selection.
4. **Given** any change, **when** they tap Undo then Redo, **then** the change is reverted and reapplied.
5. **Given** a saved card, **when** it is reopened in the editor, **then** every style is shown as it was saved.

### US3 — Underline, size and colour (P2)

An editor marks "allergy: nuts" in red and makes a note's first line large. Everyone sees it in red and large in the app and on the public page, in both light and dark themes.

**Acceptance**:
1. **Given** text coloured with one of the palette colours, **when** shown in light or dark theme, **then** it uses that theme's version of the colour and stays readable (contrast ≥ 4.5:1).
2. **Given** a body that names a colour or size outside the allowed set (for example typed by hand or sent through the API), **when** it is shown, **then** the text appears unstyled, never as raw syntax or raw HTML.

### US4 — Formatting stays out of plain text (P2)

A shared card's link preview, the deck list excerpt on public pages, an Ask answer's source cards and the ingestion agent's examples show words, not formatting symbols.

**Acceptance**:
1. **Given** a body with bold, a heading and coloured text, **when** a share preview or public excerpt is generated, **then** it contains the words and no Markdown or extension syntax.
2. **Given** a coloured word, **when** someone searches for that word, **then** the card is found.

## Requirements

### Rendering

- **FR-001**: Every place that renders a card body as rich text MUST show a single line break as a line break and a blank line as a new paragraph: the deck list, card page, Browse, editor preview, review queue and public pages (`/p/…`).
- **FR-002**: Bodies MUST support standard Markdown as today (paragraphs, headings, emphasis, lists, quotes, inline code, code blocks, links) plus three extension styles: **underline**, **text size** (small, large) and **text colour** (a fixed palette of 6 theme colours).
- **FR-003**: The extension styles MUST use an existing, published Markdown extension syntax with maintained parser libraries for both the app and the server. Gobbit MUST NOT define its own syntax or hand-write a parser.
- **FR-004**: The app and the public pages MUST render the same body the same way, with the same allowed styles, colours and sizes.
- **FR-005**: Raw HTML in a body MUST never render as HTML anywhere (as today). Unknown extension names, colours or sizes MUST render as plain text content without styling. Link targets keep today's safe-protocol rules.
- **FR-006**: Colour MUST NOT be the only way meaning is conveyed by the product. Every palette colour MUST meet 4.5:1 contrast against the card background in the light and dark themes.

### Editor

- **FR-007**: The card editor's body field (and the review queue's inline edit) MUST be a rich-text editor from an established third-party library that shows formatting in place and reads and writes the body as Markdown.
- **FR-008**: The editor MUST have a formatting toolbar with:
  - **inline**: Bold, Italic, Underline, Small text, Large text, Inline code, Text colour (palette picker), Link;
  - **blocks**: H1, H2, H3, H4, Paragraph (back to body text), Bulleted list, Numbered list, Quote, Code block;
  - **history**: Undo, Redo;
  - **Clear formatting**.

  Groups are separated, as in the reference toolbar. Undo and Redo are disabled when there is nothing to undo or redo.
- **FR-009**: Toolbar buttons MUST render through `ui/buttons` with icons from `ui/icons` (ADR-059). Each has an accessible name and a pressed state that reflects the current selection. The toolbar is one keyboard tab stop with arrow-key movement. Common shortcuts work: Ctrl/Cmd + B, I, U, Z, Shift+Z.
- **FR-010**: Enter MUST start a new paragraph and Shift+Enter MUST insert a line break, and both MUST survive save and reload as FR-001 renders them.
- **FR-011**: Pasting from another app MUST keep only the supported styles and drop everything else to plain text. Nothing pasted may be stored as raw HTML.
- **FR-012**: The limit meter and validation MUST keep counting the stored Markdown against the 600 code-point limit, as the database does. Formatting counts toward the limit, and an over-limit body blocks saving as today.
- **FR-013**: Opening a card and saving with no edits MUST NOT change its body (no-op saves stay no-ops and log no activity, ADR-057). After an edit, the editor may normalise how the Markdown is written (for example `*a*` → `_a_`) but MUST NOT change how it renders.
- **FR-014**: Drafts (IndexedDB autosave, restore banner, leave guard) MUST keep working with the new field, storing the Markdown.
- **FR-015**: On a phone the toolbar MUST fit the screen width by wrapping onto extra rows, without sideways scrolling, and stay reachable while the on-screen keyboard is open.
- **FR-016**: The editor library MUST load only when the editor opens. The initial download stays within the 150 KB gzip budget. Offline, the editor keeps working once it has loaded before (the app's normal offline caching).

### Plain-text consumers

- **FR-017**: Wherever a body becomes plain text, the Markdown and extension syntax MUST be removed and the words kept: share previews (OG description and image), public page excerpts and meta descriptions, and language/direction detection.
- **FR-018**: Search MUST find words inside styled text. Formatting syntax (extension names, colour names, attributes) SHOULD NOT make a card match a search on its own. The plan weighs this against the cost of re-embedding every card.
- **FR-019**: The Ask prompt and the ingestion agent's examples MUST be given the body as text the model can read. The ingestion agent MAY write standard Markdown and line breaks in proposals but MUST NOT emit the extension styles.
- **FR-020**: Bulk import and its preview MUST keep their current behaviour, and imported bodies render line breaks per FR-001.

### Scope guards

- **FR-021**: No database migration. The body column, its 600 code-point CHECK and the API contract stay as they are: the body is still a string.
- **FR-022**: No new decision events. Nothing here decides about a person (constitution VIII); the plan records "None" with that reason.

## Success criteria

- **SC-001**: A family member formats a body (bold, a heading, a list, a coloured word, two lines) on a phone without typing any formatting symbol, in under a minute.
- **SC-002**: For a fixed set of sample bodies covering every style, the editor content after reload, the app card and the public page show the same formatting and line breaks (checked by tests).
- **SC-003**: No share preview, public excerpt or meta description in the test set contains Markdown or extension syntax.
- **SC-004**: Every existing card body that has no single line breaks renders unchanged (regression test on a sample of current body shapes).
- **SC-005**: The initial JS stays ≤ 150 KB gzip, and every toolbar action works with the keyboard only (e2e).

## Edge cases

- **Hand-written or API bodies** with an unknown colour/size, an unclosed directive or raw HTML render as plain text, never broken markup.
- **Truncated agent bodies**: an ingestion proposal cut at 600 may end in broken syntax. It renders as text and a publisher sees it in review before it is published.
- **Near the limit**: applying a style that pushes the body past 600 shows the over-limit state at once; the meter counts the formatting.
- **Nested styles**: bold + colour + large on the same words render all three. A heading line can be coloured but not sized (headings have their own size).
- **Styles in non-text cards**: link, image, table and calc cards have the same body field and the same editor.
- **Right-to-left text**: paragraphs, headings and list items keep `dir="auto"` as today. The toolbar works in both directions.
- **Empty body**: allowed as today. An editor that holds only empty formatting saves an empty body.
- **Old browsers / editor fails to load**: the editor shows a retry message and keeps the draft; nothing is lost.

## Assumptions

- **Palette**: six named theme colours (for example red, orange, green, blue, purple, grey), each defined for light and dark. The exact set is settled in the plan against the current theme tokens.
- **Sizes**: two (small, large) relative to body text. Headings are the way to get bigger structure.
- **No Markdown source view** in this feature. The rich editor is the only way to edit the body in the app; the API still takes Markdown.
- **Tables, task lists, images in body, strikethrough**: not added. Table and image cards already exist.
- **Reference toolbar**: the user's screenshot (dark rounded toolbar, grouped buttons wrapping onto two rows) is the visual reference. Gobbit's own theme, buttons and icons apply.
- **E2E tier**: editing a card is a smoke journey, so one smoke check (format, save, see it rendered) plus full-tier coverage for the rest. The plan states it.

## Out of scope

- Collaborative/real-time editing, comments, mentions.
- Fonts, background/highlight colour, alignment, free colour pickers or arbitrary sizes.
- Changing the 600 limit or how it is counted.
- Rendering formatting inside the OG image (it stays plain text).
