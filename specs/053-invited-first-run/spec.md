# Feature Specification: First run for invited people

**Feature Branch**: `053-invited-first-run`

**Created**: 2026-11-25

**Status**: Draft

**Input**: User description: "H8a from community-go-list.md — First run for invited users (first slice of H8 / PLAN.md Phase 16 item 4). Accepting a deck invite (by address, by username, or by link from 052) lands the person on that deck with a short welcome naming the deck and the inviter and pointing at categories and search; nothing else to decide on day one. Needed for stage 3 (alpha)."

Roadmap: the first communal deck launch, stage 3 (alpha), "getting in": [`community-go-list.md`](../../community-go-list.md) H8a, the first slice of H8 (onboarding, [`PLAN.md`](../../PLAN.md) Phase 16 item 4). Builds on [`052-invite-by-link`](../052-invite-by-link/spec.md) (joining by link), [`051-member-email-privacy`](../051-member-email-privacy/spec.md) (the shown name) and [`046-user-profile`](../046-user-profile/spec.md) (profile names, avatars). The rest of H8 (learning about the personal deck and your own decks), H13 (finish your profile) and E2b (Hebrew chrome) come later and are not part of this feature.

## Background

Alpha testers arrive through an invite: a mailed invite to their address or username, or a link sent in a chat (052). Each path already ends on the deck they were invited to, at the deck's card list. Nothing on arrival says where they are, who brought them there or where to start. Someone who has never seen Gobbit lands on a list of cards with no context.

What already exists and stays as is:

- **Every way of accepting lands on the deck.** Opening a mailed invite signs the person in and opens the deck. Tapping Join on a link invite, or opening the sign-in mail after choosing Join, opens the deck too. A member gets access to a deck only once their invite is accepted.
- **The invite and acceptance are already recorded** (052's accountability events and the membership's acceptance time).
- **The "How to browse" sheet** (009) is shown once per device on the Browse view and explains the swipe moves there.
- **The analytics consent wall** (D281) is shown on a member's first visit until they answer it. It is the one question a new person must answer, and it stays.
- **People are named by their shown name** (051): profile name, else username, else "Member". No email address appears.
- **The personal deck is never shared**, so nobody is ever invited to one.

## Clarifications

### Session 2026-11-25

- Q: Once someone has dismissed the welcome (categories, search, start reading/close or Escape) on one device, should it also stay gone on their other devices? → A: Yes. Once per person per membership on every device; the server remembers the dismissal on the membership.
- Q: What should the welcome's categories button open? → A: Browse with its category list sheet open (each category with its card count); the "How to browse" sheet shows only after a category is picked and the list has closed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An invited person is welcomed on the deck (Priority: P1)

Dana accepts an invite to the community deck: she taps Join on the link a curator sent her in WhatsApp (or opens the invite mail). The deck opens, and on top of it a short welcome says she is in the community deck and that the curator invited her. In one line it says what she can do here as a reader: read and search. It offers two ways to start, the deck's categories and search, and a way to just start reading. Dana taps the categories, closes the welcome and reads. The next time she opens the deck, the welcome is gone.

**Why this priority**: this is the feature. Alpha testers are people we know, and the first thing they see decides whether they find the information or give up on an unexplained list.

**Independent Test**: a person accepts an invite to a deck with a few categories. On arrival the deck shows the welcome naming the deck, the inviter's shown name and the role, with the categories and search entry points. Each entry point opens what it names. Closing the welcome leaves the deck as it is today. Reopening the deck later shows no welcome.

**Acceptance Scenarios**:

1. **Given** a person who has just accepted a deck invite, by address, by username or by link, **When** the deck opens, **Then** a welcome shows the deck's name, the inviter's shown name and what the person's role lets them do, in one short line.
2. **Given** the welcome, **When** the person chooses categories, **Then** the welcome closes and Browse opens with its category list showing the deck's categories their role can see; picking one shows that category's cards.
3. **Given** the welcome, **When** the person chooses search, **Then** the welcome closes and the deck's search opens, ready to type.
4. **Given** the welcome, **When** the person closes it, **Then** the deck shows as it does today, and nothing else asks for a decision.
5. **Given** a person who has closed the welcome for a deck, **When** they open that deck again, on this or another device, **Then** the welcome does not show.
6. **Given** a person who joins a second deck later, **When** that deck opens after accepting, **Then** they get that deck's welcome, once, even though they are not new to Gobbit.

---

### User Story 2 - The welcome never gets in the way of existing members (Priority: P1)

Members who were on a deck before this feature ships, deck creators and people on their personal deck never see the welcome. A first open of the app is never a stack of overlays: the consent question, the welcome and the "How to browse" sheet appear one at a time.

**Why this priority**: a welcome shown to the wrong people, or stacked over the consent wall, is worse than no welcome. It must ship with the welcome itself.

**Independent Test**: a member who joined before release opens their deck and sees no welcome. The deck's creator opens a new deck and sees none. A brand-new invited person who has not answered the consent question sees the consent question first and the welcome after answering it, never both at once.

**Acceptance Scenarios**:

1. **Given** a member whose invite was accepted before this feature shipped, **When** they open the deck, **Then** no welcome shows.
2. **Given** a person who created a deck, or who belongs to the account that owns it, **When** they open it, **Then** no welcome shows.
3. **Given** the personal deck, **When** its owner opens it, **Then** no welcome shows.
4. **Given** a brand-new invited person who has not answered the analytics consent question, **When** the deck opens, **Then** the consent question shows first, and the welcome shows only after it is answered.
5. **Given** a person who has never seen the "How to browse" sheet, **When** they choose categories in the welcome, **Then** the "How to browse" sheet shows only after they pick a category and the category list has closed, never on top of the welcome or the list.

---

### Edge Cases

- **The inviter has no name or username**: the welcome names them as 051 does ("Member"), worded so it still reads naturally (for example "You were invited by a member").
- **The inviter's account is gone, or nobody is recorded as the inviter**: the welcome leaves the inviter out and still names the deck.
- **The inviter has left the deck or was removed since inviting**: the welcome still names them; it states who invited, not who is a member now.
- **Deck and inviter names in Hebrew or another right-to-left script** inside English text: each name shows in its own direction without reordering the sentence around it.
- **No category the person can see** (for example, an alpha deck not seeded yet, or only private categories): the categories entry point is left out; search and "start reading" remain.
- **Many categories**: the welcome does not list them all; the categories entry point opens Browse's own category list.
- **The person closes the app or loses connection before closing the welcome**: the welcome shows again the next time they open that deck, until they close it once.
- **Removed and invited again later**: a new acceptance is a new arrival, so the welcome shows again for that deck.
- **Offline**: the welcome uses only what the deck view already has. Closing it while offline is remembered and not lost when the connection comes back.
- **An invited person with a role above reader** (editor, maintainer, co-owner): the same welcome, with the one line about the role matching what that role can do. Nothing about publishing, reviewing or members is taught here.

## Requirements *(mandatory)*

### Functional Requirements

**When it shows**

- **FR-001**: A person MUST see a welcome on a deck the first time they open it after accepting an invite to it, whichever way they were invited (email address, username or link).
- **FR-002**: The welcome MUST show at most once per person per deck membership: once closed, it MUST NOT show again for that deck on any device.
- **FR-003**: The welcome MUST NOT show to members whose invite was accepted before this feature shipped, to people who own the deck through its owning account, or on the personal deck.
- **FR-004**: The welcome MUST NOT show at the same time as another first-run overlay. The analytics consent question comes first, then the welcome, then the "How to browse" sheet when the person reaches Browse; when they arrive through the welcome's categories button, the sheet waits until a category is picked and the category list has closed.

**What it shows**

- **FR-005**: The welcome MUST name the deck and the inviter by shown name (051), and MUST NOT show an email address, cards, members or counts.
- **FR-006**: The welcome MUST say in one short line what the person's role lets them do, using the same wording for roles that the deck settings use.
- **FR-007**: The welcome MUST offer an entry point to the deck's categories the person can see (opening Browse with its category list) and one to the deck's search, plus a way to close it and read. It MUST NOT ask the person to choose, set or answer anything.
- **FR-008**: When the person can see no category, the categories entry point MUST be left out.
- **FR-009**: Names in right-to-left scripts MUST display in their own direction inside the welcome text without reordering it.

**Behaviour**

- **FR-010**: The welcome MUST be reachable and closable by keyboard and screen reader, as the existing first-run sheet is.
- **FR-011**: Closing the welcome while offline MUST be kept and applied when the connection returns.
- **FR-012**: Everything else about inviting, accepting and landing on the deck MUST stay as today.

### Accountability

The service decides nothing new about a person here: who may join a deck, and when, is already decided and recorded by the invite and acceptance (052 and the existing invite flow). The welcome is shown to every person who accepted an invite, and closing it is the person's own action.

- Storing "welcome closed" on the membership is the person's own change and is recorded as the plan's Accountability table says (constitution VIII); records name people and decks by id only.
- No analytics events beyond the screen views the app already sends under the consent rules.

### Key Entities

- **Welcome**: a one-time message on a deck for a person who accepted an invite to it. It shows the deck name, the inviter's shown name, a line about the role, and entry points to categories and search.
- **Welcome closed**: the fact that a person has closed the welcome for a deck membership. It belongs to the membership, so it holds on every device and resets only with a new membership.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every person who accepts an invite after release, by any of the three ways, sees the welcome on their first arrival at the deck.
- **SC-002**: From the welcome, an invited person reaches the deck's category list or a search box in one tap, and a category's cards in two.
- **SC-003**: Zero members who joined before release, deck creators or personal-deck owners see the welcome.
- **SC-004**: A person sees the welcome for a given deck membership at most once after closing it, across all their devices.
- **SC-005**: The welcome never overlaps the consent question or the "How to browse" sheet.
- **SC-006**: In the alpha walkthrough (D7), testers opening the deck from an invite can say which deck they are in and who invited them without asking.

## Assumptions

- **Per acceptance, not per new account**: anyone who accepts an invite gets that deck's welcome, including people who already use Gobbit. Teaching that every user has a personal deck and can start decks of their own is H8, not this feature.
- **"Once" is per person per membership, across devices** (clarified 2026-11-25): a tester who accepts on a laptop and reads on a phone is not welcomed twice. The dismissal is remembered with the membership, not on the device, so a new membership starts without it. Dismissing means choosing categories, search or start reading/close, or pressing Escape; leaving the app with the welcome open does not count.
- **Members from before release never see it.** The alpha starts after this ships, so nobody who needs it is left out.
- **The consent wall stays the one forced question.** "Nothing else to decide on day one" means nothing this feature adds asks for a choice; the existing consent question (D281) still comes first.
- **The inviter is whoever sent the invite that was accepted**: the person who invited by address or username, or who created the link. When an invite was replaced by a later one, the later inviter is named.
- **The categories entry point opens Browse with its existing category list** (clarified 2026-11-25); no new category screen is built.
- **Copy is in English** for now, with names shown in their own direction. Hebrew labels come with E2b.
- **Out of scope**: the rest of H8 (personal deck and own decks), H13 (finish your profile), H7 (one registration flow), E2b (Hebrew chrome), H10 (custom host).
- **E2E tier**: smoke, for the plan to confirm. Accepting an invite is a stage 3 critical journey, and 052's smoke journey (join by link and land on the deck) now meets the welcome. Extending that journey to check the welcome and its close is cheaper than a new one.
