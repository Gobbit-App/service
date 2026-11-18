# Feature Specification: Import v2 — seed a communal deck from curated Markdown

**Feature Branch**: `049-import-v2`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "Import v2: seed a communal, Hebrew-first deck from curated Markdown files (one per category) through bulk import, so every card arrives as a proposal with its categories set and a curator reviews it. Card-per-section Markdown, per-card fields, several categories per card, Hebrew category names, strict category mode, a tunable import cap, dry-run lint, bulk discard by import label, and media from the command line."

Roadmap: the first communal deck launch, stage 3 (alpha), "usable information" — [`community-go-list.md`](../../community-go-list.md) Track A (A1–A6, A8–A11). Builds on [`021-bulk-import`](../021-bulk-import/spec.md) (parser shared by the app and the command line, direct proposals on the `import` channel, review filter per import label, bulk publish), [`020-item-events`](../020-item-events/spec.md) (activity log), [`038-rich-text-body`](../038-rich-text-body/spec.md) (card bodies are rich text) and [`045-media-cards`](../045-media-cards/spec.md) (media cards and cover images).

## Background

021 was built for turning a phone note into cards: one line or paragraph per card, formatting stripped. Seeding a communal deck is a different job. Curators write several hundred cards by hand, in Hebrew with English and Greek mixed in, one Markdown file per category, each card a question with a title and a multi-line answer, a source, sometimes a second category (a city or region) and sometimes an image. Today:

- A card with a title and a multi-line body cannot be written: every paragraph or list item becomes its own card, line breaks collapse, bold and links are stripped.
- Each card gets one category, and only text and link cards can be imported.
- A Hebrew category name has no usable address, so it cannot be created from the app, and a Hebrew suggested category fails when its card is published.
- A typo in a category name silently becomes a new-category suggestion.
- The import cap is a fixed 150 rows a day per person, so a 400-card seed takes three days.
- A bad import can only be undone one card at a time.
- The dry run lists cards, but does not point at the problems in the file.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One card per section, formatting kept (Priority: P1)

A curator writes `health.md`. It starts with `# בריאות` (Health). Under it, each card begins with a `## ` heading — "How do I register with a family doctor?" — followed by three paragraphs and a short list, with a bold phone number and a link to the office's page. They import the file. The review queue shows one proposal per `##` section, titled by the heading, with the body as written: paragraphs, line breaks, list, bold and link intact, filed under Health.

**Why this priority**: without it the seed content cannot be written as cards at all; every other story builds on it.

**Independent Test**: import a fixture with a three-paragraph Hebrew card under a `##` heading; one proposal arrives with the same title and body, in the heading's category.

**Acceptance Scenarios**:

1. **Given** a file with a `#` heading and `##` sections under it, **When** it is imported, **Then** each `##` section becomes one card: the heading is its title, everything up to the next heading is its body, and the `#` heading is its category.
2. **Given** a section body with paragraphs, single line breaks, lists, bold, italics and links, **When** the card is proposed and later read, **Then** it renders with that formatting, as a card written in the editor would.
3. **Given** a file with no `##` headings, **When** it is imported, **Then** it parses exactly as in 021 (each line, list item or paragraph is a card).
4. **Given** a `##` section whose title or body exceeds the card limits, **When** previewed, **Then** the row is marked invalid with the reason and the line it starts on.
5. **Given** a `##` section before any `#` heading, **When** previewed, **Then** it is a card with no category, reported as such.

---

### User Story 2 - Per-card fields and several categories (Priority: P1)

Directly under a card's `##` heading the curator can write a few `key: value` lines: `source: https://…` for the card's source link, `categories: athens, thessaloniki` for extra categories (names or addresses), `type: link` to make it a link card. The card under `# בריאות` with `categories: athens` arrives filed under both Health and Athens.

**Why this priority**: the seed deck uses cities as a second category, and every card names its source; both are needed before the first file is imported.

**Independent Test**: import a section with each supported key; the proposal carries the source, both categories and the type. A section with `colour: red` is a row error naming the key.

**Acceptance Scenarios**:

1. **Given** `source: <web address>` under a card heading, **When** imported, **Then** the card's source link is that address.
2. **Given** `categories: <names or addresses, comma separated>`, **When** imported, **Then** the card is filed under the heading's category and each listed one; repeated names count once.
3. **Given** `type: text` or `type: link`, **When** imported, **Then** the card has that type; a link card takes its link from `source`.
4. **Given** an unknown key, a supported key with an empty or malformed value, or a `type` that import does not support, **When** previewed, **Then** the row is an error naming the key and line, not silently dropped.
5. **Given** a `key: value`-looking line after the body has started, **When** parsed, **Then** it is body text, not a field.

---

### User Story 3 - Categories that match, in any script (Priority: P1)

Before importing, the deck's maintainer creates the agreed categories from the app, all with Hebrew names. Each is created and has a stable address. The curator imports with strict category mode on: a card filed under `בריאת` (a typo) is refused with the unmatched name listed, instead of becoming a suggestion for a new category. When strict mode is off, a Hebrew suggested category is created when its card is published, like a Latin one.

**Why this priority**: categories are the deck's structure and their addresses are public URLs; a Hebrew-first deck cannot be set up or seeded without this.

**Independent Test**: create `בריאות` from the app (succeeds); import a file with one matching and one misspelled category in strict mode (one proposal, one refusal naming the misspelling); publish a proposal with a Hebrew suggested category in non-strict mode (succeeds).

**Acceptance Scenarios**:

1. **Given** a category name in Hebrew (or another non-Latin script, or mixed), **When** a maintainer creates it in the app, **Then** it is created with a usable, stable address. [NEEDS CLARIFICATION: how a non-Latin name gets its address — transliterate automatically when the name yields none, or have the person (and import) supply the address explicitly?]
2. **Given** a proposal suggesting a new Hebrew category, **When** a publisher publishes it, **Then** the category is created with a usable address and the card is filed in it.
3. **Given** strict category mode, **When** a row names a category (heading or `categories:`) that matches no existing category by name or address, **Then** the row is refused and the result lists the unmatched names; no suggestion is created.
4. **Given** the command-line tool, **When** no mode is given, **Then** strict mode is on; the app's import screen keeps today's behaviour (unmatched names become suggestions) unless strict mode is chosen.

---

### User Story 4 - A dry run that finds the problems (Priority: P1)

Before importing, the curator runs the command-line dry run on each file. It prints, per file: cards per category, titles and bodies over the limit with their line, cards with no category, unmatched categories (strict mode), unknown keys, malformed web addresses and missing media files. They fix the file and run it again until it is clean.

**Why this priority**: several hundred hand-written cards will have mistakes; finding them in the file is far cheaper than finding them in review.

**Independent Test**: run the dry run on a fixture with one of each problem; every problem is reported with its line and nothing is imported.

**Acceptance Scenarios**:

1. **Given** a file, **When** the dry run runs, **Then** it reports the count of cards per category and every problem with its line, and imports nothing.
2. **Given** a clean file, **When** the dry run runs, **Then** it reports no problems and the counts match what a real import creates.
3. **Given** strict mode, **When** the dry run runs, **Then** unmatched categories are checked against the deck's real categories.

---

### User Story 5 - Import a whole seed without waiting days (Priority: P1)

A curator imports 400 cards across a dozen files in one evening. The import limit is high enough for a seeding session; when a limit is reached, the refusal says how many rows were not imported and when they can be, and the refusal is recorded.

**Why this priority**: the fixed 150-a-day cap turns a one-evening seed into three days.

**Independent Test**: with the limit configured for a seeding session, import 400 rows in one day; all are proposed. With the limit set low, the rows over it are refused, reported and recorded.

**Acceptance Scenarios**:

1. **Given** a seeding session, **When** an owner or maintainer imports 400 rows in one day, **Then** all are proposed. [NEEDS CLARIFICATION: how the limit is lifted — an operator-tunable daily limit for everyone, or deck owners and maintainers exempt from the daily limit (with a per-request limit kept)?]
2. **Given** the preview, **When** a file has more rows than the preview limit, **Then** the person is told to split the file; the preview limit rises with the import limit.
3. **Given** the limit is reached mid-import, **When** rows are refused, **Then** rows already proposed stay, the rest are reported as not imported, and the refusal is recorded as a decision.

---

### User Story 6 - Undo a bad import in one action (Priority: P2)

A curator imported `transport.md` against the wrong deck version. In the review queue, filtered to that import, they choose "Discard all from this import", confirm, and every remaining proposal from it is discarded. The activity log shows each discard.

**Why this priority**: a mistake today costs hundreds of taps; less frequent than the P1 flows, but it will happen during seeding.

**Independent Test**: import 10 rows, publish 2, discard the import; the 8 remaining proposals are discarded, the 2 published cards are untouched, and the log shows 8 discards.

**Acceptance Scenarios**:

1. **Given** the review queue filtered to one import label, **When** a publisher discards that import and confirms, **Then** every proposal still pending from that import is discarded, as a single discard would.
2. **Given** cards from that import that were already published or discarded, **When** the import is discarded, **Then** they are not affected.
3. **Given** a bulk discard, **When** it completes, **Then** it reports how many were discarded and the activity log has one discard entry per card, attributed to the person.
4. **Given** a person who is not a publisher on the deck, **When** they try, **Then** it is refused.

---

### User Story 7 - Images and media from the command line (Priority: P3)

The curator keeps images in `media/health/` next to the file. Under a card heading they write `cover: media/health/clinic.jpg`, or `type: media` with `image: media/health/form.pdf`. The command-line import uploads each file through the deck's existing signed upload, records it for the deck, and proposes the card with its cover or as a media card. The app's import screen shows such rows as "import this file from the command line".

**Why this priority**: the deck can launch with text and link cards and get media afterwards; this is the second pull request.

**Independent Test**: with a fake uploader, import a file with one cover and one media card; both proposals reference assets recorded for the deck; no real upload happens in tests.

**Acceptance Scenarios**:

1. **Given** `cover: <relative path>` or `image: <relative path>` with `type: media`, **When** the command-line import runs, **Then** the file is uploaded through the deck's signed upload, recorded as an asset of that deck, and the card references it.
2. **Given** a path that does not exist or a file type media cards do not accept, **When** the dry run or import runs, **Then** the row is an error naming the path and line, and nothing is uploaded for it.
3. **Given** a row with media fields in the app's import screen, **When** previewed, **Then** it is marked "import from the command line" and cannot be imported there.
4. **Given** an upload succeeded but the proposal was refused (duplicate, limit), **When** the import finishes, **Then** the uploaded file is left to the existing unreferenced-media sweep, not deleted by hand.

### Edge Cases

- **Change from 021**: a note that uses `##` as a group heading (for example `## Plumbers` over ten list items) imports today as ten cards in a "Plumbers" category; under this spec it becomes one card titled "Plumbers" with the list as its body. Such notes must use `#` for groups. The preview makes the result visible before anything is imported.
- `#` headings at deeper levels (`###` and below) inside a section are body text in card-per-section files; only `#` sets the category and `##` starts a card.
- A `#` heading with no `##` sections under it creates nothing.
- The same card title twice in one file is flagged as a possible duplicate in review, as repeats are today.
- Right-to-left and mixed Hebrew, English and Greek text keeps its characters and order; only formatting is interpreted.
- Raw HTML in a body never renders (rich-text rule); it shows as text.
- Fenced code blocks inside a body stay part of the body.
- A file mixing card-per-section parts with loose 021-style lines: once the file has a `##` heading, it is parsed card-per-section, and text outside any `##` section is reported as ignored with its line.
- Field lines must come before any body text; a field repeated in one card is an error.
- Strict mode and a category matched by its address in another script (a Latin address for a Hebrew name) count as a match.
- Bulk discard while another publisher is publishing from the same import: each card ends up either published or discarded, never both; the count reports what this action discarded.
- An import that calls for media from the app's screen never uploads anything from the browser.

## Requirements *(mandatory)*

### Functional Requirements

**Format**

- **FR-001**: A Markdown file containing at least one `##` heading MUST be parsed card-per-section: `#` sets the current category, each `##` starts a card titled by the heading, and the text up to the next `#` or `##` heading is the card body.
- **FR-002**: A card-per-section body MUST keep its rich-text formatting (paragraphs, single line breaks, lists, emphasis, links, quotes) as a card body written in the editor would, within the existing card limits.
- **FR-003**: A Markdown file with no `##` headings, and plain-text and CSV input, MUST parse exactly as in 021.
- **FR-004**: The parser MUST accept these per-card fields as `key: value` lines directly under a card heading, before the body: `source` (web address), `categories` (comma-separated names or addresses), `type` (`text`, `link`, `media`), `cover` and `image` (relative file paths). The shared parser recognises every key in the app and the command line alike; only the command-line tool acts on `cover` and `image` (FR-013, FR-014). Any other key, an empty or malformed value, or a repeated key MUST make the row an error naming the key and line.
- **FR-005**: A card MUST be able to carry several categories: its `#` category plus those in `categories`, without repeats. The preview, the dry run and the proposal MUST show all of them.
- **FR-006**: The app and the command-line tool MUST keep using one shared parser, so the same file gives the same rows in both.

**Categories**

- **FR-007**: A category whose name is in Hebrew, another non-Latin script or mixed scripts MUST be creatable wherever a category is created (the app's category settings and a suggested category at publish), each with a usable, stable address.
- **FR-008**: Import MUST offer a strict category mode in which a row naming any category that matches no existing category of the deck (by name or address) is refused and the unmatched names are reported; strict mode creates no category suggestions. It MUST be on by default in the command-line tool and off by default in the app's import screen.

**Limits and results**

- **FR-009**: The daily import limit MUST allow one person to import a seed of at least 400 rows in a day, and the preview limit MUST rise with it. If the limit becomes operator-configurable, the change MUST be noted in the changelog.
- **FR-010**: Every refusal of import rows (limit reached, strict-mode mismatch, invalid row on the server) MUST be recorded as a decision event with its reason, and the result MUST report imported, duplicate, refused and failed counts.

**Dry run**

- **FR-011**: The command-line dry run MUST report, per file: the card count per category, and each problem with its line: title or body over the limit, no category, unmatched category (strict mode, checked against the deck), unknown or malformed field, malformed web address, missing or unsupported media file. It MUST import and upload nothing.

**Bulk discard**

- **FR-012**: A publisher on the deck MUST be able to discard, in one confirmed action, every proposal still pending from one import label. Each card MUST be discarded exactly as a single discard does (activity log entry attributed to the person, uploads released) and the action MUST report the count. Published and already-discarded cards MUST NOT be affected.

**Media (command line)**

- **FR-013**: The command-line import MUST resolve `cover` and `image` paths relative to the imported file, upload each file through the deck's existing signed upload, record it as an asset of that deck, and propose the card with that cover or as a media card. Tests MUST NOT call the real media service.
- **FR-014**: The app's import screen MUST mark rows with media fields as "import from the command line" and MUST NOT import them.

**General**

- **FR-015**: Import MUST remain limited to deck owners and maintainers, produce proposals only (never published cards), and call no AI model.
- **FR-016**: The import format (headings, fields, strict mode, media) MUST be documented for authors, with the command-line usage in the README.

### Accountability

Decisions about a person's content this feature makes, each recorded (constitution VIII):

| Decision | Recorded as |
|---|---|
| Import rows refused for the daily limit | decision event with reason and refused count |
| Rows refused in strict mode (unmatched category) | decision event with reason and count; names only in the person's own result |
| Rows refused as invalid on the server | decision event with reason and count |
| Proposals discarded by bulk discard | one activity-log entry per card, same transaction, attributed to the actor |

### Key Entities

- **Import row**: now also carries several category names, a source link, a card type, a rich-text body, and (command line) a cover or media file path; still has a line number and validity.
- **Import**: a labelled batch (label = file name); the unit of review filtering and of bulk discard.
- **Category**: unchanged, except that its address can be derived for any script.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A curator imports a 400-card seed across a dozen files in one sitting, with every card arriving in its intended categories and no manual re-filing.
- **SC-002**: A three-paragraph Hebrew card with a list, bold and a link reads identically in review, in the reader and on the public page as in the source file.
- **SC-003**: A dry run on a file with one instance of each listed problem reports all of them with correct lines, and a clean dry run predicts the real import's counts exactly.
- **SC-004**: An import of 100 card-per-section rows completes in under 15 seconds (021 target kept).
- **SC-005**: Undoing an import of 100 proposals takes one action and one confirmation.
- **SC-006**: Every category in the agreed Hebrew taxonomy can be created from the app on the first try.
- **SC-007**: Zero AI model calls during any import, and zero real media uploads during tests.

## Assumptions

- **Dependency**: bulk publish continuing past a card that cannot be published (reporting it as skipped with its reason) ships first as a separate small fix; this spec relies on it for reviewing seeds.
- Seed files are written by hand by curators and live outside this repository; fixtures here use made-up content only.
- Card-per-section is triggered by the presence of a `##` heading; no switch is needed (the launch checklist chose this trigger; see the 021 change in Edge Cases).
- `cover` sets a cover image on any card; `image` names the file of a media card (`type: media`: an image, PDF, audio or video file). This reading of the checklist's "`image` or `cover`" is to be confirmed in clarify.
- The `#` heading names a category in the current file; files are expected to hold one category each, but several `#` headings in one file are allowed.
- In the app's import screen, strict mode is an option (off by default) rather than a separate screen.
- Only `text`, `link` and `media` cards (plus a cover on any of them) are importable; table, calc, reminder and event cards are out of scope.
- Re-importing a corrected file creates possible duplicates for review, not updates (update-in-place is out of scope).
- Import never calls a model: no extraction, no summarising.
- Bulk discard acts on all of the label's pending proposals at the time of the action, in one action whatever their number (an import is at most a few hundred rows).
- Media upload and recording reuse the editor's per-deck signed upload; the existing sweep removes uploads no card references.
