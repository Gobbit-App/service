# Implementation notes: 053 first run for invited people

## Progress (stopped here)

- Done and green: T000–T020, T023–T026 (unit, int and typecheck/lint pass; unit 5248 tests).
- Written, code complete, **not marked [X]**: T021, T022, T027 (UI tasks need phone + desktop, light + dark screenshots) and T012, T013, T028, T029 (e2e written, never run).
- Update: Playwright now runs. T012/T013/T028/T029 pass. Fix found by e2e: `openCategories` must `await` the first navigate, else the two pushes collapse into one history entry and back leaves Browse. Remaining: screenshots for T021/T022/T027.
- (old) Blocker: Playwright's Chromium cannot start on this machine (`libnspr4.so` missing). Fix with `sudo pnpm exec playwright install-deps chromium`; then `pnpm test:e2e --grep "welcome|invite"` and the screenshot pass can run.
- T029 (fixture DELETE) is unverified until e2e runs.
- Deviation: the DeckWelcome worker added no CSS (reuses sheet__* rules); buttons are in DOM order Start reading, Search, Categories (sheet__actions is column-reverse on phones) — check in screenshots.
- Deviation: decks.service uses a local WelcomeMemberships type instead of widening MembershipLookup.

## T000

- Rebased on origin/main (8c43e2c); `pnpm typecheck` and `pnpm test:unit` (5208 tests) green before any change.
- Welcome copy: the plan's assumed copy is used as is: "You're in **{deck}**" / "{inviter} invited you" / "You're a {Role}: {description}" / Categories · Search · Start reading. Not yet confirmed by the owner; adjust in DeckWelcome.tsx if changed.

## Screenshots (T021, T022, T027)

- Path: /tmp/claude-code/spec-preview/spec-0053/ (welcome-, categories-list-, hint-after-pick- × phone/desktop × light/dark).
- Same sheet, glass, type and button treatment as the sibling `CategoryList`; phone stacks the actions with Start reading nearest the thumb.
- Fixes from the pass: inviter fallback is "A member" (sentence start); on desktop the three actions wrapped, so `.sheet.deck-welcome` is 36rem from 600 px (deck-header.css).
- Review round: welcome role line is `ROLE_WELCOME` (one friendly sentence per role, packages/shared authz/labels.ts). `Sheet` now owns closing: grab handle + swipe down on phones, corner close button from 600 px when `closeLabel` is set (CategoryList, SearchSheet); CategoryList rows rebuilt (borderless, count inside the row). Swipe starts only on the top handle strip so list scrolling is untouched. Documented in docs/design/ui-system.md.
- Close-out: baseline on origin/main shows `profile.spec.ts` "seen avatar renders from the offline cache" fails there too (pre-existing); `deck-admin.spec.ts:13` passes alone on main and on this branch (it flaked once under parallel load). Int tests needed two updates for migration 0031 (memberships column snapshot, "latest migration" in deck-invite-links). T036 (manual quickstart walk) and T037 (converge, ponytail-review) remain.
