# Feature Specification: Search on public pages

**Feature Branch**: `018-public-search`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Phase 8, part 3: strangers can search a public deck from its public pages, with the same hybrid search members use, limited to public cards and protected against abuse and runaway AI cost. Completes PLAN.md Phase 8 demo 4 (search אמקה on the public page returns the AMKA card)."

Roadmap: `PLAN.md` § Phase 8 (demo 4). Builds on Phase 4 search (hybrid text + vector with rank fusion, D73–D81), [`016-public-read-api`](../016-public-read-api/spec.md) (public rules, anonymous limit) and [`017-public-pages`](../017-public-pages/spec.md) (pages).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A stranger searches a public deck (Priority: P1)

A resident on the neighbourhood deck's public page types a word, in Hebrew or English, into the search box. They get the matching public cards, best first, each linking to its card page. A query in Hebrew finds a card written with the Latin name of the same thing, the way members' search does.

**Why this priority**: PLAN.md demo 4. A community deck with hundreds of cards is only useful if strangers can find things.

**Independent Test**: on a public deck with an "AMKA" card in a public category, search אמקה on the public page. The AMKA card is among the first results.

**Acceptance Scenarios**:

1. **Given** a public deck, **When** a stranger searches from its public page, **Then** they see matching public cards, best first, with title, snippet and link, on a page that works without JavaScript.
2. **Given** a query that matches a card only in a non-public category, a proposal, or an archived card, **When** a stranger searches, **Then** that card is not in the results.
3. **Given** a query in one script for a card written in another, **When** meaning-based search is available, **Then** the card can be found by meaning.
4. **Given** meaning-based search is unavailable (no AI key, budget used up, provider down), **When** a stranger searches, **Then** they still get text matches and no error.
5. **Given** an empty query, **When** a stranger submits it, **Then** they see the deck page's search box with no results and no error.
6. **Given** a signed-in member, **When** they search on the public page, **Then** they are taken to the app's search for the same query.

---

### User Story 2 - Search works for scripts and apps (Priority: P2)

A developer building a community notice board fetches public search results as JSON, the same way the public card list works.

**Why this priority**: the pages use it, and it keeps public search on the same contract style as 016.

**Independent Test**: anonymous JSON search returns public cards with a reason for each match and whether meaning-based search ran.

**Acceptance Scenarios**:

1. **Given** a public deck, **When** a caller searches without credentials, **Then** they get public cards with match reasons, in the public card format.
2. **Given** a non-public deck, **When** a caller searches it, **Then** they get the same "not found" as the other public routes.

---

### User Story 3 - Public search can't run up costs or be abused (Priority: P1)

Meaning-based search costs a small amount per new query. Strangers' searches are capped per address and in total per hour; over the caps, search falls back to text matching instead of failing. Too many searches from one address are refused with a retry time.

**Why this priority**: the public surface is reachable by anyone; AI cost must have a hard ceiling that doesn't depend on member budgets.

**Independent Test**: exceed the per-address meaning-search cap: results keep coming, marked text-only. Exceed the search request cap: "too many requests".

**Acceptance Scenarios**:

1. **Given** an address under its hourly meaning-search cap and the global cap not reached, **When** it searches a new query, **Then** meaning-based search runs.
2. **Given** either cap reached, **When** it searches, **Then** results come from text matching only, and say so.
3. **Given** a repeated query, **When** anyone searches it again within the cache window, **Then** no new AI call is made and no cap is used.
4. **Given** an address over the hourly search request limit, **When** it searches, **Then** it gets "too many requests" with a retry time.
5. **Given** public searches, **When** the owner reviews search logs, **Then** they can tell public searches from member searches, and no visitor identity is stored.

### Edge Cases

- A query longer than the members' search limit is refused with a clear message, as for members.
- Search on a public deck with no public categories returns nothing.
- Search result pages are not indexed and are not in the sitemap.
- "Ask" (the cited answer) is not offered to strangers.
- A query containing markup is shown back escaped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Strangers MUST be able to search a public deck from its public pages and as JSON, without credentials.
- **FR-002**: Public search MUST return only cards that the public read rules allow, and MUST use the same ranking as members' search.
- **FR-003**: Meaning-based public search MUST be capped per address and in total per hour, and MUST fall back to text-only search when capped or unavailable.
- **FR-004**: Public search requests MUST be limited per address per hour, separately from public page reads.
- **FR-005**: Public searches MUST be logged as public, without user identity or address.
- **FR-006**: Public search MUST NOT offer the cited answer (Ask).
- **FR-007**: Search result pages MUST NOT be indexed.
- **FR-008**: Signed-in members MUST be redirected to the app's search.

### Key Entities

- **Public search**: a query on a public deck by an unidentified caller, answered from public cards only.
- **Anonymous meaning-search budget**: per-address and global hourly allowances for new query embeddings.
- **Query log entry**: query text (normalised), result count, top match reason, latency and mode `public`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Searching אמקה on the public page returns the AMKA card in the top five (PLAN.md Phase 8 demo 4).
- **SC-002**: No non-public card appears in public search results in any test.
- **SC-003**: Anonymous AI cost per hour is bounded by the global cap, whatever the traffic.
- **SC-004**: A public search answers in under 500 ms with meaning-based search and under 200 ms text-only.

## Assumptions

- The deployed instance has an embedding key; without one, demo 4 can't pass by meaning and the plan's fallback applies (see plan Risks).
- The search eval fixture gets an AMKA pair so the demo is checked on every search-eval run.
- No query suggestions, spelling correction or result highlighting beyond today's snippets.
