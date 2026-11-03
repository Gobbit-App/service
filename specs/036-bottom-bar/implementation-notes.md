# 036 Implementation notes

Decisions the plan didn't make and deviations, copied into `docs/design/web-pwa.md` ("Deviations from the 036 plan") at close-out.

## Deviations

- **Icon-only bar**: Browse, Review and both menu triggers are the existing icon buttons with tooltips, so there are no text labels to collapse below 360 px; the narrow-label check in `card-actions.spec.ts` moved to the "Create token" button on `/settings`.
- **D279 without `?new=1`**: the deck list's + opens `NewDeckForm` through component state (`routes/index.tsx`); the form's own collapsed "New deck" button was removed, so the bar's + is the only "New deck" control. Deep-linking to an open form wasn't needed.
- **D280 always on**: `--bottom-bar-h` is set on `:root` instead of only while a bar is mounted; toasts on pages without a bar (editor, Browse) sit one bar higher. Simpler than a mount-time class, and harmless.
- **Old links deleted**: `AddCardLink`, `PasteLink`, `ImportLink`, `SharesLink`, `DeckSettingsLink` and `ActivityLink` (and their tests) were removed rather than kept as wrappers; the bar's actions build the same hrefs (`create-actions.ts`, `deck-menu-actions.ts`).
- **Settings in ⋯ for every role**: readers and editors open the same Settings entry; the deck half shows "Only admins can change this deck." for them, the account half is theirs.
- **Waitlist twice**: platform admins keep the Waitlist link on the account settings as well as the ⋯ item.
- **Sign-out tests**: moved from `AppHeader.test.tsx` to `use-sign-out.test.tsx` and `BottomBar.test.tsx`. The `@smoke` sign-out journey now leaves the editor before signing out from ⋯ (the editor has no bar); the leave guard on sign-out stays covered by the `use-sign-out` unit tests.
- **E2E split**: the long press runs in `@full` (`e2e/tests/full/bottom-bar.spec.ts`); `@smoke` covers the short press → New card / Paste or share and ⋯ → Settings / Sign out.
