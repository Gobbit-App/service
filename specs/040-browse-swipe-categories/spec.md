# Feature Specification: Browse — content first, vertical cards, sideways categories

**Feature Branch**: `040-browse-swipe-categories`

**Created**: 2026-11-05

**Status**: Draft

**Decisions**: reserves D324–D339

**Supersedes**: [`034-browse-redesign`](../034-browse-redesign/spec.md) FR-002, FR-003, FR-004, FR-005, FR-008, FR-009 and its "no swiping between categories" exclusion. It keeps 034 FR-001 (entry, address, return, prefetch, offline), FR-006 (end page), FR-007 (dock), FR-010 (reduced motion) and FR-011 (state pages), with the changes listed below.

**Input**: User description: "The browse mode needs more improvements. First, the content should be more distinct than the metadata below it, especially when the content doesn't take most of the page. The item content should get much more focus than the rest. Clicking a category of an item while in Browse should take you to that category in Browse. In Browse there is no convenient way to move between categories, especially on a phone held in one hand, and the categories at the top look out of place. The new Browse swipe misses the original intent: switch back the swiping actions. Swipe down to move between items; swipe sideways to change categories. The card always takes up the whole page. Add a button to the bottom bar to open full view, and a long tap (on anything that isn't a button or link) also opens full view. Full view shows the item with its metadata, as Browse does now. Swiping to the sides changes categories. A quick banner from the top shows the category the user switched to and fades out within 2 seconds. Tapping the banner makes it solid and it offers a well-designed dropdown to switch to any other category in the deck. Tapping outside or swiping makes it fade out; it also has a close button."

## Clarifications

### Session 2026-11-05

- Q: Which way do the swipes go? → A: Swipe up for the next card, down for the previous; swipe left for the next category, right for the previous (as in Assumptions).
- Q: Long press opens full view, so how do readers act on text they would otherwise select (a phone number, an email)? → A: In Browse, long press is reserved for browsing, not text selection. Instead, like native apps, Browse recognises emails, phone numbers, web addresses and other numbers in a card's text, marks them, and gives each its own tap action: email opens the mail app, phone opens the dialer, a web address opens the link, any other number is copied to the clipboard (US7, FR-024–FR-028).
- Q: Can a swipe leave full view? → A: Yes. In full view entered from Browse, swiping up scrolls to the bottom of the card when needed; continuing to swipe up past the bottom pulls the full card away and gradually reveals Browse behind it, and finishing the swipe returns to Browse on the same card (FR-029).
- Q: Which card opens after a category switch? → A: The new category's first card; a card category tap from full view keeps the same card (as in Assumptions).

## Why

Browse (034) made each card full-screen, but on a phone it still misses what it is for:

- **The content doesn't stand out.** A short card (a few lines, like a list of phone numbers) takes the top third of the screen. The categories chip, "Edited 2 days ago", a "Details" block and a "Source" block follow it in the same size and colour. The metadata takes more room than the card and looks just as important.
- **Changing category is awkward.** The categories sit in a chip rail at the top of the screen, out of thumb reach on a phone held in one hand. The rail also looks like the deck list's filter row pasted into a reader. The only other way to change category is to finish the current one and reach its end page.
- **The swipes are the wrong way round.** 009 set out a model where you move vertically through cards and sideways through categories. 034 turned card flipping sideways and dropped category swipes. Sideways card flipping also competes with the system back gesture and with wide content.
- **Card categories lead out of Browse.** Tapping a card's category opens the deck list for it, so the reader loses their place in Browse.

## Outcome

Browse reads like a card feed. Each card fills the screen with only its content, presented as the clear focus of the page. Swiping up or down moves between cards. Swiping left or right changes category, and a short banner says which category you are in. That banner also gives a one-handed way to jump to any category. A card's metadata (categories, details, source, dates) is one tap or one long press away, in a full view.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read cards one after another, vertically (Priority: P1)

A member opens Browse from a deck's list. The current card fills the space between the slim top bar and the dock, and shows only its content: title, body, image, link, table or calc. Swiping up brings the next card in from below, following the finger. Swiping down goes back. A short card sits as a clear, distinct block on the page rather than as a few lines at the top of an empty screen.

**Why this priority**: Reading card after card is the core of Browse. This restores the original vertical model and the content-first look, and it is the minimum that makes the feature worth shipping.

**Independent Test**: In a category with 10 cards, open Browse on a 390×844 phone viewport and swipe up through all 10, then down back to the first. Each swipe moves exactly one card and shows no metadata below the content.

**Acceptance Scenarios**:

1. **Given** Browse on card 3 of 10, **When** the member swipes up, **Then** card 4 settles in place, with no card stopping half-way, and the position reads "4 / 10".
2. **Given** Browse on card 4, **When** the member swipes down, **Then** card 3 settles in place.
3. **Given** a card whose content is a few lines, **When** it is shown, **Then** it appears as a visually distinct block (its own surface, larger type than list cards) that takes the reader's eye first, and the page shows no categories, dates, details or source.
4. **Given** a card taller than the screen (a long table or a tall photo), **When** the member swipes up, **Then** the card's own content scrolls first. Only once its end is reached does a further swipe move to the next card. Swiping down at the top of the card goes to the previous one.
5. **Given** the last card of a category, **When** the member swipes up, **Then** the end page offers "Continue to <next category>" (when there is one) and "Back to the list", as in 034.
6. **Given** Browse, **When** the member taps the dock's next or previous card button, **Then** the result is the same as swiping up or down.

---

### User Story 2 - Change category with a sideways swipe and see where you are (Priority: P1)

While reading, the member swipes left to go to the next category and right to go to the previous one, in the same order as the deck's chip row (All first). The new category's first card slides in sideways. A banner drops in from the top with the category's name (for example "Recipes · 12 cards") and fades out on its own within 2 seconds.

**Why this priority**: This is the second half of the original intent and the main one-handed fix. Without it, changing category still needs a reach to the top of the screen.

**Independent Test**: In a deck with All, General and Links, open Browse on All and swipe left twice. Browse shows the first card of General, then of Links, and a banner names each one and then disappears.

**Acceptance Scenarios**:

1. **Given** Browse in All, **When** the member swipes left, **Then** Browse shows the first card of the next category in chip-row order, and a banner with that category's name slides in from the top.
2. **Given** the banner just appeared, **When** the member does nothing, **Then** it fades out completely within 2 seconds of appearing.
3. **Given** Browse in the last category, **When** the member swipes left, **Then** the category doesn't change (no wrap-around), the card springs back, and a brief banner says it is the last category. The same applies to swiping right in All.
4. **Given** a horizontal swipe that starts within 24 px of the left or right screen edge, **Then** it is not treated as a category swipe, so the system back gesture works as usual.
5. **Given** a card whose content scrolls sideways (a wide table), **When** the member swipes sideways inside that content, **Then** the content scrolls and the category doesn't change.
6. **Given** a mostly diagonal swipe, **Then** Browse moves along one axis only (card or category, whichever direction dominates), never both.

---

### User Story 3 - Jump to any category from the banner (Priority: P1)

The member wants to go straight from "General" to "Recipes" without swiping through every category in between. They tap the banner while it is showing, or tap the category name in the top bar. The banner turns solid and opens a list of the deck's categories (All first, then chip-row order, the current one marked). They tap "Recipes" and Browse shows its first card. A tap outside the banner, a swipe, or its close button makes it fade away without changing anything.

**Why this priority**: Swiping alone only reaches neighbouring categories. The banner is the replacement for the chip rail, so the rail can't be removed without it.

**Independent Test**: In a deck with five categories, open Browse in All, tap the category name, pick the fourth category and land on its first card. Reopen the list and dismiss it with each of the three ways (outside tap, swipe, close button); the category stays the same.

**Acceptance Scenarios**:

1. **Given** the banner is fading out, **When** the member taps it, **Then** it becomes fully opaque, stops fading and shows the category list.
2. **Given** Browse, **When** the member taps the current category's name in the top bar, **Then** the banner opens solid with the category list (the tap and keyboard equivalent of the swipe).
3. **Given** the open list, **When** the member picks a category, **Then** the list closes and Browse shows that category's first card.
4. **Given** the open list, **When** the member taps outside it, swipes on the page, or taps its close button, **Then** it fades out and the category doesn't change. A swipe that dismisses the list doesn't also move the card or category.
5. **Given** a deck with more categories than fit on the screen, **When** the list is open, **Then** it scrolls within itself, stays within thumb reach of the screen's lower half where possible, and the current category is in view.
6. **Given** the open list and a keyboard, **Then** arrow keys move between categories, Enter picks one, Escape closes it, and focus returns to where it was.

---

### User Story 4 - See a card's metadata in full view (Priority: P2)

The member wants to know where a card came from or what details were found in it. They tap the full view button in the dock, or press and hold anywhere on the card that isn't a button or a link. Full view opens over Browse and shows the card's content followed by its metadata: categories, details, type and source with added, edited and published times (what Browse shows below the card today). In full view the content still stands out from the metadata. Closing full view returns to the same card in Browse.

**Why this priority**: The metadata matters less than reading, but moving it out of the main view (US1) must not make it unreachable.

**Independent Test**: On a card with extracted details, open full view with the dock button and close it; then open it with a long press and close it. Both show the content, details and source, and both return to the same card.

**Acceptance Scenarios**:

1. **Given** Browse on a card, **When** the member taps the dock's full view button, **Then** full view opens on that card with its content, categories, details, type and source.
2. **Given** Browse on a card, **When** the member presses and holds for at least 500 ms on any part of the card that isn't a button, link or form control, **Then** full view opens, and the browser's context menu and text selection don't appear.
3. **Given** a press and hold on a link or button, **Then** full view doesn't open and the platform's usual behaviour for that element applies.
4. **Given** full view, **Then** the content is presented as the page's focus (same distinct surface as in Browse), and the metadata is visibly secondary: smaller, quieter, and clearly separated from the content.
5. **Given** full view, **When** the member closes it (close control, system back or Escape), **Then** Browse shows the same card at the same position, and Browse itself stays open.
6. **Given** full view, **When** the member scrolls, **Then** it scrolls vertically to read everything, and swipes don't change card or category.
7. **Given** full view, **Then** the member can select and copy the card's text.
8. **Given** full view on a card longer than the screen, **When** the member swipes up, **Then** it scrolls towards the bottom of the card as usual. Once the bottom is reached, continuing to swipe up moves the full card up with the finger and Browse (the same card, as it looks in the main view) gradually shows behind it, more of it the further the swipe goes.
9. **Given** that pull past the bottom, **When** the member lets go past the threshold (or with a quick flick), **Then** full view closes and Browse shows the same card; it does not also move to the next card. **When** they let go before the threshold, **Then** full view springs back into place and nothing changes.
10. **Given** full view on a card that fits the screen, **When** the member swipes up, **Then** the pull-to-return starts straight away, with no scrolling first.

---

### User Story 5 - Tap a card's category to browse it (Priority: P2)

In full view the member taps one of the card's categories ("General"). Full view closes and Browse switches to that category on the same card, with the category banner showing.

**Why this priority**: It fixes the reported trap of a category tap leaving Browse. It depends on full view (US4), where the categories now live.

**Independent Test**: In Browse on All, open full view on a card in "General" and tap "General". Browse now shows General, on that same card, and the deck list was never shown.

**Acceptance Scenarios**:

1. **Given** full view of a card in categories General and Links, **When** the member taps "Links", **Then** Browse shows the Links category on the same card, with the banner naming Links.
2. **Given** that change, **When** the member closes Browse, **Then** they return to the Links list with that card in view (034 FR-001 return rules).
3. **Given** a card category the member can't see (hidden from their role), **Then** it isn't shown, as in the list today.

---

### User Story 6 - Learn the new moves once (Priority: P3)

The first time the reworked Browse opens on a device, a short "How to browse" sheet explains: swipe up and down for cards, swipe sideways for categories, tap the category name to jump, hold a card (or tap full view) for its details. Dismissing it is remembered on that device. Readers who saw 034's sheet see the new one once.

**Why this priority**: The gestures change direction from what current readers learned, so they need telling once, but the feature works without it.

**Independent Test**: Clear the device's storage, open Browse, see the sheet, dismiss it, reload; it doesn't appear again.

**Acceptance Scenarios**:

1. **Given** a device that dismissed the 034 sheet, **When** the reworked Browse opens, **Then** the new sheet shows once.
2. **Given** the sheet was dismissed, **When** Browse opens again on that device, **Then** it doesn't show.

---

### User Story 7 - Tap a phone number, email or number to act on it (Priority: P2)

A card lists the family's phone numbers. In Browse, each number is marked as tappable. Tapping one opens the phone's dialer with it filled in. An email address opens the mail app with a new message to it, and a web address opens the page. A number that isn't a phone number, such as a door code, a booking reference or an account number, is copied with one tap, and a short confirmation says "Copied". This replaces selecting and copying text, which long press no longer does in Browse.

**Why this priority**: Long press now opens full view (US4), so without this, readers lose the usual way to get a number out of a card. It is also the most common thing a family does with a card of contacts or codes.

**Independent Test**: In Browse, open a card whose body holds a phone number, an email, a web address and a six-digit code. Each is marked; tapping each does its action; the stored card is unchanged.

**Acceptance Scenarios**:

1. **Given** a card with "+30 697 349 6445" in its body, **When** the member taps it in Browse, **Then** the device's dialer opens with that number.
2. **Given** a card with an email address, **When** the member taps it, **Then** the device's mail app opens a new message to that address.
3. **Given** a card with a plain web address that isn't already a link, **When** the member taps it, **Then** the page opens the same way the card's own links do.
4. **Given** a card with "Gate code 4821", **When** the member taps "4821", **Then** it is copied to the clipboard and a short "Copied" confirmation appears and goes away on its own.
5. **Given** detected text, **Then** it looks clearly tappable but stays readable as part of the sentence, and a screen reader announces its action ("Call +30 697 349 6445", "Copy 4821").
6. **Given** a press and hold on detected text, **Then** full view doesn't open (it behaves like a link, FR-015).
7. **Given** a card whose author already made a phone number or address into a link, **Then** the author's link is kept as it is and not detected again.

---

### Edge Cases

- **Empty category**: the page shows the list's empty message. Sideways swipes, the banner and the category list still work. Vertical moves and the card's dock actions are disabled.
- **Offline**: cached categories browse normally. Swiping into an uncached category shows the list's offline message on that page, and the member can still swipe or pick another category.
- **Deck with only All** (no categories): sideways swipes spring back, and the category list shows only All. The top bar still names it.
- **Category changed while the banner list is open** (a background refresh removes a category): the list shows the current categories. If the current category disappears, Browse falls back to All, as an unknown category in the address does today.
- **Long press that turns into a scroll or swipe**: moving the finger more than a small distance before 500 ms cancels the long press; nothing opens.
- **Long press on an image card**: opens full view rather than the platform's image menu.
- **Card changes underneath** (edited or archived by someone else): Browse keeps its place by card id, as today. If the card in full view is archived or deleted, full view closes and Browse shows the next card.
- **Rotation or resize**: the current card and category stay current; an open banner or full view stays open.
- **RTL text**: card text keeps its own direction. "Next category" always means the next chip in chip-row order, and swiping left always means next, whatever the text direction.
- **Swipe-out with a short release**: letting go below the threshold always springs back; reversing direction mid-pull cancels it. A swipe-out that starts while the content is still scrolling (momentum) only begins once the bottom has been reached and the finger keeps moving.
- **Reduced motion** (full view): the pull still reveals Browse behind the card but without the springy settle, and closing jumps rather than slides.
- **Reduced motion**: card and category changes jump without sliding. The banner appears and disappears without sliding or fading, but still disappears after 2 seconds.
- **Detection limits**: text in code spans and code blocks, inside existing links, in the card's title, and numbers that are part of a date, time or a longer word (like "A4" or "2nd") is not detected. Short numbers (fewer than 3 digits) and years in running text (e.g. "since 2019") are not marked as copyable, so a card isn't covered in highlights.
- **Phone or number?** Digit runs that look like a phone number (a leading `+`, or 7 or more digits with the usual spaces, dashes, dots or brackets) are phones; other numbers are copyable numbers. When unsure, Browse treats it as a number to copy, since copying is harmless and dialing is not.
- **Clipboard unavailable** (blocked permission, insecure context): the tap shows a short message that the number couldn't be copied, never a silent failure.
- **No dialer or mail app** (a desktop browser): the tap does what the system does for phone and mail links; Browse doesn't add its own fallback.
- **Deep link with `pane`** (009 addresses): still opens, on the card, in the main view.

## Requirements *(mandatory)*

### Functional Requirements

**Main view**

- **FR-001**: Each Browse page MUST show only the current card's content (title, body or type-specific content, and its image or link preview). Categories, edited time, details and source MUST NOT appear on the main view.
- **FR-002**: The card's content MUST be presented as the clear focus of the page: on its own surface that stands apart from the background, with type larger than the list's cards. A card shorter than the available space MUST be placed so that it reads as the page's centre of attention, not as a few lines at the top of an empty screen.
- **FR-003**: The top bar MUST hold the close control, the current category's name (tappable, opens the category list, FR-012) and the position ("3 / 25", or "3" while more pages exist) with its progress indicator. The category chip rail MUST be removed. The top bar MUST NOT take more than 64 px plus the safe area.
- **FR-004**: The dock MUST hold, in order: Previous card, the card's actions (as in the list), a Full view action, and Next card. Previous and Next MUST be disabled at the ends with the reason given to assistive technology, as today.

**Moving between cards**

- **FR-005**: A vertical swipe MUST move to the next card (upward swipe) or the previous card (downward swipe). The page MUST follow the finger and settle on a whole card. Exactly one card moves per swipe.
- **FR-006**: A card taller than the available space MUST scroll its own content first. A swipe MUST move to the next or previous card only from the end or the start of that content.
- **FR-007**: After a category's last card, a further upward swipe or Next MUST show the end page (034 FR-006).

**Moving between categories**

- **FR-008**: A horizontal swipe MUST move to the next category (leftward swipe) or the previous category (rightward swipe), in the order All, then the deck's chip-row order, without wrapping. Categories hidden from the member's role MUST NOT appear in the order. The new category MUST open on its first card. At either end the page MUST spring back.
- **FR-009**: Horizontal swipes that start within 24 px of either screen edge MUST be ignored. Horizontal swipes inside content that can itself scroll sideways MUST scroll that content and MUST NOT change category.
- **FR-010**: Each swipe MUST be resolved to one axis (card or category) by its dominant direction; a single gesture MUST NOT do both.

**Category banner and list**

- **FR-011**: Every category change (swipe, list, card category tap, end page) MUST show a banner from the top naming the category and its card count when known. Unless the member interacts with it, the banner MUST fade out and be gone within 2 seconds of appearing. It MUST be announced to assistive technology politely without moving focus. At the ends of the order (FR-008), the banner MUST say there is no next or previous category instead.
- **FR-012**: Tapping the banner, or the category name in the top bar, MUST make the banner fully opaque and show the deck's categories (All first, then chip-row order, current one marked, each with its card count when known), with a close button. The list MUST be comfortably usable with one thumb: large rows, scrollable when long, current category in view.
- **FR-013**: Picking a category in the list MUST switch Browse to that category's first card and close the list. Tapping outside the list, swiping on the page, the close button, Escape or system back MUST close it without changing category, and a dismissing swipe MUST NOT also move the card or category.
- **FR-014**: The category list MUST be operable by keyboard (arrow keys to move, Enter to pick, Escape to close) and focus MUST return to where it was when it closes.

**Full view**

- **FR-015**: Full view MUST open from the dock's Full view action and from a press and hold of at least 500 ms on any part of the card that isn't a button, link or form control. Moving the finger beyond a small threshold before 500 ms MUST cancel the hold. A hold that opens full view MUST NOT also show the browser's context menu or start a text selection.
- **FR-016**: Full view MUST show the card's content followed by its categories, details (grouped by kind, with the empty-details message), type and source (kind, link, added/edited/published times), i.e. everything Browse shows today. The content MUST keep the same distinct presentation as on the main view, and the metadata MUST be visibly secondary to it.
- **FR-017**: Full view MUST scroll vertically. Swipes in full view MUST NOT change card or category; a continued upward swipe past the bottom closes full view (FR-029). Because a long press has no browsing role there, text in full view MUST stay selectable as the fallback for copying any text detection doesn't cover.
- **FR-018**: Closing full view (close control, Escape, system back, or the swipe-out of FR-029) MUST return to the same card in Browse without closing Browse. Opening full view MUST NOT add a history entry that survives closing it.
- **FR-019**: Tapping a category on a card in full view MUST close full view and switch Browse to that category on the same card (FR-011 banner shown). It MUST NOT open the deck list.
- **FR-029**: In full view entered from Browse, an upward swipe MUST first scroll the card to its bottom. Continuing the upward swipe once at the bottom (or straight away when the card fits the screen) MUST pull the full view up with the finger and progressively reveal Browse on the same card behind it, in proportion to the distance pulled, so it is clear that letting go returns to Browse. Releasing past a threshold, or flicking, MUST close full view and land on the same card without moving to the next one; releasing earlier MUST spring back with nothing changed. The close control stays the tap and keyboard equivalent.

**Detected text**

- **FR-024**: In Browse (main view and full view), the card's body text, and the text cells of table cards, MUST have email addresses, phone numbers, web addresses and other numbers recognised and marked as tappable. Detection MUST only change how the card is shown, never what is stored.
- **FR-025**: Tapping detected text MUST: open the mail app with a new message for an email; open the dialer with the number for a phone; open a web address the same way the card's own links open; copy any other number to the clipboard and show a short "Copied" confirmation that disappears on its own.
- **FR-026**: Detection MUST skip titles, code, existing links, numbers that belong to a date, time or word, numbers shorter than 3 digits and stand-alone years in running text. Ambiguous digit runs MUST be treated as numbers to copy, not phones.
- **FR-027**: Detected text MUST look tappable while staying readable in its sentence, MUST be a real control that is keyboard-focusable, and MUST carry an accessible name naming its action ("Call …", "Email …", "Open …", "Copy …"). It counts as a link for the long-press rule (FR-015).
- **FR-028**: A failed copy MUST tell the member it didn't work. Every detected-text action MUST work offline except opening a web address.

**Keyboard, address and first run**

- **FR-020**: Keys: ArrowDown and PageDown MUST go to the next card; ArrowUp and PageUp to the previous card (after scrolling a tall card's content, as with swipes); ArrowRight to the next category and ArrowLeft to the previous one; a documented key MUST open full view; Escape MUST close the innermost open layer (list, then full view, then Browse). Keys typed in text fields and open menus are left alone.
- **FR-021**: The address MUST keep encoding the category and card (034 FR-001), and category and card changes MUST NOT add history entries. Old addresses with `pane` MUST still open.
- **FR-022**: The first time the reworked Browse opens on a device, the "How to browse" sheet MUST explain vertical card swipes, sideways category swipes, the category name/banner and full view. It MUST use a new per-device storage key so readers of 034 see it once.

**Unchanged**

- **FR-023**: Browse MUST keep 034's guarantees: same cards, order and visibility as the list; return to the list on the current card; next page loaded ahead; cached categories offline; reduced motion; nothing added to the initial download; no API or database change.

### Key Entities

- **Browse position**: the current category (All or a category slug) and current card id. Already in the address; this feature adds no new stored data.
- **Category order**: All followed by the categories visible to the member in chip-row order. Drives sideways swipes, the banner list and the end page.
- **Full view state**: whether the current card is open in full view. Transient, not stored.
- **First-run flag**: the per-device "How to browse seen" marker, under a new key.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a 390×844 phone viewport, the card's content area takes at least 85 % of the screen height, and no metadata (categories, dates, details, source) is visible on the main view.
- **SC-002**: A member holding a phone in one hand can reach any category of a deck in at most two actions from Browse (tap the category name, pick a category), with every control involved in the lower two thirds of the screen except the category name.
- **SC-003**: In a usability check, testers asked "which part of the screen is the card?" point to the content block first on a short card, in both the main view and full view.
- **SC-004**: The category banner is gone within 2 seconds of a category change in 100 % of automated checks when not touched.
- **SC-005**: Every Browse action (next/previous card, next/previous category, jump to a category, open and close full view, card category tap, detected-text actions) works with taps only and with a keyboard only (end-to-end tests).
- **SC-006**: A member flips 10 cards, changes category twice by swiping and once from the list, and reads one card's source, without leaving Browse.
- **SC-007**: The initial download stays within the 150 KB gzip budget, and swiping through 20 image cards on a mid-range phone shows no main-thread task over 50 ms.
- **SC-008**: On a card listing four phone numbers and an email (as in the reported screenshot), a member can call any number or start an email in one tap from Browse, and copy a six-digit code in one tap with a visible confirmation.
- **SC-009**: Across the search-eval fixture deck, no title, code, existing link, date or stand-alone year is marked as detected text, and every phone number written in a common format (international or local, with spaces, dashes, dots or brackets) is recognised.

## Assumptions

- **Gesture directions** follow the common feed convention: swipe up for the next card, swipe left for the next category. "Swipe down to move between items" in the request is read as vertical movement in both directions.
- **Category order and ends** reuse 009's rules: All first, chip-row order, no wrap-around.
- **Switching category opens its first card** (009/034 behaviour), except a card category tap from full view, which keeps the same card because it belongs to that category.
- **The chip rail is replaced** by the tappable category name plus the banner list. That gives swiping a visible tap and keyboard equivalent, which the constitution requires.
- **Long press is for browsing, not text selection** (confirmed 2026-11-05). On the main view it opens full view. Readers act on emails, phones, web addresses and numbers by tapping them (US7), and full view keeps text selection as the fallback for anything else (FR-017). Links, buttons and detected text keep their own long-press behaviour.
- **Full view is an overlay on Browse**, not a separate page: closing it never leaves Browse, and it doesn't change the address in a way that survives closing.
- **Card counts** in the banner and list come from data already loaded; when unknown, only the name shows.
- **Detection stays in Browse**: the deck list, the editor preview and public pages keep showing text as they do today. Extending detection to them is a later feature.
- **No analytics or accountability changes**: Browse makes no decisions about people or content; existing screen tracking continues to report Browse, and full view is reported as part of it unless the plan decides otherwise.
- **Project constraints carry over**: Browse stays on native scrolling with no gesture library (ADR-065) and lazy-loaded, as in 034.
- **The end page stays** as the way to continue after a category's last card.

## Out of Scope

- Detecting street addresses, dates or times (opening maps or a calendar), and detected text outside Browse.

- Pinch-zoom on images, an immersive mode that hides all chrome, and remembering a per-category position between visits.
- Changing the deck list's own chip row or the card actions themselves.
- Any API or database change.
