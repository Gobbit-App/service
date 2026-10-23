# Feature Specification: Public read API for public decks

**Feature Branch**: `016-public-read-api`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Phase 8, part 1: a community deck can be opened to everyone. Its admins mark the deck public and choose which categories strangers may see; anyone can then read those categories' published cards without signing in, and nothing else leaks. Completes PLAN.md Phase 8 demo 1 (create the communal deck, mark three categories public; `GET /public/<community-slug>/items` works with no cookie and omits the non-public category)."

Roadmap: `PLAN.md` § Phase 8 (demo 1). Builds on Phase 2 (memberships, roles, category visibility: `visibleCategoriesWhere(null)` already means "public categories only") and the share previews' public mode (D58–D61).

[`017-public-pages`](../017-public-pages/spec.md) renders the same data as HTML pages, [`018-public-search`](../018-public-search/spec.md) adds search, and [`019-deck-admin`](../019-deck-admin/spec.md) adds the screens for the settings this feature exposes as API.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Strangers read a public deck's public categories (Priority: P1)

A neighbourhood runs a communal deck with useful numbers, school information and local services. Its admins mark the deck public and three of its categories public. A resident who has never signed in opens the deck's public address and reads every published card in those three categories. Cards in the deck's other categories, proposals, archived and deleted cards are not there, and nothing tells them those exist.

**Why this priority**: this is PLAN.md demo 1 and the base of the whole phase. The pages, search and sitemap in 017 and 018 all read through it.

**Independent Test**: with no cookie, list the items of a public deck with three public categories and one shared category. Only cards from the three public categories come back, and the shared category isn't named anywhere in the response.

**Acceptance Scenarios**:

1. **Given** a public deck with public and non-public categories, **When** an anonymous caller asks for the deck, **Then** they get its name, slug and public categories with card counts, and nothing about the other categories.
2. **Given** the same deck, **When** an anonymous caller lists its items, optionally filtered by a public category, **Then** they get published, live cards that sit in at least one public category, newest first and paginated.
3. **Given** a card in both a public and a shared category, **When** it is returned, **Then** only the public category is listed on it.
4. **Given** a card id, **When** an anonymous caller asks for it, **Then** they get the card if it would appear in the list, and "not found" otherwise (proposed, archived, deleted, only in non-public categories, or in another deck).
5. **Given** a deck that is not public, a personal deck, or an unknown slug, **When** anyone asks for it publicly, **Then** they get the same "not found" answer.
6. **Given** a signed-in member calls the public address, **When** the answer comes back, **Then** it is exactly what a stranger sees. Members use the normal deck API for their full view.

---

### User Story 2 - Admins choose what is public (Priority: P1)

A deck owner turns the deck's public switch on and sets three categories to "public". A maintainer can rename categories and change their visibility, but only an owner (including co-owners) can make the whole deck public or private again.

**Why this priority**: without it, demo 1 needs SQL. The deck switch already exists in the API; category visibility can only be set when a category is created.

**Independent Test**: as an owner, make a deck public and change an existing category from shared to public. The category's cards appear in the public list. As a maintainer, try to make the deck private: refused.

**Acceptance Scenarios**:

1. **Given** an owner of a shared or communal deck, **When** they make it public, **Then** its public categories become readable by anyone.
2. **Given** a maintainer, **When** they try to change the deck's public switch, **Then** they are refused. They can still rename the deck.
3. **Given** a personal deck, **When** anyone tries to make it public, **Then** it is refused as today.
4. **Given** a maintainer or owner, **When** they change a category's name or visibility (private, shared, public), **Then** the change applies at once to lists, search and the public view.
5. **Given** an editor or reader, **When** they try to change a category, **Then** they are refused.
6. **Given** a deck is made private again, **When** a stranger reloads, **Then** they get "not found".

---

### User Story 3 - Anonymous reading is rate limited (Priority: P2)

One address requesting thousands of public pages an hour is slowed down with a clear "try later" answer, while members using the app are not affected.

**Why this priority**: the public surface is the first part of the app reachable without an account. A basic limit protects the database now; Phase 11 adds burst limits and monitoring.

**Independent Test**: exceed the hourly anonymous read limit from one address. Further public reads get "too many requests" with a retry time, and a signed-in member's normal API calls from the same address still work.

**Acceptance Scenarios**:

1. **Given** an address under the hourly limit, **When** it reads public data, **Then** reads succeed.
2. **Given** an address over the limit, **When** it reads public data, **Then** it gets "too many requests" with a retry time.
3. **Given** a signed-in member at the same address, **When** they use the normal deck API, **Then** they are not limited by the anonymous counter.

### Edge Cases

- A public deck with no public categories: the deck answers with an empty category list and no items. It is not "not found", so admins can check the address before choosing categories.
- A card whose only public category is deleted or made shared: it disappears from the public view at once.
- The default category (`general`) can be made public like any other.
- A card's images: link snapshots and image cards are already public Cloudinary URLs. Nothing private is exposed by returning them.
- Author, favourites, link-check flags, entities' provenance and review data are never part of the public card.
- A slug that changed: the old slug answers "not found" (017 handles stable card links by id).
- A deleted deck: "not found".
- A stale or invalid session cookie on a public request is ignored, not rejected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST serve a public deck's summary, its public categories with counts, its cards list and single cards to callers without credentials.
- **FR-002**: A deck MUST be readable publicly only when it is marked public, is not a personal deck and is not deleted. Every other case MUST answer the same "not found".
- **FR-003**: Public results MUST contain only published, live cards in at least one live public category, and MUST list only those public categories on each card.
- **FR-004**: The public card MUST NOT include the author, favourites, link-check state, review or ingest data.
- **FR-005**: The public answer MUST be the same for signed-in and anonymous callers.
- **FR-006**: Only owners MUST be able to change a deck's public switch. Owners and maintainers MUST be able to rename a category and change its visibility.
- **FR-007**: Anonymous reads MUST be limited per client address per hour, with a "too many requests" answer and a retry time. Signed-in API use MUST NOT count toward that limit.
- **FR-008**: Public responses MUST be cacheable for a short time by browsers.

### Key Entities

- **Public deck**: a shared or communal deck marked public. What strangers see: name, slug, kind and its public categories.
- **Public card**: a published card's content (type, title, body, payload, entities, source link, dates) and its public categories, without member data.
- **Category visibility**: private (owners and maintainers), shared (all members), public (members and strangers when the deck is public).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With no cookie, `GET /public/<slug>/items` on a deck with three public categories returns only their cards and never names the fourth category (PLAN.md Phase 8 demo 1).
- **SC-002**: Every access rule above is covered by a test that runs on every pull request.
- **SC-003**: A public list of 50 cards answers in under 200 ms at current data sizes.
- **SC-004**: An address over the anonymous limit is refused within one request of crossing it, and members at that address are unaffected.

## Assumptions

- The deck kinds already exist. A deck becomes "communal" when it is created (`POST /decks` with `kind: communal`); 016 doesn't add kind changes.
- PLAN.md's Gate B (personal use proven before community work) is the owner's call and doesn't change this spec.
- Members still use `/decks/...` for their full view. The public view is never personalised.
- Phase 11 adds the per-minute burst limit and alerting. Phase 12's custom domains reuse this view for strangers on a deck's own host.
- Anonymous MCP access to public decks stays deferred (PLAN.md Phase 8 note).
