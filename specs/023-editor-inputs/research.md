# Research: Friendlier editor inputs

Decisions continue the project-wide D numbering. The Usability pass reserved D192–D199 (taken by 022-share-status); 022-editor-navigation owns D200–D204; this feature owns **D205–D209**. None needs an ADR: they adjust editor behaviour within ADR-008 (payload validation) and D145/D146 (drafts, undo toast).

`/speckit-clarify` was skipped (the spec is detailed); the open points it would have raised are settled below.

## What exists today

- URL inputs: link URL and source URL (`TextInput type="url"`), the review inline link field (same component) and the share form's link field. All four reject an address without `http(s)://` ("Enter a full http:// or https:// address" / "Enter a full link, starting with https://").
- The server's `httpUrlSchema` = `z.url()` + starts with lowercase `http://` or `https://`.
- Image alt text is required by the schema (`min(1)`), by the editor ("Alt text is required") and is rendered verbatim.
- Categories are part of the form and saved with Save.

## D205 — One URL-input rule

- **Decision**: `normalizeUrlInput(raw)` (web, `lib/url-input.ts`):
  1. trim; empty → empty;
  2. only a scheme (`https://`, `http://`, any case) → empty;
  3. a doubled scheme (`https://https://x`, `https://http://x`) → the inner one;
  4. `http(s)://` in any case → kept, the scheme lowercased (`HTTPS://Example.org/A` → `https://Example.org/A`);
  5. `//host/…` → `https://host/…`;
  6. another scheme (`mailto:`, `javascript:`, `ftp://`) → kept as typed, so validation refuses it. A "scheme" is letters/digits/`+.-` followed by `:` that is not followed by a digit, so `localhost:3000` and `example.org:8080/a` are hosts with ports, not schemes;
  7. anything else → `https://` + the text.

  `useUrlInput(value, onChange)` wires it: on focus with an empty value → `https://` with the caret at the end; on blur → `normalizeUrlInput`; on change → only the doubled-scheme collapse (so pasting `https://example.org` into the prefilled field gives one scheme while typing is otherwise untouched). Save paths normalise again (`toPayload`/`toCreateBody`/`toPatch`, `validateDraft`, share submit), so Enter-to-submit without blur behaves the same. The validation messages become "Enter a valid web address".
- **Rationale**: one function, one table of unit tests (FR-003). Lowercasing the scheme lets the unchanged server accept a pasted `HTTPS://…` (edge case "accepted as is": not refused and not double-prefixed; only the scheme's case changes). Treating unknown schemes as typed avoids `https://mailto:a@b` parsing as a valid URL with user info.
- **Alternatives considered**: relaxing the server to add the scheme (spec FR-003 keeps the server strict; other clients — MCP, Shortcut — send full URLs); `<input type="url">` placeholder only (doesn't save typing); upgrading `http://` to `https://` (spec AS-5 keeps it).

## D206 — Optional alt text and its fallback

- **Decision**: `imagePayloadSchema.alt: z.string().optional()` (empty string allowed, no trimming server-side). The editor labels the field "Description (optional)" with the hint "Helps people who use a screen reader. Leave empty to use the card title.", drops `ALT_REQUIRED`, and omits `alt` from the payload when it is blank. `imageAlt({ alt, title, titleAdjacent })` in `@pb/shared/image-alt` (zod-free): a non-blank alt wins; otherwise `''` (decorative) when the title is visibly adjacent; otherwise the title. Every current renderer — `Card` (list, card page, browse, editor preview), `ReviewCard`, the public page's `<article>` — shows the title as the heading directly above the image, so they pass `titleAdjacent: true`; the editor's upload thumbnail is decorative as before. When the public page has no image URL (media not configured) it prints the alt only if there is one. Agent-extracted image cards keep their generated alt (unchanged).
- **Rationale**: the title already names the image in nearly every card; repeating it as alt makes screen readers read it twice. The card `<article>` is `aria-labelledby` its title, so the image is announced in context. Keeping the rule in one helper means a future renderer without a visible title (e.g. a photo grid) gets the title automatically.
- **Alternatives considered**: always use the title as alt (double announcement next to the heading); store the title into alt on save (stale when the title changes; hides "no description" from editors); `alt: ''` required key (API clients would still have to send it; spec AS-5 accepts "no alt").

## D207 — Instant category saves with Undo

- **Decision**: a framework-free controller (`editor/category-saver.ts`) per open editor of an existing card:
  - `change(next)`: shows `next` at once; opens a burst (remembering the confirmed set as the undo target) if none is open; (re)starts a 600 ms timer.
  - On the timer: if `next` equals the confirmed set, the burst closes with nothing sent; otherwise one `PATCH /items/{id} { categoryIds }`. Saves are serialised: taps during a request extend the burst and are sent after it.
  - Success with nothing pending: confirmed = the server's `categoryIds`, the burst closes, `onSaved(ids, undo)` shows the app toast "Categories saved" with Undo (`UNDO_TOAST_MS` = 6 s, the archive/delete toast, D146).
  - Undo: cancels any pending burst and saves the burst's undo target (one more PATCH, one more log line); success shows "Categories restored".
  - Failure: chips revert to the confirmed set; the toast says "Couldn't save the categories. They're back as they were." (or the problem's own message, e.g. offline: "You're offline. Categories weren't saved.").
  - `flush()` on unmount sends a pending burst immediately; the request and the cache update run through the query client, so leaving the editor never loses a tap (SC-004).
  - FR-008: removing the last selected category of a **published** card is refused before any request; the chip stays on and the chips show "A published card needs at least one category." Proposals and archived cards are exempt (D6 applies to published only). The client knows only the categories it can see; if a card also has hidden categories the client still refuses (conservative; the server would accept).
  - Inline "New category" on an existing card is created, then applied through the same `change()`.
- **Rationale**: one request and one 020 log line per burst instead of one per tap (AS-3); the undo target is the state the member last saw settled. Reusing the PATCH keeps D6, visibility (hidden categories re-added by `items.service.update`) and the activity log unchanged; no new endpoint (spec assumption). The existing toast already offers one action for 6 s.
- **Alternatives considered**: save on every tap (N log lines, out-of-order responses); a dedicated `PUT /items/{id}/categories` (duplicates the rules); an inline notice inside the editor instead of the app toast (024 restyles notices; the global toast survives leaving the editor, which is when Undo still matters).

## D208 — Instant saves are not unsaved changes

- **Decision**: in edit mode the chips show the controller's selection, not `draft.categoryIds`. After every confirmed save (including Undo) the editor calls `rebaselineCategories(ids)`, which sets `categoryIds` on both the draft and the editor's opening snapshot (`baseline`, now state instead of a constant) and moves the stored-draft base time to the card's new `updatedAt`. Draft autosave compares against the baseline, so a category save never writes or keeps an IndexedDB draft; the read-on-open effect uses the snapshot taken at open, so rebaselining doesn't re-offer the member's own draft. A restored draft takes the saved categories (`withSavedCategories`), so an old draft can't resurrect categories. The review queue's inline edit form keeps Save/Cancel (it is a pre-publish form and Cancel must discard everything); a proposal opened in the full editor (the queue's "Edit" → `/i/{id}/edit?from=review`) gets instant saves, without the at-least-one rule (spec edge case).
- **Rationale**: 022's guard defines dirty as "content ≠ opening snapshot"; moving the snapshot is the smallest seam it can share. Keeping chip state outside the draft means the full Save never resends categories (`toPatch` compares against the refreshed item) and other unsaved edits are untouched (AS-8).
- **Alternatives considered**: exclude `categoryIds` from `isDirty` (a new card's categories must still count); keep chips in the draft and patch twice (race with the form's Save).

## D209 — E2E tier

- **Decision**: smoke + full. Smoke (`e2e/tests/smoke/editor.spec.ts`): a link card typed `example.org` stores `https://example.org`; the image editor shows "Description (optional)" and Save is enabled with a photo and title (saving the image itself stays in the existing secret-guarded journey, now without alt); an existing card re-filed with one chip tap and left via the header back control shows the new category. Full (`e2e/tests/full/editor-inputs.spec.ts`): Undo restores, last category of a published card refused, routed PATCH failure reverts, `http://` kept, invalid address refused, source URL and share URL prefixed.
- **Rationale**: constitution V — creating/editing a card is a critical journey; negatives and variants are nightly.
- **Alternatives considered**: full only (a regression in the most common edit would wait for the nightly run).
