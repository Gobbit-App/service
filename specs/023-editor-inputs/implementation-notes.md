# Implementation notes: 023-editor-inputs

Plan: `specs/023-editor-inputs/plan.md`, tasks: `tasks.md`. Branch `feat/023-editor-inputs`.

No migration: `alt` lives in the image payload JSON and the payload CHECKs (body ≤ 600, payload ≤ 8192 bytes) are unchanged. The only contract change is `imagePayloadSchema.alt` becoming optional (OpenAPI regenerated). E2E tier: smoke + full (D209).

## Integration with 022-editor-navigation (#56)

023 is built on main, before #56 merges, and integrates with #56 at merge. The FR-010 logic is one callback, `rebaselineAfterCategorySave(saved: Item)` in `apps/web/src/editor/CardEditor.tsx`. It runs after every confirmed instant save and after Undo, and it:

- moves `categoryIds` on both the draft and the baseline (`rebaselineCategories` in `editor/rebaseline.ts`);
- moves the stored-draft base time (`autosave.rebase(saved.updatedAt)`).

When #56 merges, the `{ draft, baseline }` snapshot state in `CardEditor` gives way to `useEditorBaseline(initial)`. The callback then becomes `rebaseline({ categoryIds: saved.categoryIds })` followed by `rebase(saved.updatedAt)`. 022's guard then sees no unsaved change after a category tap. 022's files were not copied.

## Decisions not specified by the plan

- **Lazy saver**: `useInstantCategories` creates the `category-saver` controller on the first tap rather than at mount. The `react-hooks/refs` lint rule forbids reading the `onSaved` ref inside a state initializer. Until the first tap, the selection follows the `item` prop.
- **Save in edit mode never sends categories**: `onSubmit` sends `withCategories(draft, item.categoryIds)`, so `toPatch` finds no category change. This avoids racing an in-flight instant save.
- **Undo failure has its own message** (`UNDO_FAILED`, "Couldn't undo the category change."). The chips stay on the saved set.
- **Draft autosave reads with the opening snapshot**: `use-draft-autosave.ts` keeps the snapshot taken at open for its read-on-open effect and exposes `rebase(updatedAt)`. Without this, moving the baseline re-offered the member's own draft.
- **Last-category refusal is conservative**: it counts only the categories the client can see (D207). A published card that also has hidden categories is still refused, although the server would accept the change.

## Deviations from the plan

- **A non-string `alt` is refused with 400** (zod-openapi request validation), not 422. `items.int.test.ts` asserts 400.
- **T024 smoke check reads the card through the API** (`GET items/{id}` contains the new category) instead of leaving via the header back control and reading the card page. The back control is reworked by 022 (#56), and the API check holds on both branches.
- **The image smoke test locates `img.cloud-image__img`**: `CloudImage` also renders an `aria-hidden` placeholder `img`.
- **`visibility.int.test.ts` compares sorted `categoryIds`**: the response order after a merge with hidden categories isn't the request order.
- **E2E ran locally** on an isolated compose project (`-p gobbit-e2e-023`, alternate ports, because a local Postgres holds 5432) with a seeded smoke session and a fake Cloudinary URL. `@smoke` passed (62) and `@full` passed (18, including the 6 new). Cloudinary and real sites are answered with `page.route`; the link smoke test only types `example.org` and never fetches it.
