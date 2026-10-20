# Quickstart: Card editor (create and edit)

How to check the feature end to end, locally and then on the deployed instance.

## Prerequisites

- 006-card-lifecycle merged (`deckHref`, `CardActions`).
- `pnpm install`, Docker running, a repo-root `.env` with `SEED_OWNER_EMAIL` (see README).
- `pnpm db:migrate && pnpm db:seed`, then `pnpm dev` (API :3000, worker, web :5173).
- Sign in as the seeded owner. Create a test deck and invite a second account as `editor` (and optionally a `reader`).

## Automated gates

```bash
pnpm test:unit          # editor/draft, validate, problem-fields, drafts-store, table-ops, calc-ops, EditLink, CategoryChips, EntityChips
pnpm test:int           # items / proposal-visibility edit rules
pnpm build:web && pnpm budget   # initial bundle ≤ 150 KB gzip; compare with the baseline recorded before starting (SC-006: +≤ 3 KB)
pnpm test:e2e           # e2e/tests/smoke/editor.spec.ts
```

## Manual walkthrough (phone viewport, or a real phone on the deployed instance)

1. **Text** (US1): open Add card → Text. The default category is preselected. Type 601 characters in Body: the counter turns red and Save is disabled. Trim it, then open the Preview tab: it looks like a list card. Save, and the deck list shows the same card.
2. **Link** (US1): pick Link, enter a URL, a preview title and a description. Save, and the list shows the link card. A URL without `https://` is refused in the field.
3. **No category** (US1): deselect every chip. Save is disabled with "Pick at least one category".
4. **Table** (US3): add rows to 12 (Add row disables) and columns to 6 (Add column disables). Move a row up, leave a heading empty (it is flagged), fill it, and watch the byte meter. Save and compare with the preview.
5. **Calc** (US4): add fields `a` and `b`, enter the expression `a * b` and change the values in the preview to get a live result. Type `a * c`: an inline error appears and Save is disabled.
6. **Edit** (US2): open a card → Edit. There is no type picker. Change the title and save; the card shows the new title and the same "Added" age.
7. **Proposal** (US2): share a link to the deck (paste box) as the editor account. Open the proposal from the review queue (as owner) → "Edit fully", change a category and save. You land back in the queue and the card is still proposed. As a different editor, opening `/i/<id>/edit` shows "Card unavailable".
8. **Private category** (US2): as owner, put a card in a private category. As the editor, change its categories and save. As owner, the private category is still there.
9. **Inline category** (US6): as the editor, use "New category" with "School": it is created and selected. Adding "School" again selects the existing one. As a reader there is no Add card and no Edit.
10. **Drafts** (US5):
    - Type into a new card and reload: "Restore unsaved draft?" appears. Restore brings the text back.
    - Edit a card, then change the same card in another tab and save. Reload the first tab: the restore offer warns that the card has changed.
    - Sign out and back in: no draft is offered.
11. **Offline** (edge): with DevTools offline, open the editor and type; Save says you're offline. Back online, Save works and the draft is cleared.
12. **Review inline edit** (FR-016): in the review queue, use the inline edit to change only the title. The network panel shows a PATCH containing only `title`.

## Demo

PLAN.md Phase 6 demo 1 ("all five types authored and edited on the phone, rendering identically") is **shared with 008-card-media**. After 007, check steps 1–7 on the deployed instance for text, link, table and calc. Tick the demo only after 008 adds image.
