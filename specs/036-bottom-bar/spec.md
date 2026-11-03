# Feature Specification: Bottom bar and one Settings page

**Feature**: `036-bottom-bar` · **Status**: Draft · **Created**: 2026-11-03 · **Stacked on**: `fix/deck-nav-and-new-deck` (D267–D269)

**Input**: "Combine the top header menu and the creation menu into a fixed bottom menu that doesn't hide on scroll. The + always sits on the right: a long press goes straight to create, a short press opens the options (create, share/paste, import, shares). Browse and Review (for the right roles) are always-visible actions. Everything else (sign out, etc.) goes in a popup menu. Deck settings and platform settings are confusing: merge them, their icons are too alike."

## Why

The family is about to start using Gobbit, mostly on phones. Today a deck page scatters its actions over three places:

- **Top header**: Browse, the Review pill, Activity, Deck settings (a list icon), Settings (a cog) and Sign out, squeezed next to the title.
- **Creation row**: Add card, Paste, Import and Shares, shown above the list. It scrolls away.
- **Chip row**: Favorites, Archived and Links.

On a phone the header actions are small, hard to reach with a thumb, and two of them look alike. "Deck settings" and "Settings" are two separate pages, and nothing explains which one holds what. New users don't know where to start.

## Outcome

Every signed-in page with navigation ends in one fixed bottom bar, within thumb reach, that never scrolls away.

- **Left**: the ⋯ menu.
- **Middle**: the always-visible actions, Browse and Review.
- **Right**: the + for adding.

The top keeps only the back control and the title. There is one Settings page; inside a deck it shows the deck's settings first and the app's after them.

## User scenarios

1. **Read on a phone (editor or reader)**: a family member opens the family deck. The bottom bar shows Browse, the ⋯ menu and, for editors, the +. They tap Browse and flip through cards. Back in the list, the bar is still there after scrolling to the bottom.
2. **Add a card quickly (editor and up)**: on the deck list they press and hold the + and the new-card editor opens. A short tap on the + instead opens a small menu: New card, Paste or share a link, Import, Shares. They pick one, or dismiss the menu by tapping outside or pressing Escape.
3. **Review proposals (owner, maintainer)**: the bar shows Review with the number of waiting proposals. One tap opens the review queue.
4. **Find everything else**: the ⋯ menu lists Settings, Activity (owners and maintainers), the signed-in email and Sign out.
5. **Change a setting**: Settings in the ⋯ menu inside a deck opens one page. Deck sections come first: name and public, categories, members and invites. App sections follow: send-in address, tokens, privacy and, for the account owner, the waitlist. Outside a deck (the deck list), the same entry opens the app sections only.

## Requirements

- **FR-001**: The deck pages (list, category, favorites, archived, links, search, review, log, settings, import, shares), the deck list and `/settings` MUST end in a bottom bar fixed to the bottom of the viewport, above the safe-area inset. It MUST stay visible while the page scrolls, and page content MUST NOT be hidden behind it.
- **FR-002**: The bar MUST hold, in this order:
  - the ⋯ menu at the left end;
  - in the middle, Browse (deck pages only) and Review (deck pages, roles with `item.publish` only, with its count as today);
  - the + at the right end (deck pages, roles with `item.create`; on the deck list it starts a new deck).

  Readers get no +. Actions a role can't use are absent, not disabled.
- **FR-003**: A short press (tap, click, Enter or Space) on the + MUST open the create menu with **New card**, **Paste or share** (paste box), **Import** and **Shares**, each shown only when the role and deck allow it as today.
  - Picking an item navigates to it.
  - Escape, a tap outside, or picking an item closes the menu, and focus returns to the +.
- **FR-004**: A long press on the + (held ≥ 500 ms with touch or mouse) MUST open the new-card editor directly, without opening the menu. The browser's context menu and text selection MUST NOT appear on the long press. New card stays the first item of the create menu, so keyboard and assistive-technology users reach it without a long press.
- **FR-005**: The ⋯ menu MUST hold:
  - **Settings**: the unified page;
  - **Activity**: owners and maintainers, deck pages;
  - **Waitlist admin**: account owners, as today;
  - the signed-in email as text;
  - **Sign out**: as today, leaving the page before signing out.

  It closes like the create menu.
- **FR-006**: The top header MUST keep only the back control (D200/D267) and the title. Settings, Deck settings, Activity, Sign out, Browse and Review leave it.
- **FR-007**: The inline creation row (Add card, Paste, Import, Shares) above the deck list MUST be removed; the create menu replaces it.
- **FR-008**: There MUST be one Settings page.
  - Inside a deck (`/d/$slug/settings`) it shows the deck sections first (as the role allows today), then the app sections.
  - `/settings` shows the app sections only.
  - Each section has a heading, so the page reads as one list.
  - The separate deck-settings and settings icons disappear: Settings uses one icon.
- **FR-009**: Old links (`/settings`, `/d/$slug/settings`) MUST keep working. Back from Settings follows D267: deck settings goes to the deck, `/settings` to the last deck.
- **FR-010**: Browse (full screen, its own dock), the card editor (its own Save and Cancel), the card page and the sign-in page MUST NOT show the bar.
- **FR-011**: Offline, the bar and its menus MUST stay usable, and items that need the network stay disabled as on their pages today.
- **FR-012**: Every bar action and menu item MUST render through `ui/buttons` with icons from `ui/icons` (ADR-059). Menus are keyboard-operable: arrow keys move between items, Escape closes, and focus is managed.
- **FR-013**: No API, DB or analytics-catalogue changes, beyond screen names if a route is renamed (none expected). The initial download stays within the 150 KB gzip budget.

## Success criteria

- **SC-001**: On a 390×844 phone, every deck action (Browse, Review, create options, Settings, Activity, Sign out) is reachable from the bottom 120 px of the screen in at most two taps, at any scroll position.
- **SC-002**: An editor goes from the deck list to the new-card editor with one long press, or two taps.
- **SC-003**: A family member finds a deck setting and an app setting on the same page without knowing which kind it is.
- **SC-004**: Every bar and menu action works with keyboard only (e2e), and the initial JS stays ≤ 150 KB gzip.

## Edge cases

- **Long press released early** (< 500 ms) counts as a short press. A press that moves away (scroll or drag) does nothing.
- **Personal deck** (`/d/me`): the bar shows Browse and +; there is no Review (no proposals there) and no member sections in Settings.
- **Deck list with no decks**: the bar shows only ⋯ and + (New deck).
- **Small or landscape screens**: the bar stays one row; labels may collapse to icons with accessible names.
- **On-screen keyboard open** (the search box): the bar may be covered by the keyboard, but must not cover the focused field.
- **Account owner without a deck role**: Waitlist admin stays reachable from the ⋯ menu on the deck list.

## Assumptions

- **Chip row stays**: Favorites, Archived and Links stay where they are (they are list filters, not actions).
- **Top search stays**: the search box stays at the top of the deck page.
- **Browse is unchanged**: Browse keeps its own bottom dock. A second bar there would stack two docks.
- **Deck list +**: on the deck list the + opens the New deck form (D269), because there is no deck to add a card to.
- **Long-press threshold**: 500 ms matches common mobile conventions; a long press gives haptic feedback where the device supports it.
- **Primary audience**: family editors and readers on phones. Desktop gets the same bar.

## Out of scope

- A dedicated home or "Today" screen.
- Customising which actions sit in the bar.
- Moving the chip row or the search into the bar.
- API, DB or permission changes.
