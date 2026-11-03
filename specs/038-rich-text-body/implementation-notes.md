# 038 Implementation notes

Decisions the plan didn't make and deviations, copied into `docs/design/card-editor.md` and `docs/design/public.md` ("Deviations from the 038 plan") at close-out.

## Deviations

- **No separate `toModelText`**: model inputs (Ask context, extract examples, agent output) all need the same thing: the Markdown with style directives cut out and every other byte kept. `stripStyleDirectives` (`apps/api/src/rich-text/plain-text.ts`) does that from the exact source using parse positions, so a second helper would only have been an alias.
- **Extract examples stripped centrally**: `extract-prompt.ts` passes each example body through `stripStyleDirectives`, so `jobs/ingest.ts` (which only selects the examples) is unchanged.
- **Palette tests next to each stylesheet**: instead of one shared test reading both files (T029), `apps/web/src/cards/rich-text-css.test.ts` checks the app sheet and `apps/api/src/public/rich-text-css.test.ts` checks the public one. Shared must not read app files.
- **Public CSS generated**: `apps/api/src/public/rich-text-css.ts` builds the public rules from `PALETTE`, so they cannot drift. Only the hand-written app sheet needs the palette test.
- **Unsafe links lose `href`**: rehype-sanitize removes a disallowed `href` attribute and keeps the link text, rendering `<a>text</a>`. The previous renderer emitted plain text. The text is still shown and nothing is clickable.
- **Fixtures subpath**: the shared parity and regression bodies are exported as `@gobbit/shared/rich-text/fixtures`, so tests import them without pulling them into the root `rich-text` entry.
- **Style directives need a label**: `:u`, `:small`, `:large` or `:color` without `[…]` (for example `:u[unclosed`) are restored to their source text instead of becoming an empty style.
- **`@types/mdast` + `mdast-util-directive` in the API**: these are dev dependencies used only for types by the plain-text tree walk.
- **Editor breaks without `remark-breaks`**: Milkdown parses with its own remark pipeline and reads a single newline as an inline (soft) `break`. A small `remarkHardBreaks` plugin in `milkdown-setup.ts` makes every break a real one, and the `break` stringify handler writes `\n`. The reader and public pages still use `remark-breaks` (D283).
- **Mark order**: `strong`/`emphasis` sit before the style marks in the schema, so bold around a styled run is written `**:large[…]**`, not inside the directive label. Both parse to the same thing.
- **Colon escapes**: remark-directive's stringifier escapes every `:` before a letter or digit (`10\:30`). `unescapeHarmlessColons` (`colon-escapes.ts`) removes the escape where no directive could start (not before an ASCII letter). Times, ratios and Hebrew text stay byte-for-byte; `Re\:Plan` keeps its escape.
- **Trailing newline**: Milkdown's serializer ends with `\n`; the editor strips trailing newlines so an untouched body compares equal to the stored one (FR-013).
- **Clear formatting keeps lists and quotes**: it removes every inline mark and turns headings and code blocks back into paragraphs. Lists and quotes are structure, and the toolbar toggles them off itself.
- **Plain-textarea fallback**: if the lazy editor chunk fails to load (offline, stale deploy), BodyField shows a status line with Retry and keeps a plain textarea, so the body can still be edited and saved as Markdown.
- **Pasted images become their alt text**: the commonmark schema has an inline `image` node, so FR-011 needed the paste filter (`plainPaste`) to replace images with their alt text, and `html` nodes with their text. A pasted image with no alt disappears.
- **Two "Undo" buttons**: the toolbar's Undo and the instant-category toast's Undo share a name. E2E specs scope the toast's to its `status` region; the names stay as they are, because both are correct.
- **E2E selection timing**: ProseMirror reads a native selection (Shift+Arrow, ArrowRight) on `selectionchange`. Automation can press Shift+Tab or Enter before that event arrives, and real typing can't. The keyboard spec selects with Ctrl/Cmd+A (ProseMirror's keymap, synchronous) and gives native caret moves a 150 ms beat. Home/End don't move by line in a macOS contenteditable.
