# Feature Specification: First-class card composer

**Feature**: `039-editor-experience` · **Status**: Draft · **Created**: 2026-11-03 · **Decisions**: reserves D300–D319 (038 owns D281 onward and may take more when it is planned) · **Depends on**: `038-rich-text-body`

**Input**: "Post-038 (rich-text body): take the card creation screen to a professional, first-class experience and look and feel. (1) The deck search box and category chips must not show above the new-card interface. (2) Everything should feel modern and high-end. The card type cannot be chosen with radio buttons; use a modern app design that feels like a high-end mobile app and works well at bigger resolutions and on desktop. Mobile and touch come first."

## Why

Creating a card is the main way content gets into Gobbit. The screen works, but it looks like a settings form rather than a place to write:

- **It isn't focused**: on `/d/{slug}/new` the deck's search box and category chip rail sit above "New card". They take about a third of a phone screen, invite taps that leave the editor, and have nothing to do with writing a card. Editing an existing card doesn't show them, so the two screens also look different.
- **Picking a type looks dated**: Text, Link, Image, Table and Calc are a row of native radio buttons under a "Type" legend. They have no icons and give no hint of what each type is for. On a phone they are small tap targets crowded into one line.
- **It reads as a form**: every field is a labelled box of the same weight, so the title, the body and the metadata all look equally important. Save and Cancel sit at the very bottom of a long form, so on a phone you have to scroll past everything to finish. Edit and Preview are tabs styled like a document toolbar.
- **038 raises the stakes**: rich-text bodies add a formatting toolbar. If the screen around it stays a form, the new editor will feel bolted on.

## Outcome

Creating or editing a card feels like composing in a high-end mobile app such as a notes, mail or social composer. The screen is full and focused, with no deck chrome. Choosing the type is a visual, touch-friendly choice. The title and body are the canvas. Details (categories, source) are quieter and grouped. Save is always within reach. The same screen adapts to tablets and desktops instead of stretching a phone layout.

Nothing about what a card is changes: same types, fields, limits, drafts, leave guard and server rules. This is a presentation and interaction feature.

## User scenarios

### US1 — A focused composer, with no deck chrome (P1)

A family member taps "New card" in a deck. The composer opens full-screen, showing only a slim top bar: close on the leading side, the screen name and deck name in the middle, Save on the trailing side. The deck's search box, category chip rail and bottom bar are not shown. Editing an existing card opens the same composer.

**Why this priority**: it is the simplest visible fix the user asked for, and every other story builds on this frame. It can ship on its own.

**Independent test**: open `/d/{slug}/new` and an existing card's edit screen on a phone-sized and a desktop-sized viewport. Neither shows the deck search, category chips or bottom bar, and both share the same top bar.

**Acceptance**:
1. **Given** a deck, **when** the new-card screen opens, **then** the deck search box and the category chip rail are not rendered.
2. **Given** the new-card or edit screen, **when** it renders, **then** it shows the composer top bar (close/back, screen title with deck name, Save) and no other app or deck navigation.
3. **Given** the composer, **when** the person taps close, **then** it behaves exactly like today's Cancel/Back: it returns to where they came from and shows the leave guard if there are unsaved changes.
4. **Given** a deck page, **when** the person leaves the composer, **then** the deck's search, chips and bottom bar are back as before.

### US2 — Choose the type visually (P1)

Starting a card, the person sees the five types as large tiles, each with its own icon, name and a one-line hint (for example "Link: save a page with its preview", "Calc: a small calculator for recipes and conversions"). One tap picks a type and moves them straight to writing. Later they can switch type from a compact type control in the composer. If they were sent to a specific type (for example from a "New link" shortcut or a share), the tiles are skipped.

**Why this priority**: the user named radio buttons as the thing that must go. Type choice is the first interaction on the screen and sets the tone for everything after it.

**Independent test**: open the new-card screen, pick each type by touch and by keyboard only, and check that the composer shows that type's fields. Then switch type from inside the composer.

**Acceptance**:
1. **Given** the new-card screen with no type in the address, **when** it opens, **then** it shows the type chooser: five tiles with an icon, a name and a hint, sized for touch (at least 44 × 44 px, and in practice much larger), and no radio buttons.
2. **Given** the type chooser, **when** a tile is tapped, **then** the composer opens for that type with the title field focused (on touch devices it is focused without forcing the keyboard open if the platform doesn't allow it).
3. **Given** a type in the address (`?type=link`), **when** the screen opens, **then** the chooser is skipped and the composer shows that type.
4. **Given** the composer for a new card, **when** the person opens the type control, **then** they can switch to another type. Content the new type can't hold follows today's rules (D271): shared fields are kept, and type-specific content they'd lose is only discarded after a confirm.
5. **Given** an existing card being edited, **when** the composer shows, **then** the type appears as a read-only label with its icon, not as a control.
6. **Given** the deck has no image storage, **when** the chooser or type control shows, **then** Image is shown unavailable, with the reason visible next to it (as today), and can't be picked.
7. **Given** a keyboard or screen-reader user, **when** they reach the chooser, **then** it works as a single-choice group: arrow keys move between tiles, Enter or Space picks one, and each tile announces its name and hint.

### US3 — Title and body are the canvas (P1)

In the composer the title is a large, borderless headline field ("Title") and the body is the 038 rich-text area directly under it, styled like the card it will become. The 038 formatting toolbar docks to the bottom of the screen, above the on-screen keyboard, while the body is focused. Type-specific fields (link URL and preview, photo, table grid, calc fields) appear as a clearly titled section that belongs to the type. Categories and the source link sit in a quieter "Details" section at the end, never above the writing area.

**Why this priority**: it is what makes the screen feel like composing rather than filling in a form, and it is where 038's editor lands.

**Independent test**: on a phone viewport, create a text card and a link card. The title and body take the top of the screen. The toolbar is reachable with the keyboard open. Categories and source sit below in Details, and the saved card matches what was composed.

**Acceptance**:
1. **Given** the composer, **when** it renders, **then** the order is: type-specific media where the type leads with it (image photo, link preview), then the title, then the body, then the remaining type fields, then Details (categories, source).
2. **Given** the body is focused on a phone with the keyboard open, **when** the person types, **then** the formatting toolbar and Save stay reachable without scrolling the page, and the caret is never hidden behind the toolbar or keyboard.
3. **Given** the title or body nears its limit, **when** the person types, **then** a compact counter appears near the field from 80% of the limit (always shown when over), using today's counting and messages.
4. **Given** a field with a server or local validation error, **when** Save is tapped, **then** the composer scrolls to and focuses the first invalid field and shows the message under it. Save shows the blocked reason as today ("Fix 1 field").
5. **Given** categories, **when** Details renders, **then** they stay toggle chips with inline "New category" as today, and keep today's instant-save behaviour when editing (D207/D208).

### US4 — Save is always within reach, with clear feedback (P2)

On every screen size, Save lives in the composer's top bar and also follows the keyboard on phones, so it never needs a scroll. While saving, the button shows progress and the composer can't be submitted twice. On success the person lands where they'll see the card (as today), with a short confirmation. On failure the composer stays put with the error in view and the draft kept.

**Independent test**: create a card and save from the top bar with the keyboard open. Force a server error and check that the draft and error survive.

**Acceptance**:
1. **Given** a valid card, **when** Save is tapped, **then** the button shows a busy state, further taps do nothing, and on success the person is navigated as today with a brief confirmation.
2. **Given** an invalid card, **when** the person looks at Save, **then** it shows as unavailable with the reason visible (ADR-059), not silently disabled.
3. **Given** the save fails (offline, server error), **when** the response arrives, **then** the composer keeps every field and the draft, and shows the error in a banner at the top of the writing area.

### US5 — Preview without leaving the canvas (P2)

On a phone the person taps a Preview control in the top bar to see the card exactly as readers will. They tap again (or Back/Escape) to return to writing in the same place. On a tablet or desktop the preview sits beside the composer and updates live, so no toggle is needed.

**Acceptance**:
1. **Given** a phone-width screen, **when** Preview is tapped, **then** the composer swaps to the rendered card, and returning restores the scroll position and focus.
2. **Given** a screen at least as wide as the tablet breakpoint, **when** the composer renders, **then** the editor and a live preview show side by side. The editor column has a comfortable reading width and the preview stays in view while scrolling.
3. **Given** any width, **when** the preview shows, **then** it uses the same card rendering as the deck (as today, D136).

### US6 — Feels high-end on desktop too (P2)

On a desktop browser the composer is a centred writing surface, not a phone layout stretched to fit. It works fully with the keyboard: Ctrl/Cmd+Enter saves, Escape closes (through the leave guard), and focus order follows the visual order. Hover states and visible focus rings are consistent.

**Acceptance**:
1. **Given** a desktop-width window, **when** the composer renders, **then** content is centred with a maximum writing width, and the top bar actions align with it.
2. **Given** the composer, **when** Ctrl/Cmd+Enter is pressed, **then** it saves as if Save were tapped. **When** Escape is pressed outside an open menu, sheet or dialog, **then** it closes as US1-3 does.
3. **Given** a keyboard user, **when** they tab through, **then** they reach the type control, title, body, toolbar (one tab stop, per 038), type fields, Details and Save in visual order, each with a visible focus ring.

### US7 — One visual language (P3)

The composer's dialogs and pickers (leave guard, type switch confirm, restore draft, colour picker from 038) use one modern pattern: a bottom sheet on phones and a centred dialog on larger screens, with a consistent motion, elevation and corner style. Movement respects "reduce motion".

**Acceptance**:
1. **Given** a phone width, **when** the leave guard or type switch confirm opens, **then** it rises as a bottom sheet with its actions within thumb reach. On larger screens it is a centred dialog.
2. **Given** "reduce motion" is on, **when** sheets, the chooser or the preview change, **then** they appear without sliding or scaling animation.
3. **Given** the "Restore unsaved draft?" prompt, **when** it shows, **then** it is an inline card at the top of the composer in the same visual style, with today's Restore / Discard actions and stale warning.

## Requirements

### Frame and navigation

- **FR-001**: The new-card and edit-card screens MUST render without the deck search box, the category chip rail and the bottom bar, and MUST share one composer frame.
- **FR-002**: The composer top bar MUST hold a close/back action (leading), the screen title ("New card" / "Edit card") with the deck name, a Preview control on narrow screens, and Save (trailing). It MUST respect the device safe areas.
- **FR-003**: The existing routes, back targets (D200), leave guard (D201–D204), draft keys and autosave (D145), and `?type=` handling MUST keep working unchanged in behaviour.

### Type choice

- **FR-004**: Card type MUST NOT be chosen with visible radio buttons. New cards without a type in the address MUST start with a type chooser of tiles (icon, name, one-line hint), laid out for one-handed use on a phone and as a single row or grid on larger screens.
- **FR-005**: Each card type MUST have its own icon in the project's icon set (ADR-059). Icons are SVG, with no glyphs or emoji.
- **FR-006**: Inside the composer, a compact type control MUST let a new card switch type. It opens a picker in the same tile style (sheet on phone, popover or dialog on larger screens). Switching follows D271 rebaseline rules and confirms before discarding type-specific content.
- **FR-007**: The chooser and the type control MUST be accessible single-choice controls: named group, arrow-key movement, selected state announced, and unavailable types announced with their reason.

### Composer layout

- **FR-008**: The title MUST be a prominent headline-style field and the body MUST be the 038 rich-text editor directly beneath it. Neither may be preceded by metadata fields.
- **FR-009**: Type-specific fields MUST be grouped in a titled section for the type, with the existing fields, labels and behaviours (link fetch preview and photo, image pick/upload/retry, table grid, calc fields).
- **FR-010**: Categories and source MUST be in a "Details" section after the writing and type areas, keeping today's chip toggles, inline new category and instant save on edit.
- **FR-011**: Limit counters MUST stay accurate to today's rules and MUST be visible from 80% of a limit and always when over it.
- **FR-012**: On phones with the on-screen keyboard open, the 038 formatting toolbar (while the body is focused) and Save MUST remain reachable without scrolling, and the focused caret MUST stay visible.
- **FR-013**: On a failed Save the composer MUST scroll to and focus the first invalid field. Save's unavailable state MUST show its reason (ADR-059).

### Responsive behaviour

- **FR-014**: Below the tablet breakpoint the composer is a single column with Preview as a top-bar toggle. At or above it, the editor and a sticky live preview show side by side. On desktop the content is centred with a maximum writing width.
- **FR-015**: The composer MUST work fully with touch only, with a keyboard only, and with a screen reader. Keyboard shortcuts: Ctrl/Cmd+Enter saves, Escape closes through the leave guard (unless a menu, sheet or dialog is open, which Escape closes first).
- **FR-016**: Every interactive target MUST be at least 44 × 44 px (`--tap`). No layout may scroll sideways at 320 px width.

### Visual language

- **FR-017**: The composer MUST use a defined set of design tokens (type scale, spacing scale, elevation, corner radii, motion durations) added to the theme. It MUST look right in both the light and dark themes, with text contrast of at least 4.5:1 and non-text UI contrast of at least 3:1.
- **FR-018**: Sheets and dialogs used by the composer (leave guard, type switch, draft restore, 038 colour picker) MUST share one pattern: a bottom sheet on phones and a centred dialog on larger screens, built on the native dialog element as today.
- **FR-019**: Motion MUST be short and purposeful (no animation over 300 ms) and MUST be removed under "prefers reduced motion".
- **FR-020**: Actions MUST render through `ui/buttons` with icons from `ui/icons`, with no `title` attributes and no glyphs (ADR-059). The composer's styles MUST NOT restyle shared button or menu classes unscoped (D214).

### Scope guards

- **FR-021**: No API, database or contract change. Card types, fields, limits, validation and save semantics stay as they are.
- **FR-022**: The composer code and styles MUST stay out of the initial bundle (lazy, as today) and the initial JS MUST stay within the 150 KB gzip budget.
- **FR-023**: No new decision events. Nothing here decides about a person (constitution VIII); the plan records "None" with that reason.
- **FR-024**: No UI kit, component library or gesture library (constitution VI, ADR-065). Plain CSS on the project's tokens.

## Success criteria

- **SC-001**: On a 375 px wide phone, with the keyboard closed, the title and the first lines of the body are visible on opening the composer for a text card, with no deck chrome above them.
- **SC-002**: A person creates a text card with a title, a formatted body and one category on a phone in under 45 seconds without scrolling to find Save.
- **SC-003**: Picking a type takes one tap from the new-card screen. Every type can also be picked with the keyboard alone (e2e).
- **SC-004**: At 320 px, 375 px, 768 px and 1280 px widths, the composer has no sideways scroll, no clipped controls and no target under 44 px (checked by tests).
- **SC-005**: Automated accessibility checks on the chooser, composer, preview and sheets report no serious or critical issues in either theme.
- **SC-006**: In a side-by-side review against two named reference apps, chosen in the plan, the project owner rates the composer "first-class" on phone and desktop. This is the qualitative gate before merge.

## Edge cases

- **Shared or deep-linked types**: `?type=` with an unknown or unavailable type (image without storage) falls back to the chooser with the reason shown, never a broken composer.
- **Restored draft for another type**: a draft is keyed by type (D145), so restoring opens the composer on the draft's type and skips the chooser.
- **Switching type with content**: title and body carry over. Table, calc or photo content would be lost, so the switch asks first. Cancelling keeps everything.
- **Very long titles or many categories**: the headline wraps (no truncation while editing), and the Details chips wrap onto lines without sideways scroll.
- **Keyboard covering content** on iOS and Android: the visible-viewport changes keep the caret, toolbar and Save visible. Rotating the device keeps the state.
- **Right-to-left text**: the top bar, chooser and sheets mirror. Fields keep `dir="auto"`.
- **Offline**: the composer opens from cache once it has loaded before. Save failing offline keeps the draft (US4-3).
- **Review queue inline edit**: keeps its own compact layout. It only picks up the shared field styles and the 038 editor, not the composer frame.
- **Edit route outside the deck layout**: it gets the same frame, with the deck name taken from the card.

## Assumptions

- **Order**: 038 ships first. 039 restyles and places its toolbar and colour picker, and does not change what they do. The US1 chrome fix doesn't depend on 038 and may ship first as its own small PR.
- **Chooser as a step**: a first-step tile chooser plus an in-composer type control is the chosen "modern app" pattern, over a segmented control. Five types with hints don't fit a segmented control on a 320 px phone, and the tiles teach new members what each type is for.
- **Save placement**: Save sits in the top bar on all sizes, the common pattern in mail and notes composers. On phones it is also kept reachable while the keyboard is open (FR-012).
- **Theme**: the existing light and dark themes, which follow the system. No theme toggle or new brand colours. The new tokens extend the existing ones.
- **Favorite** stays out of the composer (as today).
- **Analytics**: the composer's screen names and route patterns stay as they are (033), and the consent prompt still never shows on the editor (D281).
- **E2E tier**: smoke for the create journey (pick a type from the chooser, compose, save, see it), because that is a critical journey and its selectors change. Full for the rest (type switch confirm, preview toggle, keyboard-only, widths, sheets). Existing editor e2e specs are updated from radio and tab selectors to the new roles. The plan states the tier.

## Out of scope

- New card types, fields, limits or validation rules.
- A theme toggle, custom themes or brand redesign beyond the composer.
- Redesigning the deck list, card page, Browse or the review queue (only shared field styles carry over).
- Native haptics, swipe-to-dismiss gestures or a gesture library.
- Templates, multi-card composing or scheduled publishing.
