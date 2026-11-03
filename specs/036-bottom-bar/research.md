# Research: 036 bottom bar and one Settings page

Decisions continue the project D series. D270–D271 (editor samples, PR #80) and D272 (green palette, PR #78) are taken by parallel PRs, and D273 is held back, so this feature starts at D274.

## D274: one `BottomBar` component, rendered by the pages that have one

- **Decision**: `app/BottomBar.tsx` takes an optional `deck` (`slug`, `role`, `isDefault`) and an optional `browseC`.
  - The deck layout (`routes/d.$slug.tsx`) renders it, except in Browse and on `/d/$slug/new`.
  - The deck list (`routes/index.tsx`) and `/settings` render it without a deck.
  - The card page, the editor, `/share`, `/admin/waitlist` and sign-in don't.
  - The bar renders a spacer of its own height before itself, so content never hides behind it (no `:has()`, no per-page padding).
- **Rationale**: the pages that show the bar are few and explicit. A root-level bar would need a route allow-list and would duplicate the deck query.
- **Alternatives**: a bar in `__root.tsx` keyed on the pathname, which needs route matching and hides the deck dependency; and `padding-bottom` on `.page`, which pages without a bar would also get.

## D275: the + is the existing `MoreMenu` with a long press

- **Decision**:
  - **`MoreMenu`**: gains an optional `onLongPress`, implemented by a dependency-free hook `ui/use-long-press.ts`. While the press is held, the hook watches pointer events:
    - when the 500 ms timer fires, it calls `onLongPress`, vibrates for 10 ms where `navigator.vibrate` exists, and swallows the click that follows;
    - moving more than 10 px, `pointercancel` or `pointerleave` cancel the press;
    - `contextmenu` on the trigger is prevented.
  - **The + itself**: CSS `-webkit-touch-callout: none; user-select: none`.
  - **Menu items**: the four create items come from `create-actions.ts`, a pure function of role and deck that applies the same `can()` checks as today's `AddCardLink`, `PasteLink`, `ImportLink` and `SharesLink`, with the same labels and the same hrefs.
  - **Long press target**: `/d/$slug/new`.
- **Rationale**: `MoreMenu` already implements the APG menu button (arrow keys, Escape, outside press, portal, opening above when there's no room below). That covers FR-003 and FR-012 without a second menu. Keyboard users get New card as the first item (FR-004).
- **Alternatives**: a gesture library, which goes against the bundle budget and ADR-065's no-gesture-library rule; and a separate speed-dial component, which would duplicate the menu logic.

## D276: the ⋯ menu and sign-out move out of the header

- **Decision**:
  - **Sign-out logic**: the logic in `AppHeader` (leave the page first, then sign out, D66 and 022) moves into the hook `app/use-sign-out.ts`. The ⋯ menu uses it.
  - **⋯ menu items**: Settings (deck pages go to `/d/$slug/settings`, others to `/settings`), Activity (`can(role, 'event.list')`, deck pages), Waitlist (`me.isPlatformAdmin`) and Sign out.
  - **The signed-in email**: `MenuAction` gains an optional `detail` line, a muted second line on the Sign out item, which shows it.
  - **`AppHeader`**: keeps back, title and `actions` (still used by the card page), and loses Settings and Sign out.
  - **Removed from the deck header**: `DeckSettingsLink` and `ActivityLink` (header use only).
- **Rationale**: there is one place for everything that is rare (FR-005, FR-006). The email stays visible, as the tooltip shows it today.
- **Alternatives**: a sheet or drawer, which is more code for four items.

## D277: Browse and Review in the bar

- **Decision**:
  - **Browse**: `BrowseButton` is used as is, with `c = browseC ?? ALL_CATEGORIES`. From a non-list page (settings, review) it opens All, and closing Browse returns to the list.
  - **Review**: `ReviewPill` is used as is (`item.publish`, not on the personal deck).
  - **Layout**: both show icon plus short label in the bar, and collapse to icon plus accessible name below 360 px.
- **Rationale**: the existing components already carry the right rules and analytics.

## D278: one Settings page

- **Decision**:
  - **`/d/$slug/settings`**: renders `DeckAdminScreen` (heading "This deck") followed by `SettingsScreen` (heading "Your account"). The deck name is in the header title.
  - **`/settings`**: still renders `SettingsScreen` alone.
  - **Platform section**: `SettingsScreen`'s "Platform" (waitlist) stays as is.
  - **Header**: the deck header's Deck settings icon (`list`) is gone, and Settings has one icon (`settings`), in the ⋯ menu only.
  - **Routes**: nothing is renamed, so analytics route patterns and screen names don't change (033).
- **Rationale**: this is the smallest change that gives one page (FR-008, FR-009). Both screens already load independently and handle offline.
- **Alternatives**: a new `/settings?deck=` route, which would break D267 back targets and old links.

## D279: the deck list's + opens New deck

- **Decision**:
  - **Deck list**: the + on the deck list is a plain `IconButton` "New deck" (no menu, no long press). It sets `?new=1` on `/`, which opens `NewDeckForm` (D269) and focuses the name field.
  - **Form**: the form's own collapsed button stays for wide screens.
  - **Cancel**: drops `new` from the URL.
- **Rationale**: there is no deck to add a card to, and the only thing to create on the deck list is a deck (spec Assumptions).

## D280: toasts sit above the bar

- **Decision**: a CSS variable `--bottom-bar-h` is set on `:root` while a bar is mounted. Toasts (`.toast`, bottom fixed) offset by it.
- **Rationale**: undo toasts must not cover the bar, or the bar them.

## E2E tier

**smoke**. Creating a card is a critical journey (constitution V), and its entry point moves from the inline "Add card" link to the bar's +.

- **Smoke journeys**: the existing ones that click "Add card", "Deck settings" or "Sign out" are updated, and one is extended to cover the short press → New card, plus a long press.
- **`@full` cases**:
  - the ⋯ menu by keyboard;
  - the bar stays visible after scrolling;
  - the unified settings shows both groups;
  - the deck list + opens New deck.
- **Unit and component tests only**: role variants (a reader sees no +, an editor has no Review or Activity). E2E signs in only the owner.
