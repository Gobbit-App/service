# 039 — Implementation notes

Decisions the plan didn't make and deviations from it, recorded while implementing. At close-out
the deviations are copied into `docs/design/card-editor.md` → "Deviations".

## PR1 — frame, Save, shortcuts (US1, US4, US6)

- **Blocked Save reports the attempt.** `Button` gained `onBlockedClick` (passed to
  `guardClick`): a blocked Save stays `aria-disabled` (focusable, described by its reason) and a
  click still reveals the field errors and the reason (D308). Mod+Enter goes through
  `form.requestSubmit()`, so the blocked case is handled in `onSubmit` too.
- **Errors appear after a change or a Save attempt.** A fresh card no longer shows "Title is
  required" on load; the reason under Save is visually hidden (still the button's description)
  until then.
- **The reason is a pill hung under Save**, positioned absolutely so the sticky rich toolbar
  offset (`--safe-top + 61px`, the same height as the composer bar) does not move.
- **Escape layering.** The colour panel and link row close on a capture-phase Escape and mark it
  handled; the composer listens in the bubble phase and skips handled events, IME composition and
  any open `dialog`. The panels stay inline (not sheets) in PR1.
- **Deck layout.** `DeckLayout` returns a bare `<Outlet/>` for `/new` as it already did for
  Browse; `BottomBar` is now rendered unconditionally in the remaining branch.
- **No route unit test for the bare layout** (the repo has no route-level unit tests); the
  absence of deck chrome on `/new` and edit is covered by `e2e/tests/full/composer.spec.ts`.
- **E2E names.** "Save card" → "Save", the editor's "Cancel" button and header "Back" → the top
  bar's "Close" link across smoke and full specs.
