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
