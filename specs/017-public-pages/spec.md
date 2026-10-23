# Feature Specification: Server-rendered public pages

**Feature Branch**: `017-public-pages`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Phase 8, part 2: a public deck gets real web pages (deck, category and card) rendered on the server, readable without JavaScript, with rich link previews in chat apps and search engines. Members who open the same link land in the app with their full view. Completes PLAN.md Phase 8 demos 2 (paste a card link into WhatsApp; the preview shows title, snippet and image; `curl` shows the full HTML without JavaScript) and 3 (a member and a stranger open the same link and see different category counts)."

Roadmap: `PLAN.md` § Phase 8 (demos 2, 3). Builds on [`016-public-read-api`](../016-public-read-api/spec.md) (deck rule, public card, anonymous limit) and the share previews (D58–D61: OG image pipeline, excerpts, language detection).

[`018-public-search`](../018-public-search/spec.md) adds a search box to these pages.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A stranger reads public pages without the app (Priority: P1)

A resident follows a link to the neighbourhood deck. The page loads fast on an old phone, with no app install and no JavaScript. It shows the deck name, its public categories with counts, and the newest cards. They tap a category and then a card. Every page is a normal web page they can bookmark and share.

**Why this priority**: most visitors of a community deck will never install the app. Plain pages are the cheapest way to reach them and the only way search engines can read the deck.

**Independent Test**: `curl` the deck, category and card pages of a public deck. Each returns complete HTML with the content, and no page needs a script.

**Acceptance Scenarios**:

1. **Given** a public deck, **When** anyone opens its public address, **Then** they see the deck name, public categories with card counts and the newest public cards, with a link to more.
2. **Given** a public category, **When** they open it, **Then** they see its cards newest first, paginated with "older" links.
3. **Given** a public card, **When** they open its page, **Then** they see its title and full content rendered for its type: formatted text, a link with its preview, an image, a table, or a calculator with its default result. They also see its public categories and when it was last verified.
4. **Given** a card written in Hebrew or Arabic, **When** its page renders, **Then** the page language and direction match the content.
5. **Given** a page for a deck, category or card that isn't public, **When** anyone opens it, **Then** they get a plain "not found" page.
6. **Given** a card page whose deck slug changed, **When** someone opens the old address, **Then** they are sent to the current one.

---

### User Story 2 - Links preview well in chat apps (Priority: P1)

A volunteer pastes a card's public link into a WhatsApp group. The preview shows the card's title, a short snippet and an image. Deck and category links preview with the deck's name and the category names.

**Why this priority**: PLAN.md demo 2. Community decks spread through chat groups; a good preview is what gets the link opened.

**Independent Test**: fetch a card page as a link-preview crawler would. It has title, description, image and canonical address tags, and the image loads.

**Acceptance Scenarios**:

1. **Given** a card page, **When** a crawler reads it, **Then** it finds the card title, a snippet of at most 160 characters, an image (the card's own image, or a generated one) and the page's canonical address.
2. **Given** a share link (`/s/<id>`) to a card that is public, **When** someone opens it, **Then** they are sent to the card's public page. Share links to non-public cards keep today's private preview.

---

### User Story 3 - Members land in the app (Priority: P1)

A member and a stranger tap the same public link. The stranger sees the public page with public categories only. The member is taken to the same deck, category or card in the app, where they also see the categories only members see, so the counts differ.

**Why this priority**: PLAN.md demo 3. One link must work for both audiences, so admins can post a single link to the community.

**Independent Test**: open a public category link signed in as a member: the app opens on that category. Open it signed out: the public page.

**Acceptance Scenarios**:

1. **Given** a signed-in member of the deck, **When** they open a public deck, category or card page, **Then** they are taken to the matching app page.
2. **Given** a member who wants to check what strangers see, **When** they open the page with the "view as public" option, **Then** they see the public page.
3. **Given** a signed-in person who isn't a member, **When** they open the page, **Then** they see the public page.
4. **Given** a stranger, **When** they choose "open in app", **Then** they are taken to sign in and then to the same place.

---

### User Story 4 - Search engines index community decks only (Priority: P2)

A communal deck's pages appear in search results, and a sitemap lists them. A public shared (family) deck can be read by link but asks search engines not to index it.

**Why this priority**: discoverability matters for a community; a family's public deck should stay off search results by default.

**Independent Test**: the sitemap lists the communal deck's public pages and not the shared deck's; the shared deck's pages carry "noindex".

**Acceptance Scenarios**:

1. **Given** a public communal deck, **When** a crawler reads its pages, **Then** they are indexable and listed in the sitemap with their last change date.
2. **Given** a public shared deck, **When** a crawler reads its pages, **Then** they ask not to be indexed and are not in the sitemap.
3. **Given** the site's robots file, **When** a crawler reads it, **Then** app, API and share paths are disallowed and the sitemap is announced.

### Edge Cases

- A card edited or published: its page shows the change at once when served from this instance's cache, and within five minutes for browsers that cached it.
- A card made non-public: the page answers "not found" on its next uncached fetch.
- A card page reached with a deck slug that doesn't match the card's deck: redirect to the right deck if that deck is public, otherwise "not found".
- Long cards (600 characters) and wide tables render without breaking the layout on a narrow screen.
- Markdown with raw HTML or `javascript:` links is shown as text, never executed.
- Calculator cards show their default inputs and result; changing inputs needs the app.
- Images on public pages use the same Cloudinary URLs as the app; no private URL appears.
- A visitor over the anonymous limit gets a plain "try later" page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST serve server-rendered HTML pages for a public deck, each public category and each public card, using exactly the 016 public rules.
- **FR-002**: Pages MUST be complete and readable without JavaScript, and MUST NOT load any script.
- **FR-003**: Card content MUST render per card type, and any markup in card text MUST be escaped or sanitised.
- **FR-004**: Pages MUST carry title, description, image and canonical-address tags for link previews.
- **FR-005**: Pages MUST set language and direction from their content.
- **FR-006**: A signed-in member of the deck MUST be redirected to the matching app page, unless they ask for the public view.
- **FR-007**: Pages of public communal decks MUST be indexable and listed in a sitemap; pages of public shared decks MUST ask not to be indexed.
- **FR-008**: Public pages MUST be cacheable, and a change to a deck's public content MUST be visible within five minutes.
- **FR-009**: Share links to public cards MUST lead to the card's public page.
- **FR-010**: Card page addresses MUST stay valid when the deck's slug changes.

### Key Entities

- **Public page**: the HTML view of a public deck, category or card, the same for all strangers.
- **Canonical address**: the one public address of a page, used in previews, the sitemap and redirects.
- **Sitemap entry**: a public page of a communal deck with its last change date.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A card's public link pasted into WhatsApp shows its title, snippet and image (PLAN.md Phase 8 demo 2).
- **SC-002**: `curl` of a card page returns its full content with no script tag (demo 2).
- **SC-003**: A member and a stranger opening the same category link see different category counts (demo 3).
- **SC-004**: A cached public page answers in under 50 ms on the server; an uncached one in under 300 ms.
- **SC-005**: A public page weighs under 30 KB of HTML and CSS, with no JavaScript.

## Assumptions

- Pages live on the app's origin under `/p/`. Phase 12 serves the same pages on a deck's custom domain.
- One API instance, so an in-process page cache stays consistent. Phase 11 revisits caching with the CDN.
- The page chrome ("Categories", "Older", "Open in app") is English; the content sets the page language and direction. Interface translation is out of scope.
- No comments, reactions or analytics on public pages.
