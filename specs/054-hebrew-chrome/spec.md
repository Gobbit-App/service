# Feature Specification: Hebrew chrome, part 1 — the way in

**Feature Branch**: `054-hebrew-chrome`

**Created**: 2026-11-27

**Status**: Draft

**Input**: User description: "E2b part 1 from community-go-list.md: Hebrew chrome on the surfaces new people meet first — a small translation layer, Hebrew labels and a lang="he" dir="rtl" frame on the public pages, invite page, sign-in, and the H8a first run (053). Closes G9 for those surfaces; the rest of the reader is part 2 (stage 5)."

Roadmap: the first communal deck launch, stage 4 (waitlist cohort), item 2: [`community-go-list.md`](../../community-go-list.md) E2b part 1, closing G9 for the way in. Builds on [`052-invite-by-link`](../052-invite-by-link/spec.md) (the invite page and Join), [`053-invited-first-run`](../053-invited-first-run/spec.md) (the welcome) and the landing copy shape from `030-landing-page` (D230: every string in one object, a translation is a second object of the same shape). E2a (content reads right to left, small fixes) is separate and comes first. E2b part 2 (the rest of the reader in Hebrew) is stage 5 and is not part of this feature.

## Background

The first communal deck is Hebrew-first: its cards, category names and probably its deck name are Hebrew. Everything around that content (G9, the "chrome") is English and left to right: buttons, headings, notices, dates, mails. A Hebrew speaker invited by a curator meets English at every step before reaching a Hebrew card: the WhatsApp link opens an English invite page, the sign-in screen and sign-in mail are English, the consent question and the welcome are English.

What already exists and stays as is:

- **Public deck pages set the page language and direction from the content.** A Hebrew deck's public pages already open right to left with a Hebrew language tag. Their labels ("Search", "Open in Gobbit", notices, dates) are English.
- **The landing page's copy is already in one place** (D230), shaped so a second language is a second copy of the same shape.
- **Role names come from one source** (`@gobbit/shared/authz` labels) used by deck settings, the invite page and 053's welcome.
- **Rich text, search and content direction** are content, not chrome. E2a fixes how content reads right to left; this feature does not touch content.
- **The product name is Gobbit** in every language.

## Clarifications

### Session 2026-11-28

- Q: How should a shared or communal deck get its language (English or Hebrew)? → A: An owner setting in deck settings, English by default; never guessed from the deck name.
- Q: Should the landing page, the waitlist form and the waitlist mails also be in Hebrew in part 1? → A: No. They stay English until users actually push for a change.
- Q: Should pages that belong to no deck (plain sign-in and its mail, generic "not found" and "too many requests") follow the browser's language or stay English? → A: Stay English; only deck-bound surfaces follow the deck's language.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An invited Hebrew speaker gets in without meeting English (Priority: P1)

Dana gets a link from a curator in WhatsApp. It opens the invite page for the community deck, whose language is Hebrew: the page reads right to left and says in Hebrew who invited her, to which deck and as what. She taps the Hebrew Join button. She has no account, so the sign-in screen asks for her address in Hebrew, and the sign-in mail that arrives is in Hebrew. She opens it, answers the consent question (in Hebrew), and the deck opens with the welcome in Hebrew. From there she reads Hebrew cards in the reader, whose buttons are still English until part 2.

**Why this priority**: this is the feature. Stage 4 lets in people we do not know personally; a Hebrew-first community deck behind an English door loses them before they reach the content.

**Independent Test**: an owner sets a deck's language to Hebrew and creates an invite link. A brand-new person opens it and follows it to the deck. Every screen and mail on the way (invite page, Join, sign-in screen, sign-in mail, consent question, welcome) shows Hebrew labels in a right-to-left frame, with no English label left except the product name and names people chose themselves.

**Acceptance Scenarios**:

1. **Given** a deck whose language is Hebrew and a waiting invite link to it, **When** anyone opens the link, **Then** the invite page shows its labels, the role and the Join action in Hebrew, right to left, tagged as Hebrew.
2. **Given** that invite page, **When** a person without an account chooses Join, **Then** the sign-in screen and the sign-in mail are in Hebrew.
3. **Given** a person invited by address or username to a Hebrew deck, **When** the invite mail arrives, **Then** it is in Hebrew, and the sign-in it leads to is in Hebrew.
4. **Given** a newly invited person arriving at a Hebrew deck who has not answered the consent question, **When** the question shows, **Then** it is in Hebrew with the same two equal choices.
5. **Given** that person after the consent question, **When** 053's welcome shows, **Then** it is in Hebrew, right to left, with the role line using the Hebrew role names.
6. **Given** a deck whose language is English, **When** anyone takes any of the paths above, **Then** every screen and mail is exactly as it is today.

---

### User Story 2 - A stranger reads a Hebrew deck's public pages in Hebrew (Priority: P2)

A deck with Hebrew as its language goes public (stage 5). A stranger opens one of its public pages from a search engine or a link. The deck, category and card pages read right to left with Hebrew labels: the search box, "open in Gobbit", the notices, the "not found" and "too many requests" pages, the consent banner, and event dates written the Hebrew way.

**Why this priority**: stage 4 decks are not public yet, so this matters from stage 5. It is cheap once the language layer exists, and the invite page already sits beside the public pages.

**Independent Test**: make a Hebrew deck public and open its deck, category and card pages and a missing page under it without signing in. Every label is Hebrew, each page is right to left and tagged Hebrew, and an event card shows its date in Hebrew.

**Acceptance Scenarios**:

1. **Given** a public deck whose language is Hebrew, **When** a stranger opens its deck, category or card page, **Then** every label on the page is Hebrew and the page is right to left and tagged Hebrew.
2. **Given** an event card on such a deck, **When** its public page shows the date and time, **Then** they are written the way Hebrew readers expect, in the event's time zone as today.
3. **Given** analytics is on, **When** the consent banner shows on such a page, **Then** it is in Hebrew with equal-weight choices.
4. **Given** a public deck whose language is English, **When** a stranger opens its pages, **Then** they are exactly as today.

---

### User Story 3 - An owner chooses the deck's language (Priority: P1)

The deck's owner opens the deck settings and sets the deck's language to Hebrew. From then on, the surfaces in this feature show that deck in Hebrew to everyone. Personal decks have no language setting.

**Why this priority**: without it nothing above can happen; it is a single setting, required by Stories 1 and 2.

**Independent Test**: an owner changes a shared or communal deck's language from English to Hebrew and back. Its invite page and public pages follow each change. A maintainer, editor or reader sees the setting but cannot change it.

**Acceptance Scenarios**:

1. **Given** an owner (or co-owner) of a shared or communal deck, **When** they set its language to Hebrew, **Then** the deck's invite page, invite mails, welcome and public pages are in Hebrew from then on.
2. **Given** a member who is not an owner, **When** they open deck settings, **Then** they cannot change the language.
3. **Given** any deck created before this feature or created without a choice, **Then** its language is English.

---

### Edge Cases

- **A string has no Hebrew yet**: it shows in English rather than as a blank or an internal key, and the check that guards the copy (see FR-012) reports it.
- **Latin names inside Hebrew text** (an inviter called "Alex", a deck called "Athens Help", the word "Gobbit"): each keeps its own direction without reordering the Hebrew sentence around it. Hebrew names inside English text are already covered by 053 FR-009.
- **Mixed frame after the welcome**: once the Hebrew welcome closes, the reader around it keeps its English labels and today's layout until part 2. This is expected, not a defect. The right-to-left frame applies only to the surfaces in this feature.
- **The deck's language changes after an invite was sent**: what opens next follows the current language; a mail already sent stays as it was.
- **A person invited to a Hebrew deck whose browser prefers English**: the deck's language wins on every deck-bound surface (the curator chose the deck's audience).
- **Role names**: Hebrew role names come from the same one source as the English ones. Deck settings keep English labels until part 2, but both read from that source, so the two never disagree in meaning.
- **Waitlist and landing**: the landing page, waitlist form and waitlist mails stay English (see Assumptions).
- **A Hebrew speaker signing in again with no deck in view** (the plain sign-in screen, for example on a new phone): the screen, its mail and the consent question are English, as today. The browser's language is never used.
- **Offline**: the Hebrew labels of the in-app surfaces in this feature are available offline like the rest of the app; no surface waits on the network for its words.
- **Personal deck**: never invited to and never public, so it has no language and nothing in this feature applies to it.

## Requirements *(mandatory)*

### Functional Requirements

**Languages and the frame**

- **FR-001**: The surfaces in this feature MUST be available in English (as today) and Hebrew. In Hebrew, each surface MUST be tagged as Hebrew and laid out right to left; in English, as today.
- **FR-002**: Every label, heading, button, notice, error message, accessible name and mail line on a surface in this feature MUST come from its language's copy. Names people chose (deck, category, card, person) and the product name MUST show as they are, each in its own direction.
- **FR-003**: Dates and times shown on surfaces in this feature MUST be written in the surface's language, in the time zone used today.

**Which language a surface uses**

- **FR-004**: A shared or communal deck MUST have a language, English or Hebrew, English when not chosen. Only its owners (co-owners included) MUST be able to change it, in deck settings. Personal decks MUST NOT have one.
- **FR-005**: Surfaces that belong to one deck MUST use that deck's language: its public pages (deck, category, card, and "not found" under its address), its invite page and Join screen, its invite mails, the sign-in screen and sign-in mail reached from its invite, the consent question shown on arrival at it, and 053's welcome on it.
- **FR-006**: Surfaces that belong to no deck (the plain sign-in screen, the sign-in mail asked for there, the consent question when no deck is in view, and the generic "not found" and "too many requests" pages) MUST stay English as today. The visitor's browser language MUST NOT choose the language of any surface.
- **FR-007**: A mail MUST be written in the language of the surface that caused it, decided when it is sent.

**Surfaces in this feature**

- **FR-008**: The surfaces are exactly: public deck pages (deck, category, card, their "not found" and "too many requests" answers and the consent banner on them); the invite page and Join screen; the invite mails (by address and by username) and the sign-in mail; the sign-in screen and its "check your mail" and error states; the in-app consent question; and 053's welcome. Every other screen and mail MUST stay as it is today.

**No regression**

- **FR-009**: For English decks, and on every surface with no deck, everything MUST look and read exactly as today.
- **FR-010**: Changing a deck's language MUST NOT change any card, category or other content, its search, its public page addresses or what anyone can see.
- **FR-011**: Public pages MUST keep their content-based language hints for search engines consistent with the chosen frame; a Hebrew deck's pages MUST NOT be tagged English.

**Copy quality**

- **FR-012**: Each surface's Hebrew copy MUST cover every string its English copy has; an automated check MUST fail when a Hebrew string is missing, so a missing translation is caught before release rather than shown in English.
- **FR-013**: Changing the language MUST NOT break the accessibility of a surface: the same labels for screen readers, the same keyboard order (mirrored where the layout mirrors), the same focus handling.

### Accountability

The service makes no new decision about a person, their content or their experience: the language follows the deck's setting, and nothing is accepted, refused or limited by it.

- Changing a deck's language is an owner's change to the deck and is recorded as the plan's Accountability table says (constitution VIII), by ids only.
- No new analytics events; screen views stay as they are, under the consent rules.

### Key Entities

- **Deck language**: a setting on a shared or communal deck, English or Hebrew, English by default; owners change it; it decides the language of the deck-bound surfaces in FR-005.
- **Copy**: for each surface, every visible and spoken string, once per language, with the same shape in every language.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A brand-new person invited to a Hebrew deck by link reaches the deck's welcome, through every screen and the mail on the way, without meeting an English label other than the product name and names people chose.
- **SC-002**: 100% of the strings on the surfaces in this feature have Hebrew copy at release, checked automatically.
- **SC-003**: Zero visible changes for English decks and for surfaces with no deck in this feature.
- **SC-004**: In the stage 4 walkthrough, a Hebrew-speaking tester describes the way in as reading naturally, with no line in the wrong direction or order.
- **SC-005**: An owner changes a deck's language in one setting, and the change shows on its invite page and public pages on the next load.

## Assumptions

- **Language rule** (clarified 2026-11-28): a deck-bound surface follows a deck language its owners choose in deck settings, English by default; a surface with no deck stays English. Rejected: inferring the deck's language from its name (a Latin-named Hebrew deck would read English, and a Hebrew-named family deck would flip without anyone choosing), following the browser's language on surfaces with no deck (it would serve only returning members, who meet an English reader anyway until part 2), and a per-person language choice (needed once the whole reader is translated; part 2).
- **Two languages only**: English and Hebrew. Greek, the community's third script, is content, not chrome, and is not requested. The copy shape lets a third language be added later without changing the surfaces.
- **The consent question and the mails are additions to the go-list's four surfaces**: a Hebrew journey with an English step in the middle fails the goal.
- **Landing page and waitlist stay English** (clarified 2026-11-28): the landing page, waitlist form and confirm page and the waitlist mails are not translated, in part 1 or part 2, until real demand from users calls for it. The landing copy is already shaped for a second language (D230), so that later change is small.
- **No per-person language and no switch** in this feature; part 2 decides how a member chooses the language of the whole reader.
- **The reader stays English and left to right** around the welcome until part 2, including deck settings, where the new language setting itself is labelled in English.
- **Hebrew copy is reviewed by a Hebrew speaker** (a curator) before release; the spec does not fix the wording.
- **Depends on 053** for the welcome: if 053 is not merged when this is implemented, the welcome's Hebrew copy waits for it and the rest ships.
- **E2a comes first**: content direction fixes (bodies, lists, tables, mixed-script lines) are E2a's, not this feature's.
- **Out of scope**: the rest of the reader and app (E2b part 2), the landing page and waitlist (see above), push and reminder notifications, the editor, deck settings labels, the PWA manifest and app name, the custom host (Track J), translating content.
- **E2E tier**: full, for the plan to confirm. The stage 4 journey (a Hebrew invite link through sign-in to the welcome) is worth one `@full` journey; smoke already covers joining by link, and Hebrew labels do not change whether a person can get in.
