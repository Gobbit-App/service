# Community go-list

Everything needed to launch the first communal deck: a public, Hebrew-first knowledge deck for a community living abroad, seeded from a curated Markdown file (plus media) through bulk import and reviewed card by card.

Status: draft, Nov 15. Read against `origin/main` at `dd8fe4f`; roles and registration re-read Nov 16 at `0fbc4a5`; Track I target decided Nov 16; monitoring (Track K) and early wins (Track L) added Nov 16; launch order by importance, alpha first, decided Nov 16 (see Order). This is a checklist that feeds `PLAN.md` and `/speckit-specify`; it takes no D numbers and decides nothing durable. Items marked **(verify)** were not confirmed in code.

## Tracking

This file is the launch tracker. Keep it current as work lands:

- **Starts**: when an item is specified or picked up, add `→ <spec or PR>` to the track's intro line or the item.
- **Done**: tick `[x]` an item only when its PR is merged and its Verify step has passed, and add the PR, e.g. `- [x] **A1. …** (049, #170)`.
- **Deviations**: when the built thing differs from the item (a different choice, a dropped part, a moved item), add a row to the log below and link the spec's `implementation-notes.md`. Edit the item text only to point at the row; keep the original wording.
- **Additions**: work the list did not foresee (a new gap, a new item, a finding that makes an item stale) gets a log row and, if it is work, a new item in the matching track with the next free number.

### Progress log

| Date | Item | Kind | What | Where |
|---|---|---|---|---|
| 2026-11-18 | A1–A6, A8–A11 | start | Track A specified as one feature, `049-import-v2`; A7 stays a separate small fix ahead of it. A5 and A8 open for `/speckit-clarify`. | [`specs/049-import-v2`](specs/049-import-v2/spec.md), #169 |
| 2026-11-18 | A1 | deviation | A note that uses `##` as a group heading now imports as one card, not one card per list item (the `##` trigger changes 021 behaviour); such notes use `#` for groups. | `049` spec, Edge Cases |
| 2026-11-18 | A2 | deviation | Reading to confirm in clarify: `cover` sets a cover on any card, `image` names the file of a media card (`type: media`). The parser recognises both everywhere; only the CLI acts on them. | `049` spec, FR-004, Assumptions |
| 2026-11-18 | H6 | addition | Stale: `046-user-profile` has merged (usernames, exact-match member lookup), so "an amendment to 046" no longer applies. Re-read H6 against main; likely its own small spec. | Stage 3 item 5 |
| 2026-11-19 | A7 | done | Bulk publish reports a card it cannot publish as skipped and continues; regression in `review.int.test.ts`. | #174 |
| 2026-11-19 | A5, A8 | decision | Planned for 049: a non-Latin category name gets an automatic `c-` + hash address, a typed address wins (D445); the import limit is an operator-tunable daily limit, default 500, no role exemption (D447). | [`049` research](specs/049-import-v2/research.md) |
| 2026-11-19 | H11 | start | Specified as `050-model-spend-guard`; best effort per share kind settled in the spec (FR-005). | [`specs/050-model-spend-guard`](specs/050-model-spend-guard/spec.md) |
| 2026-11-19 | H11 | deviation | Verify reads "no extraction call", not "no `llm_calls` row": the duplicate-check embedding is saved as the card's own embedding, which stays open under H11. | `050` spec, Assumptions |
| 2026-11-20 | H11 | plan | Planned for 050: `users.smart_share` column, a gate in the ingest handler, best effort through the existing `validateProposal`; D452–D458; the deploy needs the curators switched on by hand (Action required). | [`specs/050-model-spend-guard/plan.md`](specs/050-model-spend-guard/plan.md) |
| 2026-11-19 | H11 | deviation | Platform admins count as switched on in code instead of a migration setting it: the admin list is deployment config a migration cannot read. | `050` spec, FR-003 |
| 2026-11-20 | H11 | deviation | Implementing 050: a share that builds no best-effort card fails `best_effort_empty` (retryable `unknown`); the "saved as you sent it" line shows only when a card exists; Docker was unavailable, so the int and e2e tests are written but unrun and the T022 screenshots are outstanding. | [`specs/050-model-spend-guard/implementation-notes.md`](specs/050-model-spend-guard/implementation-notes.md) |
| 2026-11-21 | H6 | start | Specified as `051-member-email-privacy`. Settled in the spec: the typed address shows to the inviter only, while the invite is pending; lookup limits and events stay as 046 made them (D424); same-name members differ by avatar colour, username, role and date. Members with no name show as "Member". | [`specs/051-member-email-privacy`](specs/051-member-email-privacy/spec.md), #183 |
| 2026-11-21 | H6 | deviation | A new feature, not an amendment to `046`: 046 merged first, and merged specs are not edited (`specs/README.md`). Avatar initials no longer come from the address either (they did under D420). | `051` spec, Assumptions |
| 2026-11-21 | H6 | addition | The H6 note "Spec `046` as drafted has no username…" is stale: 046 shipped usernames and hid addresses for members who have one. Also added in 051: the username comes before "Member" as a shown name, and owners see who sent each pending invite. | `051` spec, Assumptions |
| 2026-11-21 | H6 | decision | Clarified: nothing goes on top of "Member" in 051. A gamified "finish your profile" call to action (multi-step, with a percentage: names and location, username, first card, shared deck, …) will nudge people to set a name; new item H13, `PLAN.md` Phase 16 item 6. | `051` spec, Clarifications |
| 2026-11-22 | H6 | plan | Planned: one name chain (profile name, else username, else "Member") changed at its two builders; initials from the same name; a flag on the membership records a typed-address invite, whose address shows only to the current inviter while pending; such a pending row shows no profile to anyone, so typing an address does not hand over its owner's profile; owners see "invited by". One migration, no env var, E2E tier full (D459–D465, ADR-084). | [`051` plan](specs/051-member-email-privacy/plan.md), #183 |
| 2026-11-21 | A4 | start | 049 PR 3 of 049, number pending: media from the CLI (`pnpm import:notes` uploads images and sends a media row or a cover). | [`specs/049-import-v2`](specs/049-import-v2/spec.md) |
| 2026-11-21 | A4 | deviation | A cover is allowed on text cards only: a link card cannot carry a cover. | [`049` implementation notes](specs/049-import-v2/implementation-notes.md) |
| 2026-11-21 | A4 | deviation | A failed upload skips only that row; the rest of the import continues. | [`049` implementation notes](specs/049-import-v2/implementation-notes.md) |
| 2026-11-22 | A1–A6, A8–A11 | done | 049 merged in four PRs: card-per-section and fields (#178, #179), strict categories and Hebrew-safe slugs (#179), dry run, daily cap and bulk discard (#182), media from the CLI and close-out (#184). All 78 tasks ticked; int suite green on main CI. The `@full` journey `import-sections` ran only locally (PR not labelled `e2e:full`). | [`specs/049-import-v2`](specs/049-import-v2/spec.md), [`049` implementation notes](specs/049-import-v2/implementation-notes.md) |
| 2026-11-22 | H11 | done | 050 merged; Verify integration test `ingest-spend-guard.int.test.ts` passes in main CI. Open in `tasks.md`: T022 screenshots, T019/T027 `@full` shares spec never run (PR not labelled `e2e:full`), T032 quickstart run, T033 converge and ponytail review. T002, T006, T011, T015 and T024 ticked 2026-11-23: their suites pass in main CI. Deploy needs curators switched on by hand (CHANGELOG, Action required). | #177, [`050` implementation notes](specs/050-model-spend-guard/implementation-notes.md) |
| 2026-11-23 | H6, G17 | deviation | Built per plan with three small deviations: `displayNameOf` unchanged (only the SQL builder changes; its callers already receive the SQL name); item `creator` name stays null for a nameless member (the avatar shows "Member"); no web change in `MembersSection`. Not ticked yet: tick H6 and G17 when the PR merges and Verify passes. `users.display_name` is now unread; dropping it is an open follow-up. | [`051` implementation notes](specs/051-member-email-privacy/implementation-notes.md), ADR-084 |
| 2026-11-23 | H6, G17 | done | 051 merged; Verify integration test `member-email-privacy.int.test.ts` and the `@full` `member-privacy.spec.ts` pass in PR CI. Correction to the row above: `MembersSection` did change (secondary line shows `@username · Invited by …`, T034). Pending invites sent before deploy lose their address for the inviter (CHANGELOG, no action required). Open follow-ups: drop `users.display_name`; H13 "Finish your profile". | #187, [`051` implementation notes](specs/051-member-email-privacy/implementation-notes.md) |
| 2026-11-23 | H12 | start | Specified as `052-invite-by-link`, its own feature (not folded into H7, which is stage 4). Added in the spec: a link registers at most one person, and none once it has stopped working; a waiting link stops working when its inviter is no longer an owner; joining through a link closes any earlier pending invite for that person. Open for `/speckit-clarify`: may a link grant the owner role (FR-002); a brand-new person still gets one sign-in mail until L4 (FR-012). | [`specs/052-invite-by-link`](specs/052-invite-by-link/spec.md) |

## Goal and definition of done

- A communal deck is live at `/p/<slug>`, indexable, with public categories.
- The seed content (several hundred cards, Hebrew with English and Greek mixed in) went in through import, each card with its category already set, and was reviewed and published by a person.
- A stranger on a phone can find a card by searching in Hebrew, English or Greek spelling.
- Wrong or stale cards have a way back to the curators.
- Backups, abuse limits and privacy basics are in place before the link is shared.
- Nothing the public deck depends on to serve runs in the home lab: compute, database, backups and analytics are on external services, and the app answers on a product domain (Track I). Deploys may still go through the home-lab Dokploy.
- The deck is served white-labelled on its own domain (Track J).
- Each launch stage (curators, invited readers, waitlist cohort, anonymous readers) has a defined way in (Track H).
- Every limit, slowdown and failure shows on one dashboard with an alert, before the soft launch (Track K).

## Working method

1. Collect raw material: community chat exports, online information, our own notes.
2. Turn it into one Markdown file per category, plus a `media/` folder, following the authoring template (Track C).
3. Import each file. Every card arrives as a proposal with its category assigned.
4. Review each import as one filtered queue; confirm, fix or discard; bulk publish the clean ones.
5. Switch the deck to public.

## What exists today

| Area | State |
|---|---|
| Communal kind | `POST /decks` accepts `kind: 'communal'`; communal public decks are indexable and in the sitemap. The web app only creates `shared` decks. Kind cannot be changed after creation (`deckPatchSchema` has no `kind`). |
| Public surface | Public read API, server-rendered pages, permalinks, public search, deck admin and activity log are built (016–020). Phase 8 demos 1–6 are still unchecked in production. |
| Import | Web screen and `pnpm import:notes` share one parser (`@gobbit/shared/import`): `lines`, `markdown`, `csv`. Rows become direct proposals on channel `import`. |
| Category on import | A Markdown heading or the CSV `category` column. A name or slug that matches an existing category is assigned; an unknown one is stored as a suggestion. |
| Review | Queue filter per import label (`?source=`), inline edit of title, body, link and categories, bulk publish of up to 50. |
| Dedup | Each row is compared with published and proposed cards of the deck, so repeats inside one file are flagged too. |
| Search | Normalisation strips Hebrew points and folds Greek accents and final sigma; trigram plus embeddings. |
| Rendering | Card text uses `dir="auto"`; public pages pick `lang` and `dir` from the text. |
| Media | Media cards (image, PDF, audio, video) and card cover images exist (044, 045). |

## Gaps found

| # | Gap | Evidence |
|---|---|---|
| G1 | Markdown import flattens cards: each paragraph or list item is its own card, line breaks collapse, bold and links are stripped, any heading level is a category. A card with a title and a multi-line body cannot be written in Markdown. | `packages/shared/src/import/parse-markdown.ts`, `note-row.ts` |
| G2 | Import makes text and link cards only. Images are skipped; no media card, no cover image. | `importCardTypes`; 021 spec lists image import as out of scope |
| G3 | One category per row. | `ImportRow.category` |
| G4 | Hebrew names give an empty slug (`toSlug('בריאות')` is `''`; a mixed name keeps only its Latin part). The web app sends only the name, so a Hebrew category cannot be created there (400). A Hebrew suggested category fails at publish. | `apps/api/src/lib/slug.ts`, `apps/web/src/api/create-category.ts`, `review.service.ts` `ensureNewCategory` |
| G5 | Suggested categories are created `shared`, never `public`. | `ensureNewCategory` |
| G6 | Bulk publish stops on the first non-409 error (a card with no category gives 422, a Hebrew suggested category 400); the rest of the selection is not attempted. | `review.service.ts` `publishMany` |
| G7 | Import cap is 150 rows per user per rolling day, hardcoded; the preview also stops at 150. | `INGEST_CHANNEL_DAILY_CAPS`, `IMPORT_ROWS_PER_PREVIEW` |
| G8 | No bulk discard, so undoing a bad import is one card at a time. | 021 spec, "can follow later" |
| G9 | App and public page chrome are English and left-to-right (`<html lang="en">`, "Search", "Open in Gobbit", `en-GB` dates). No translation layer. | `apps/web/index.html`, `apps/api/src/public/pages.ts`, `event-time/format.ts` |
| G10 | No way for readers to report a wrong card (Phase 14 is a stub). | `PLAN.md` Phase 14 |
| G11 | `verifiedAt` is set on publish but shown only as "Published" in card details; nothing flags stale cards (Phase 10.1 not built). | `CardSource.tsx` |
| G12 | Community members cannot suggest cards without an invite; registration is waitlist-gated. | `REGISTRATION_MODE` |
| G13 | Categories are flat; there is no second axis such as city or region. | data model |
| G14 | Re-importing a corrected file creates flagged duplicates, not updates. | `imports.service.ts` (no explicit target) |
| G15 | Withdrawn Nov 16. The implicit-owner rule covers only users of the owning account, and every registration creates its own account (`createWithAccount` is the only place a user is made), so invited family members are in their own accounts and get nothing on a new deck. The rule matters only if a second user is ever added to an account, which no code does today. | `users.repo.ts`, `resolveRole` |
| G16 | No way to only suggest. A reader cannot create or share a card (`item.create` is editor and up). An editor's card from the composer is published at once, and an editor can edit and archive any card. Only shares and imports arrive as proposals. **To build (H5).** | `PERMISSION_MATRIX`, `items.service.create` (status defaults to `published`) |
| G17 | Every role can list the deck's members with their email addresses; role changes and invites return the address too. **To fix for every deck kind and every role, owners included (H6).** | `member.list`, `memberSchema`, `membershipSchema` |
| G18 | Invites and registration are tangled. A deck invite creates the account at invite time, before the person has done anything; a waitlist invite creates an account with no deck. There is one flow per door and no shared registration step, no cohort size and no batch invite. **To build (H7).** | `memberships.service.invite`, `waitlist-admin.service`, `users.service.register` reasons |
| G19 | Not a gap (decided Nov 16): registering always makes a full user with a personal deck, whoever invited them and whether or not a deck came with the invite. What is missing is onboarding that says so (H8). | `users.service.register` |
| G20 | `robots.txt` has one `User-agent: *` group, so communal public pages are open to every crawler, AI ones included. Accepted for now (decided Nov 16); revisit with real traffic. | `apps/api/src/public/seo.ts` |
| G21 | Model spend has per-person limits only, and every registered user owns a personal deck where they can run model extraction (50 shares a day per channel, 200 combined), so spend grows with the number of users. Search embeddings (300 an hour per member; anonymous 30 an hour per IP, 300 in total) are accepted as they are; Ask is off (`ASK_ENABLED`). **To fix: extraction off by default (H11).** | `ask.service.ts`, `query-budget.ts`, `ingest/caps.ts`, `@gobbit/shared` limits |

## Track A — Import v2 (blocks seeding)

One spec-kit feature → [`049-import-v2`](specs/049-import-v2/spec.md) (#169; A1–A6, A8–A11). Split into small PRs per stream. E2E tier: smoke for the import journey (it exists for 021; extend it), full for the edge cases.

- [x] **A1. Card-per-section Markdown.** (049, #178, #179) `# Heading` sets the category; `## Heading` starts a card and is its title; everything up to the next heading is the body, kept as rich text (line breaks, bold, lists, links). The 021 behaviour stays for files without `##` headings. Verify: a fixture with a three-paragraph Hebrew card imports as one card with the same body.
- [x] **A2. Per-card fields.** (049, #179) A small set of `key: value` lines directly under the card heading: `source` (URL), `categories` (extra names or slugs), `image` or `cover` (relative path), `type` (text, link, media). Unknown keys are a row error, not silently dropped. Verify: parser unit tests per key.
- [x] **A3. Several categories per card.** (049, #179) `categoryIds` already takes a list on the wire; the parser and preview carry more than one. Verify: a card under `# Health` with `categories: athens` gets both.
- [x] **A4. Media from the CLI.** (049, #184) `pnpm import:notes` resolves relative paths, uploads through the existing signed upload, records the asset and sends a media row or a cover. The web screen reports media rows as "use the CLI". Tests never call Cloudinary. Verify: integration test with a fake uploader; one real run in rehearsal.
- [x] **A5. Hebrew-safe category slugs.** (049, #179) Either transliterate when the slug comes out empty or let the caller pass a slug wherever a category is created (API already accepts `slug`; the web app and `ensureNewCategory` do not). Pick one in `/speckit-clarify`. Verify: creating `בריאות` from the web app and from a suggested category both succeed.
- [x] **A6. Strict category mode.** (049, #179) An import flag that refuses rows whose category does not match an existing one, so a typo never becomes a new category. Default on for the CLI. Verify: dry run lists the unmatched names.
- [x] **A7. Bulk publish keeps going.** (#174) A card that cannot be published is reported as skipped with its reason; the rest continue. Verify: integration test with one category-less proposal in a batch of three.
- [x] **A8. Import cap.** (049, #182) Make the `import` cap env-tunable, or lift it for deck owners; raise the preview limit with it. Add a `CHANGELOG.md` entry if an env var is added. Record the refusal as a decision event (constitution VIII). Verify: unit test on the cap table.
- [x] **A9. Bulk discard by import label.** (049, #182) Undo of a bad import in one action. Verify: integration test; activity log shows the discards.
- [x] **A10. Dry-run lint output.** (049, #182, #184) `--dry-run` prints, per file: card count per category, over-long titles and bodies with their line, missing categories, missing media files, bad URLs. Verify: snapshot test on a broken fixture.
- [x] **A11. Docs.** (049, #182, #184) `docs/design/ingestion.md` gets the format and a "Deviations" list; `README.md` the CLI usage; `docs/architecture.md` at most one line.

Left out on purpose: table, calc, reminder and event cards on import (events have their own rules, D377); update-in-place on re-import (G14); an LLM step inside import. The file is a one-time seed and the deck is the source of truth afterwards.

## Track B — Deck setup

- [ ] **B1. Create the deck** from the account chosen in H2 as `communal` with an explicit Latin slug and `isPublic: false`. Today this is one API call; a kind choice in the web app is optional and small.
- [ ] **B2. Taxonomy.** Agree 10–15 categories before any import: Hebrew display name, Latin slug, visibility. Slugs are public URLs (`/p/<deck>/c/<category>`), so choose them once.
- [ ] **B3. Location axis.** Decide how city or region is expressed. Recommended: location categories used as a second category on a card (needs A3); no new data model.
- [ ] **B4. Roles.** Per H3: one co-owner, curators as maintainers. Keep `autoPublishShares` off.
- [ ] **B5. Embeddings key in production.** Cross-script search depends on it; confirm `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`) is set and the worker is embedding.

## Track C — Content preparation (parallel to Track A)

- [ ] **C1. Authoring template.** One card answers one question. Title within 120 characters, body within 2000. Each card names its source and an "information as of" month. Include the term in every script people will search (for example the Hebrew, Latin and Greek spelling of an office or document).
- [ ] **C2. Personal data.** Remove names, private phone numbers and opinions about private people before anything enters the file. Business and office contacts stay. The deck is public and indexed.
- [ ] **C3. Rights.** Link to online sources and summarise in our own words; do not copy articles or images we do not own. Media files in `media/` are ours or cleared.
- [ ] **C4. Raw-to-template pass.** Converting chat exports into the template happens on our machines, outside the app, and the output is edited by hand. No chat ingestion is built for this launch (Phase 10.3 covers the similar case later).
- [ ] **C5. File layout.** One Markdown file per category, named after its slug; the file name becomes the import label and the review filter. Media under `media/<category>/`. The files live outside this public repo.
- [ ] **C6. Sensitive topics.** Decide which categories stay members-only (`shared`) rather than `public`, for example anything about security or community-internal matters.

## Track D — Seeding run

- [ ] **D1. Rehearsal.** A throwaway deck, about 20 cards covering every template feature including one media card and one cover. Fix the template or the importer, then delete the deck.
- [ ] **D2. Lint.** `--dry-run` on every file until clean (A10).
- [ ] **D3. Import** one file at a time; check the result line (imported, duplicates, failed).
- [ ] **D4. Review** per label. Resolve flagged duplicates first, then bulk publish what is clean, then edit the rest.
- [ ] **D5. Spot check search** with 20 real questions in the three scripts; add missing spellings to cards rather than tuning search.
- [ ] **D6. Check the public pages** on a phone: deck page, a category, a card, a share preview pasted into a chat.
- [ ] **D7. Alpha walkthrough.** With the seeded deck, on an iPhone and an Android phone: open the app from an invite, browse every category, open cards, search in the three scripts, go back, share a card. Note every place that is slow, confusing or reads wrong (direction, alignment, mixed Hebrew and English). Fix each as a small fix (E2a) or file it against the matching spec, then walk again. This is how "navigation is fluent" is checked.

## Track E — Before the link is shared

- [ ] **E1. Phase 8 demos 1–6 against production** (`PLAN.md` Phase 8). The public pages are the product for strangers.
- [ ] **E2a. Right to left reads right** (G9; small fixes, no spec). Hebrew titles, bodies (lists, quotes, tables, links), category names, the search box and results align right to left in the reader, the editor and the public pages, and mixed Hebrew, English and Greek lines keep their order. Found and checked in D7.
- [ ] **E2b. Hebrew chrome** (G9; spec: a small translation layer). Hebrew labels and a `lang="he" dir="rtl"` frame, first on the surfaces new people meet (public pages, invite page, sign-in, H8a first run), then the rest of the reader. Takes in Track F's "member app in Hebrew".
- [ ] **E3a. Feedback link** (G10; small fix). A "report a problem" link on every card and in the app menu that opens a prefilled mail or chat to the curators with the card link. Enough for alpha and the cohort.
- [ ] **E3b. Report a problem** (G10, Phase 14.2; spec). Reports stored and routed to curators, never public; anonymous reports behind the rate limiter.
- [ ] **E4. "Last verified"** (G11; small fix). `verifiedAt` shown on cards and public pages, so readers can judge how fresh a phone number or price is.
- [ ] **E5. Backups that restore** (Phase 11.1; delivered by I5). Hundreds of hand-reviewed cards.
- [ ] **E6. Abuse controls on public routes** (Phase 11.3). Run the demo against the `anon-rate-limiter` and the Cloudflare rule; a failure becomes a small fix.
- [ ] **E7a. Privacy notice and requests by contact** (Phase 11.4; no spec). A privacy notice linked from the landing page, sign-in, the app menu and public pages, naming a contact for export, correction and deletion; requests handled by hand within the legal deadline, with a runbook in `infra/README.md`. Enough for alpha and the cohort.
- [ ] **E7b. Self-serve export and delete** (Phase 11.4 demo; spec). Before the deck goes public.
- [ ] **E8. Monitoring thresholds on decision events** (Phase 11.2; delivered by Track K).
- [ ] **E9. Take-down path** (process). A named contact and a same-day way to unpublish a card; archive already unpublishes, and with L1 a Cloudflare purge clears the cached page.

Items marked "spec" go through `/speckit-specify`; the rest are small fixes, configuration or process.

## Track F — Soon after launch

- **Suggest a card** without an invite (G12; members suggesting is H5): a public form that creates a proposal, behind the anonymous rate limiter, or a low-friction contributor role. Needs Phase 11.3 first.
- **Staleness watcher** (Phase 10.1) and **gap detection** from failed searches (Phase 10.4).
- **Member app in Hebrew**: moved into E2b.
- **Like and useful** (Phase 14.1). Threads (14.3) and MCP (Phase 13) can wait.

## Track H — People and access

How people get into the communal deck at each stage, what the code does today and what is missing. Nothing here is built by this file; H5–H8 become spec-kit features.

### The model today

- **Account and users.** Every registration creates its own account with one user and, on first sign-in, a personal deck at `/d/me`. A deck belongs to the account of the user who created it; everyone else, family included, has only the role their invite gave them.
- **Membership roles** on a deck, by invite to an email address (the invite registers the address even while registration is closed):

| Role | Can | Cannot |
|---|---|---|
| owner (co-owner by membership) | everything below, invite and remove members, change roles | delete the deck (owner account only) |
| maintainer | publish and review proposals, create and edit categories, see private categories, delete cards, deck settings, activity log | manage members |
| editor | create cards (published at once), edit and archive any card, create categories, share and import as proposals | publish proposals, see private categories |
| reader | read `shared` and `public` categories, search, favourite | create, share or suggest anything |
| anonymous | read `public` categories of a public deck on `/p/<slug>`, public search | everything else; no Ask |

- **Category visibility** decides the audience: `public` (anyone, once the deck is public), `shared` (members), `private` (owners and maintainers).
- **Platform admin** (`PLATFORM_ADMINS`, by email) is separate from deck roles: it works the waitlist and, later, custom domains.
- **Proposals** are visible only to publishers and to the person who made them, which already suits a suggest-only member.

### Stages

| Stage | What happens | Works today? |
|---|---|---|
| 0. New stack | Restore the full home-lab dump (I9): family account, users, personal and family decks come across unchanged. | yes |
| 1. Communal deck | Created by your own user or by a dedicated community user (a separate account, so the deck is not tied to a personal mailbox). Either way nobody else gets a role without an invite. | yes (H2) |
| 2. Curators | One or two people as `maintainer` (curate and publish) or `owner` (also manage members). | yes (H3) |
| 3. Alpha | Invited `reader`s we know personally, who test and give feedback; deck not public. | reading yes; member emails exposed (H6); invites by mail only (H12) |
| 4. Waitlist cohort | Announce; the first X confirmed entries are let in with the deck attached to their invite. | by hand only (H4); needs H7 |
| 5. Public | `isPublic` on, categories `public`; anonymous reading, indexed. Any interaction needs a registered user, who is a full Gobbit user. | reading yes; registering from the public pages goes through the normal door (H7); interactions are Phase 14 |

### Steps

- [ ] **H1. Decide the open points below** before B1.
- [ ] **H2. Owning user.** Either your own user or a dedicated community user with a mailbox more than one person can recover. A dedicated one keeps the community deck apart from your personal decks and survives a change of hands; it is a choice, not a safety need (G15 withdrawn). If dedicated: the platform admin invites it from the waitlist screen, it signs in and creates the deck, and your own user gets an `owner` membership. Verify: `GET /decks/<slug>/members` lists exactly the people invited.
- [ ] **H3. Curators.** `maintainer` for people who review and publish; `owner` only for whoever also manages members. Avoid `editor` on this deck: it publishes without review.
- [ ] **H4. Soft launch and cohort, with no new code.** Invite readers from deck settings one address at a time (by WhatsApp once H12 exists). For the waitlist cohort, read confirmed `community` entries in `/admin/waitlist` and send each a deck invite instead of a waitlist invite; the cap is counted by hand and the entries stay `confirmed`. Good for tens of people, not hundreds.
- [ ] **H5. Suggesting on communal decks** (closes G16; to implement, spec-kit). A deck setting, communal decks only, off by default, switched by owners only. When on, readers can suggest: the share and paste paths and a short "suggest a card" form, always `proposed`, never published by the suggester, own proposals visible to them, daily caps, a decision event per accepted and refused suggestion. Model use on a suggestion follows H11. Roles are unchanged; shared and personal decks never have the setting. After the launch basics (see Order).
- [x] **H6. No email addresses in member data** → [`051-member-email-privacy`](specs/051-member-email-privacy/spec.md) (closes G17; 051, #187). No API answer about a deck's members carries an email address, for any deck kind and any role, owners included: member list, role change, invite answer, reminder and event audience pickers. People appear by profile name and avatar (spec `046`, user profile). Needed before stage 3.
  - Inviting: by email address or by username (usernames arrive with spec `046`). A username lookup answers with the profile name and avatar, never the address.
  - One exception: an invite made by typing an email address keeps showing that address in the invites list, because the inviter already knows it. Nowhere else.
  - An invite made by username never shows the address to anyone on the deck, then or later.
  - To settle in the spec: whether the typed address in the invites list shows to the inviter only (assumed here) or to every owner; a display name derived from the email address gives away its first part, so the fallback name needs another source; limits and decision events on username lookups so they cannot be used to list users; how an owner tells two people with the same name apart.
  - Spec `046` as drafted has no username and says emails stay visible where they are today; both need changing there.
- [ ] **H7. One registration flow, invites ride along** (closes G18; to implement, spec-kit). Anyone can be invited to a deck by email. A registered user gets the membership as today. An unregistered one goes through the same registration as someone arriving from the welcome page, and the invite travels with it: on completion the membership is created and the app opens on that deck. A waitlist invite can carry a deck and role the same way, in batches with a cohort size. No account exists until the person completes registration. Every invite, acceptance, expiry and refusal is a decision event. To settle in the spec: whether a deck invite skips waitlist approval (today it does, and the plan assumes it still does). Needed before stage 4 at any real size.
- [ ] **H8a. First run for invited users** (spec, small; first slice of H8). Accepting an invite lands on that deck with a short welcome naming the deck and the inviter and pointing at categories and search; nothing else to decide on day one. Needed for stage 3.
- [ ] **H8. Onboarding** (stub in `PLAN.md` Phase 16). Someone who first met Gobbit through a communal or shared deck learns that they are a full user: they have a personal deck, can save their own cards and can start decks of their own. Lands them on the inviting deck first. Needed for stage 4.
- [ ] **H9. Crawler policy** (G20). Deferred: all crawlers allowed for now; revisit with real traffic.
- [ ] **H10. Custom host and members.** On the deck's own domain (Track J) a session acts on that deck only, so community members never see `/d/me` there. That works against H8 (every user is a full user): the onboarding spec and the Track J spec must say how someone on the custom host reaches their personal deck on the main domain.
- [x] **H11. Model spend guard** (050, #177) → [`050-model-spend-guard`](specs/050-model-spend-guard/spec.md) (closes G21; to implement, spec-kit; rule in `PLAN.md` Phase 16). Rule: anonymous visitors and readers cannot run up model spend. Applies to every feature that calls a model in the background, present and future. Decided Nov 16, per surface:
  - Search and its query embeddings, anonymous and member: fine as they are. No change.
  - Ask: off (`ASK_ENABLED`) until it is ready for general availability. No work here.
  - Model extraction on ingestion (shares, paste, email-in, the iPhone Shortcut): off by default for every user. It is switched on per user in the database, by hand, with no screen for it. The switch belongs to the person, so it holds on every deck they can add to. Without it nothing reaches the model: the share is still saved as a proposal on a best-effort basis (the link or text as given, with whatever the page itself states), the person sees a notice that smart share is coming soon, and the skipped extraction is a decision event. Likely a paid or tightly limited free feature later; a table of features per plan is deliberately not built yet.
  - Bulk import calls no model and stays open.
  - Item embeddings for cards a user writes, personal decks included: open to all for now; revisit with the features-per-plan question.
  - Suggesting (H5): a reader's suggestion never reaches the model unless that reader has the switch.
  - With the switch on, today's daily caps stay (50 per channel, 200 combined). The migration switches it on for the platform admins only; everyone else is switched on by hand.
  - To settle in the spec: what best effort contains for each kind of share without the model (link, text, image, email).
  - Verify: an integration test shares as a user without the switch and sees a proposal, no `llm_calls` row, the notice and the decision event; the same share with the switch on is extracted. Needed before stage 3.
- [ ] **H12. Invite by link** → [`052-invite-by-link`](specs/052-invite-by-link/spec.md) (to implement, spec-kit; fold into H7 if it is specified at the same time). An owner can send a deck invite through WhatsApp or any chat instead of by mail. That is more personal, and it saves an invite mail per person (see Track K, mail headroom).
  - **Today's invite link must not be copied.** The mailed link is a single-use magic link bound to the invitee's address (`/auth/callback?token=…`, D37, `memberships.service.ts` `sendInvite`). Whoever opens it first is signed in *as that person*, and chats get forwarded and seen by groups. So "copy invite" needs a new kind of link, not a copy button on the old one.
  - **The new link only invites; it never signs in.** The owner creates an invite with a name for their own reference ("Dana") and a role, with no address needed. They get a link to an invite page in the app. Whoever opens it signs in or registers through the normal door (H7; with L4, Google or password, so no mail at all), then accepts, and the membership is created.
  - **Personal, so single use:** the first person to accept claims it. It expires (`INVITE_TTL_DAYS`) and the owner can revoke it. In the invites list it shows as "link for Dana: waiting / accepted by <profile name>", so the owner sees who actually came in and can remove them if the wrong person did.
  - **Sharing:** a "Share invite" action through the existing `ui/ShareButton` (the phone's share sheet, so WhatsApp is one tap; copy as the fallback), with a short prefilled message the owner can edit in the chat. The invite page has its own link preview (deck name, inviter's profile name), so it looks right when pasted. It never shows cards, members or anything private.
  - **Registration gate:** an invite link lets an unregistered person register while registration is waitlist-only, as a deck invite does today (same open decision as H7). Registration reason `deck_invite`.
  - **Accountability:** created, shared (client event), accepted, expired, revoked, and refused (used up, expired, already a member) are decision events with the invite id. Owner-side limits on how many open links a deck can have (env-tunable) stop the feature becoming an open door.
  - **Not now:** a reusable "anyone with this link can join" deck link, like a WhatsApp group link. On a communal deck it would be forwarded beyond the community at once; public reading (stage 5) already serves that audience. Revisit with suggesting (H5) if communities ask for it.
  - E2E tier: smoke: an owner creates a link invite, a second user opens it, accepts and lands on the deck; a second use of the same link is refused.
  - Wanted for stage 3 (soft launch invites go out by WhatsApp), needed for stage 4.

- [ ] **H13. Finish your profile** (stub, `PLAN.md` Phase 16 item 6; spec-kit later). A gamified multi-step call to action with a completion percentage: add names and location, pick a username, create a first card, start a shared deck, and more. It gives members with no name (shown as "Member" since H6) a reason to set one. After launch, alongside H8.

Order within the track: H1 → H2, H3 (with Track B) → H6, H11, H12, H8a → stage 3 → H7, H8 → stage 4 → stage 5 → H5.

## Track I — Infrastructure out of the home lab

Its own phase. It must finish before the deck is public: public URLs get indexed and shared, installs and push subscriptions are tied to the origin, so the product domain has to be final first. It also delivers Phase 11.1 (backups that restore) and 11.6 (migration escape hatch).

### What runs where today

| Piece | Today | Home lab? |
|---|---|---|
| `api`, `worker`, `web` (Caddy) containers | Dokploy Compose on the home server (`infra/docker-compose.yml`) | yes |
| Postgres (pgvector, pg_trgm, pg-boss schema) | shared Dokploy-managed instance (ADR-039) | yes |
| Backups | nightly dump to the S3 store on the NAS; restore not yet rehearsed | yes |
| Analytics | shared Umami in another Dokploy project, proxied at `/stats/*` | yes |
| Ingress | Cloudflare → tunnel → `cloudflared` → Traefik | tunnel end and Traefik |
| Deploy | CI calls the Dokploy webhook (ADR-073) | yes |
| Hostname | a subdomain of the home-lab domain | yes |
| Images, CI | GHCR, GitHub Actions | no |
| Images in cards, mail, uptime pings, models | Cloudinary, Resend, Healthchecks.io, OpenRouter | no |

### Constraints the target must respect

- `api` and `worker` are long-running Node processes.
- The database is never idle: pg-boss polls every few seconds, `reminder-sweep` and `embed-sweep` run every minute, and the API (60 s) and worker (30 s) heartbeats run `select 1`. A database that suspends when idle does not fit, and changing these is not worth it (reminders would arrive late, alerting would change). The database is always on.
- The API keeps state in memory (anonymous rate limiter, public page cache), so it runs as one instance.
- Everything is one origin; Caddy owns the routing, including the cookie-based choice between landing page and app at `/` (ADR-063).
- CI builds images without a multi-platform setting, so an `arm64` host needs a build change.
- Sessions, installed PWAs, offline drafts and push subscriptions belong to the origin; magic links, share links, public pages, the mail sender and email-in all carry the hostname.

### Target (decided Nov 16)

- **Serving:** one small EU VM runs the Compose project: `api`, `worker`, `web`, Postgres (pgvector image, named volume) and `cloudflared`. The tunnel ends on the VM, so the VM opens no web ports.
- **Deploying:** the home-lab Dokploy deploys to the VM as a [remote server](https://docs.dokploy.com/docs/core/remote-servers) over SSH; it installs only Traefik there. CI keeps calling the Dokploy webhook and `infra/docker-compose.yml` stays the source (ADR-073). Not a Docker Swarm node: Swarm across the internet needs a VPN and stretches the overlay network over the home line.
- **If Dokploy gets in the way** (remote server quirks, or the home-lab dependency), drop it: the CI `deploy` job SSHes to the VM and runs `docker compose pull && docker compose up -d` with the env file kept on the VM. Then nothing runs in the home lab at all.
- **What still depends on the home lab:** deploys and the Dokploy copy of the env vars, not serving. If the home lab is down, a deploy fails loudly and nothing goes down. Fallback: SSH to the VM and `docker compose pull && docker compose up -d`, with a copy of the env file kept outside Dokploy.
- **Backups:** nightly `pg_dump` to Cloudflare R2, with a pull copy on the NAS.
- **Analytics:** Umami Cloud, still proxied same-origin at `/stats/*`.

### Cost and where to grow

Prices as read Nov 16 from third-party comparisons; 2026 price rises make them disagree. Confirm on the provider's page before ordering.

| Option | About a month | Notes |
|---|---|---|
| Hetzner Cloud CAX11 (2 vCPU arm64, 4 GB) or CX23 (x86) | €4.50–6.50 + €0.50 IPv4 | Hourly billing, rescale in place, snapshots, API. Recommended start. |
| Netcup VPS (2 vCPU, 4 GB) | about €4 | Slightly cheaper; check the minimum contract term **(verify)**. |
| Contabo (8 GB) | about €5 | Most memory per euro; CPU performance varies. |
| DigitalOcean managed Postgres, 1 GB | about $15 | The cheapest managed database that never sleeps, if running Postgres stops being worth it. |
| Neon Launch, always on, 0.25 CU | about $19–23 | Managed, with branches and point-in-time restore. |

Start on one Hetzner VM with Postgres on it, about €5–7 a month in total. Grow in this order, each step invisible to users:

1. Rescale the VM (more CPU and memory, same disk and address).
2. Move Postgres to a managed service or its own VM: dump and restore, change `DATABASE_URL`.
3. Change provider: bring the stack up on the new VM from the latest dump, point the tunnel at it, retire the old VM.

Users never see the VM: the hostname, TLS and the tunnel stay at Cloudflare, so sessions (in the database), installed PWAs and push subscriptions survive every one of these moves. Only the short write freeze during a dump and restore is visible. Running a second API instance would need the in-memory state moved first (see Constraints).

### Cloudflare, free plan

| Use | Feature | Note |
|---|---|---|
| Ingress, TLS, DNS, DDoS | Tunnel, Universal SSL | Already in use; the tunnel is what makes a provider change invisible. |
| Backups | R2, 10 GB, no egress fee | Nightly dumps. |
| Old-hostname 301s | Redirect Rules | Serve the I9 redirects from Cloudflare, so they need nothing in the home lab. |
| Static assets | CDN cache | Hashed JS, CSS and images are cached by default. Public HTML pages too, through one cache rule that skips requests with `gobbit_session` (L1). |
| Abuse controls (Phase 11.3) | One rate limiting rule (10 s period), WAF custom and managed rules, Turnstile | A first line in front of the in-process `anon-rate-limiter`, not a replacement. Turnstile fits the waitlist form and a later public "suggest a card" form. |
| Not Bot Fight Mode | | On the free plan it cannot be skipped per path, so it would challenge the iPhone Shortcut, `pnpm import:notes` and the Resend inbound webhook. |
| Custom domain (Track J) | Cloudflare for SaaS, 100 custom hostnames free | Enough for this deck and many after it. |
| SSH to the VM | Hetzner firewall | Key-only SSH, limited to the home address if it is static. Cloudflare Access for SSH (free up to 50 users) is possible but needs `cloudflared` on the Dokploy side too; not now. |

Not used: Cloudflare Web Analytics (no custom events, does not follow our consent model), Email Routing (Resend inbound already does email-in), Workers and Hyperdrive (no Worker in this design).

### Steps

- [ ] **I1. Record the target** above as the next ADR, superseding the relevant parts of ADR-038, ADR-039 and ADR-073. Verify: ADR merged with the provider and prices checked on the provider's page.
- [ ] **I2. Product domain.** Register it, put the zone on Cloudflare, decide the app hostname. Verify: DNS resolves; nothing points at it yet.
- [ ] **I3. Sizing.** Read database size, memory per container and connection count in production, to pick the VM size and pool sizes. Verify: numbers written in `infra/README.md`.
- [ ] **I4. VM and remote server.** Create the VM and its firewall; add it to Dokploy as a remote server; add Postgres and `cloudflared` to the Compose project with a staging hostname. If the host is `arm64`, add it to the CI image build. Check that `dokploy-network` exists on the remote server **(verify)**; if the remote server does not work out, switch to the SSH deploy job instead. Verify: e2e smoke green against staging.
- [ ] **I5. Backups.** Nightly `pg_dump` to R2 with retention, either through Dokploy's scheduled database backups (if they run on a remote server, **(verify)**) or a cron container; a Healthchecks ping on each run; a pull copy on the NAS. Rehearse the restore on a scratch VM and write the date in `infra/README.md`. Verify: Phase 11.1 and 11.6 demos (this rehearsal is also the escape hatch).
- [ ] **I6. Analytics.** Create the site in Umami Cloud, point `ANALYTICS_UPSTREAM` at it, check visitor IP and country still arrive through the proxy. Old history stays behind unless exported. Verify: a landing view shows up; the `landing.render` versus Umami check still holds.
- [ ] **I7. Host-bound settings.** `API_URL`, `APP_URL`, `CORS_ORIGINS`, `PUBLIC_HOST`, `MAIL_FROM` and the Resend sending domain (SPF, DKIM), `INGEST_EMAIL_DOMAIN` and the inbound webhook, the iPhone Shortcut URL, Healthchecks names, Umami website host. Keep a copy of the env file outside Dokploy. Add a `CHANGELOG.md` entry marked **Action required**.
- [ ] **I8. Limits check.** Compare launch estimates with the free tiers kept: Resend sends, Cloudinary credits, Healthchecks checks, R2 storage, embedding spend. From then on the Track K headroom row tracks them.
- [ ] **I9. Cut-over.** Announce a short write freeze; dump and restore into the VM's database (extensions first, pg-boss schema included); switch the tunnel and DNS; Cloudflare Redirect Rules answer 301 from the old hostname to the new one for `/p/*`, `/s/*` and the app. Members sign in again and re-install the PWA; push subscriptions are re-created on first open; unsynced drafts on the old origin are lost, so say so beforehand. Verify: post-deploy smoke on the new host; a shared link from before the move lands on the same card.
- [ ] **I10. Fallback deploy.** Deploy once by hand over SSH without Dokploy, from the env file copy. Verify: smoke green after the manual deploy.
- [ ] **I11. Decommission.** After two quiet weeks: remove the old Dokploy Compose project, the `gobbit` database on the shared instance and the old tunnel. Dokploy itself stays. Keep the Redirect Rules for a year.
- [ ] **I12. Docs.** `infra/README.md` (layout, remote server, backups, monitoring, restore, manual deploy, how to grow), `docs/design/deployment.md`, `README.md`, one line and one ADR row in `docs/architecture.md`.

E2E tier: smoke — hosts, images and the deploy path change; no new journeys.

## Track J — White-label custom domain

Phase 12 in `PLAN.md`: the communal deck answers on its own domain, and every link for it works there. `PLAN.md` points to `docs/plans/custom-domains.md` and decisions D84–D91 for the detail, but that file is not in the repository; the feature goes through spec-kit before work starts. The rules below are the ones `PLAN.md` states.

Depends on Track I (the hostnames route to the new origin, and the main domain must be final), Phase 8 public pages, and Phase 11 abuse controls.

- [ ] **J1. Spec and plan** through spec-kit from the Phase 12 rules; re-check the routing design against the Track I target, since the plan assumes Cloudflare for SaaS in front of the tunnel and a Traefik catch-all router. Confirm the free custom-hostname allowance of Cloudflare for SaaS **(verify)**.
- [ ] **J2. Domain for the deck.** Choose and register the community domain. Phase 12 allows subdomains only, so decide what the apex does (for example a redirect to `www`).
- [ ] **J3. Assign a domain** — Phase 12 demo 1: the platform operator adds the hostname in `/admin/domains` and the CNAME activates it; a personal deck is refused.
- [ ] **J4. Stranger on the domain** — demo 2: only this deck's public content is reachable on the host; unverified hosts answer 421.
- [ ] **J5. Member on the domain** — demo 3: sign-in link and session on the custom host, acting on this deck only.
- [ ] **J6. Links follow the deck** — demo 4: share links, previews, invite and sign-in emails use the custom domain; main-domain `/s/<id>` and public pages 301 there.
- [ ] **J7. Install and offline** — demo 5: the installed app carries the deck name and opens offline.
- [ ] **J8. Removal and dangling DNS** — demo 6: removing the domain or its DNS record returns links to the main domain and leaves no host answering for the deck.
- [ ] **J9. White-label finish.** Deck name in the title, manifest and `og:site_name`; footer "Powered by Gobbit"; the mail sender stays Gobbit. Hebrew chrome from Track E applies on the custom host; the privacy notice and take-down contact are reachable there; analytics counts the custom host; the sitemap and canonical URLs name the custom domain so search engines index one address.
- [ ] **J10. Launch order.** Share only custom-domain links from day one. If the deck was already public on the main domain, the 301s from J6 carry the old links.

## Track K — Monitoring and alerting

The aim: as usage grows, we see each limit coming and fix it before users feel it. The worst case is something biting with no one knowing what or where. Everything that can run out, slow down or fail shows on **one dashboard**, and every line on it has an alert. This track delivers `PLAN.md` Phase 11.2 (monitoring thresholds), and gives the decision events of constitution VIII somewhere to be watched and alerted. It must be live before the soft launch (stage 3), and is set up together with I4 on the VM.

### Where it lives

- **Grafana Cloud, free plan:** about 10k metric series, 50 GB logs, 14 days of retention, 3 users (third-party summaries, **(verify)**). It is off the VM, so the dashboard and its alerts survive a VM, Dokploy or home-lab outage. It holds the one dashboard, the alert rules, and the logs.
- **Grafana Alloy** (one more Compose service on the VM) collects everything and ships it: host metrics, container metrics, a Postgres exporter with a read-only monitoring role and `pg_stat_statements`, the app's `/metrics`, and container logs to Loki.
- **Healthchecks.io stays** as the dead man's switch (D342). It alerts on its own even if Grafana or Alloy is broken.
- **Labels stay low-cardinality:** route patterns rather than paths, queue names, event names from the catalogue. No deck, user or IP labels. This keeps the free series limit safe and the data free of personal details.
- Self-hosting Grafana on the VM would go down with the VM; in the home lab it would undo Track I. Neither.

### What it watches

| Area | Signal | Source | Warn (email) | Page (phone) |
|---|---|---|---|---|
| Mail (Resend free: 100 a day, 3,000 a month) | mails sent today and this month, by kind (sign-in, invite, waitlist, reminder, other) | our own counter at the mailer; the Resend usage API once it leaves beta | 70 % of either | 90 %, or any send refused for quota. Magic-link sign-in stops at the cap, so this is the worst one. |
| Images (Cloudinary free: 25 credits a month) | credits used, % of limit, storage, bandwidth, transformations | Cloudinary Admin API `usage`, hourly | 70 %, or forecast to run out within 10 days | 90 % |
| Model spend | estimated cost per day by feature (extraction, embeddings, Ask), from `LLM_PRICES_PER_MTOK`; OpenRouter balance | our counter; OpenRouter `GET /api/v1/credits` (needs a management key) | daily spend over budget, balance under 30 days of spend | balance under 7 days |
| Anonymous query budget | per-IP and global embedding budget used, refusals | `query-budget.ts` | global budget refused on 3 days in a row | none (it degrades to text search) |
| R2 backups (10 GB free) | bucket size, last dump size and age | backup job | 70 % | last good dump older than 26 h |
| Umami Cloud | events this month against the plan | Umami API **(verify)** | 70 % | 90 % |
| Healthchecks, Grafana itself | checks in use, series in use | their own pages | 70 % | none |
| API | requests, 5xx rate, p95 latency per route pattern, anonymous rate-limit refusals, public page cache hit rate | app `/metrics` | p95 over 500 ms for 15 min, 5xx over 1 % | 5xx over 5 % for 5 min |
| Jobs | queue depth and oldest waiting job per queue, failures, duration; reminder lateness | app `/metrics` (pg-boss queue stats) | oldest `ingest`/`embed-item` job over 5 min; reminders over 3 min late | a queue growing for 30 min, or reminders over 15 min late |
| Database | size and growth, connections in use against the pool, slowest queries (`pg_stat_statements`), cache hit ratio, `items_embedding_hnsw_idx` size against memory, locks, dead tuples | Postgres exporter | p95 query time doubles week on week; cache hit under 99 %; HNSW index over half the memory | connections at the limit; disk over 85 % |
| Host | CPU, memory, disk, container restarts | Alloy | memory over 80 %, disk over 70 % | disk over 85 %; a container restarting in a loop |
| Edge | requests, cache hit ratio, 429s from the rate limiting rule, WAF blocks | Cloudflare GraphQL Analytics API **(verify)** | a sudden rise in 429s or blocks | none |
| Decisions | decision events by `event` and `outcome` (waitlist refusals, ingest drops, budget refusals) | app `/metrics` counters from `decisionLogger` | refusals for any event above its usual rate | none |
| Growth | users, decks, cards, public page views, waitlist size | database counts, hourly | none (trend only) | none |

"Forecast to run out" uses Grafana's linear prediction over the last 7 days, so a limit growing slowly shows as "N days left" long before it alarms. Limits themselves are env vars, so a plan upgrade changes one value, not a dashboard.

### Dashboard layout

One dashboard, top to bottom, so a single look answers "is anything biting, and where":

1. **Status:** up or down per process, 5xx rate, p95 latency, last deploy (commit), last backup.
2. **Headroom:** one bar per limited resource, % used and days left: Resend day and month, Cloudinary credits, model spend, R2, Umami, Grafana series, database disk, VM memory.
3. **Growth:** users, decks, cards, public views, waitlist, all over 90 days.
4. **Database:** connections, slowest queries, size, cache hit ratio, HNSW index against memory.
5. **Jobs:** depth and oldest age per queue, failures, reminder lateness.
6. **Edge and abuse:** Cloudflare cache ratio, 429s, WAF blocks, anonymous budget refusals.
7. **Logs:** recent errors, linked from each panel.

### Steps

- [ ] **K1. Spec** the app side through spec-kit (one small feature): a `/metrics` endpoint on `api` and `worker` that only the Compose network can reach (its own port, never routed by Caddy); `prom-client` (new dependency) for counters and histograms; a `usage-poll` worker job (hourly cron) that reads the vendor usage APIs and database counts into gauges; the limit env vars. Each vendor call is its own decision event, so a failing poll is itself visible. E2E tier: none, since nothing user-facing changes.
- [ ] **K2. Collector.** Add Alloy and the Postgres monitoring role to the VM's Compose project, with `pg_stat_statements` on. Verify: metrics and logs from all five containers arrive in Grafana Cloud.
- [ ] **K3. Dashboard and alerts** as above, kept as JSON in `infra/monitoring/` so they can be reviewed and restored. Contact points: email for warn, phone push (the same channel as Healthchecks) for page. Verify: each alert fired once on purpose (for example, a lowered limit env var).
- [ ] **K4. Weekly look.** A short checklist in `infra/README.md`: headroom row, days left, slowest queries, growth. Verify: done once before stage 3.
- [ ] **K5. Docs.** `infra/README.md` (monitoring), `docs/design/deployment.md`; an ADR for "Grafana Cloud as the single pane, Healthchecks independent".

## Track L — Early wins

Small changes to do now, before load arrives. L1–L3 are small fixes (no spec-kit). L4 is not small: it is its own feature.

- [ ] **L1. Public HTML cached at Cloudflare.** Public pages already send `Cache-Control: public, max-age=300` to strangers (`apps/api/src/public/responses.ts`; search pages 60 s) and `private, no-store` to members. One Cloudflare cache rule is enough: host is the app host, the path starts with `/p/`, and the cookie does not contain `gobbit_session` → eligible for cache, respect the origin TTL. Crawlers and link-preview bots then stop reaching the single API process. No code change.
  - Edits show within 5 minutes, which browsers already accept today. A take-down that cannot wait is a manual purge (by URL or prefix, free on every plan) in the take-down runbook. A purge call from `purgeDeck` is only worth adding if 5 minutes ever hurts (free plan: 25 purge requests in a bucket, refilled 5 a minute).
  - Not `/welcome`: Umami is checked against `landing.render` (D231), and edge hits would never be counted.
  - Track J: the rule has to cover the custom hostnames too.
  - Verify: a second anonymous request shows `cf-cache-status: HIT`; a signed-in request is still redirected to the app; public pages set no cookie **(verify)**, since Cloudflare does not cache a response that sets one.
- [ ] **L2. Embedding sweep every 10 minutes.** `EMBED_SWEEP_CRON` to `*/10 * * * *` and `EMBED_SWEEP_BATCH` from 50 to 500 (`packages/shared/src/search/constants.ts`), so it still drains 3,000 cards an hour after an outage or a model change. Writes already enqueue their own embedding after commit; the sweep only heals misses, so a missed card is text-search-only for at most 10 minutes. E2E tier: none.
- [ ] **L3. Job polling.** Not a blanket 60 s. pg-boss polls each of the 12 queues every 2 s by default, about 6 small queries a second when idle. That is cheap on an always-on database, but it is noise in the query stats.
  - **Scheduled queues** (9 sweeps and prunes, `reminder-sweep` included): `pollingIntervalSeconds: 30`. A cron fires at most once a minute, so 30 s adds at most 30 s of delay. Reminders stay well inside the 3-minute warning.
  - **Queues people wait on** (`ingest`, `embed-item`, `link-snapshot`): keep 2 s. At 60 s, a share would take up to a minute to show in the review queue.
  - Result: about 1.8 polls a second when idle instead of 6. E2E tier: none.
- [ ] **L4. Sign-in without magic links** (decided Nov 16; a spec-kit feature, next free number). Registration with username and password (the address confirmed before the account works), or with Google. Sign-in with either.
  - **Recommendation: ship Google first.** It stores no passwords and sends no mail (Google vouches for the address). Add passwords second.
  - **Mail does not go away:** password sign-up confirmation, password reset, invites and the waitlist all still send mail. Sessions last 90 days (`SESSION_TTL_DAYS`), so sign-in links are not where mail volume comes from. Launch cohorts are: waitlist confirm, invite and first sign-in are about 3 mails a person, so the 100-a-day cap admits about 33 new people a day. K shows which kind dominates. If the cap bites before L4 ships, the Resend paid plan is the quick lever.
  - **Passwords bring:** a hashing library (Argon2id, new dependency); reset by mail, which is a magic link that lands on "set password", so that part of the code stays; rate limits and lockout; sessions revoked on password change; a decision event for every refusal (constitution VIII).
  - **It touches:**
    - Registration gate: `users.service.register` gets new reasons; waitlist mode still holds, so an unknown Google account joins the waitlist.
    - H7 invites: accepting an invite registers by either method; what happens when the Google address differs from the invited one.
    - Spec `046` usernames: username sign-in needs them first.
    - Track J: Google redirect URIs are per host, so either OAuth runs on the main domain and hands the session over, or each custom host is registered.
    - Existing users: they keep a "mail me a link" fallback until they have set a method.
  - Before stage 4 (waitlist cohort), where mail volume peaks.
  - E2E tier: smoke for sign-up and sign-in by password; full for Google (faked provider) and reset.

## Order

Decided Nov 16. Everything in this file ships; this is the order, by importance. The first audience is **alpha** (stage 3): testers we know personally, invited, who give feedback. Then the waitlist cohort (stage 4), then public (stage 5).

What matters, in this order:

1. People find usable information.
2. The app is inviting and easy: content reads right in Hebrew, right to left, and navigation is fluent.
3. We see every limit and failure as people start using it.
4. Onboarding and first use are clear, with as little to figure out as possible.
5. Then everything that improves or expands the basics.

Mandatory items (backups, privacy) come first in their simplest compliant form and get their full form before the stage that needs it. Progress is ticked in the tracks above; this list only sequences them. "Spec" means a spec-kit feature; the rest are small fixes, configuration or process.

### Now, alongside everything

- B2, B3 and C1: they shape the importer and the content. Track C writing runs in parallel with all of the below.
- H1: settle its open points, including whether a deck invite skips waitlist approval (shared by H7, H12 and L4).
- A7 as a small fix ahead of the Import v2 spec: it is a bug in bulk publish, not only an import problem.
- L1–L3 (small fixes).

### Stage 3 — Alpha

1. **Usable information.** Import v2 (spec; Track A) PR 1: A1, A2 (text and link fields), A3, A5, A6, A8, A9, A10. PR 2: A4 (media; cards can get media after the first seeding). Then B1, B4, B5, H2, H3 and D1–D5.
2. **Reads right, moves fluently.** D7 with its E2a fixes; E4.
3. **Off the home lab.** I1–I10, so testers never meet the old hostname and never have to sign in again or reinstall.
4. **Monitoring.** K2–K4 on the VM, alerting from logs and exporters (decision events are already log lines). K1 (spec) follows in stage 4, unless mail sends cannot be counted from logs **(verify)**; then K1 comes here, since sign-in stops at the mail cap.
5. **Getting in.** H11 (spec); H6 as an amendment to `046-user-profile` (spec only so far); H12 (spec; assumed to ride on today's deck-invite registration, to check in its spec); H8a (spec).
6. **Mandatory basics.** E5 (I5 restore rehearsed), E7a, E9, E3a.
7. Invite the testers.

### Stage 4 — Waitlist cohort

1. Alpha feedback fixed, as small fixes or against the matching spec.
2. E2b Hebrew chrome (spec), the surfaces new people meet first.
3. H7 (spec), then the rest of H8 (spec).
4. L4 Google sign-in (spec).
5. K1 (spec), if not done in stage 3.

### Stage 5 — Public

1. E1, E6 and L1 checked on the public host.
2. E7b self-serve export and delete (spec).
3. The rest of the reader in Hebrew (E2b).
4. Track J (spec, Phase 12), then switch the deck to public and share the custom-domain link. If Track J slips, go public on the product domain and add the custom domain later; the J6 redirects keep those links working.

### After launch — improve and expand

H5 suggesting (spec), E3b report a problem (spec), password sign-in (L4, second spec), and Track F (staleness watcher, gap detection, like and useful).

## Open decisions

- A5: transliterate Hebrew slugs or require an explicit slug.
- A8: env-tunable cap or an owner exemption.
- B3: location as categories or something new.
- E: Hebrew chrome (decided Nov 16: right to left correct for alpha (E2a); Hebrew labels before the cohort, the surfaces new people meet first; the rest of the reader before public (E2b)).
- F: "suggest a card" (decided Nov 16: after the launch basics, see Order).
- Whether the import can target an existing card later (G14), should the seed file need a second pass.
- I1: Hetzner or another VM provider (decided: one small paid VM, Postgres on it, deployed by Dokploy as a remote server).
- I2 and J2: the product domain and the community domain.
- Track J: custom domain (decided Nov 16: required before public, not for alpha or the cohort).
- H2: your own user or a dedicated community user as the deck's owner; who holds its mailbox.
- Members-only categories on a public deck: stub in `PLAN.md` Phase 17, not urgent.
- H7: whether a deck invite skips waitlist approval.
- H12: whether a reusable deck join link is ever wanted (not now), and the cap on open invite links per deck.
- L4: Google first, passwords second (recommended), or both together; whether existing users keep a mail-me-a-link fallback; what happens when an invite is accepted with a Google address other than the invited one.

## To verify

- Whether a phone number in a card body becomes a tappable link on public pages.
- How the review screen behaves for a proposal with no category before Publish is pressed (the API answers 422).
- Whether the Cloudinary plan and the media sweep settings fit a few hundred seed images.
- Every price in Track I, on the provider's own page.
- That `dokploy-network` exists on a Dokploy remote server, and whether Dokploy's database backups run there.
- Grafana Cloud free plan limits, alerting included, on Grafana's own pricing page.
- That public pages set no cookie (Cloudflare does not cache responses that do).
- Umami Cloud's monthly event limit and whether its API reports usage; Cloudflare GraphQL Analytics on the free plan.
- The exact fields of Cloudinary's `usage` response; whether the Resend usage API has left private beta.

## Sources

Track I prices and features, read Nov 16 (mostly third-party summaries; confirm on the provider's page):

- Dokploy remote servers: <https://docs.dokploy.com/docs/core/remote-servers>
- Hetzner price adjustment: <https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/>
- EU VPS comparisons: <https://www.eucloudcost.com/cheapest-vps-europe/>, <https://sliplane.io/blog/top-5-cheap-vps-providers>
- Managed Postgres prices: <https://dev.to/abhijais1/managed-postgres-pricing-in-2026-eight-providers-compared-3do1>, <https://neon.com/pricing>
- Cloudflare rate limiting rules: <https://developers.cloudflare.com/waf/rate-limiting-rules/>
- Cloudflare for SaaS plans: <https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/>
- Cloudflare free plan summary: <https://costbench.com/software/cdn-edge/cloudflare/free-plan/>

Track K and L, read Nov 16:

- Grafana Cloud free plan (third-party summaries): <https://costbench.com/software/observability/grafana-cloud/free-plan/>, <https://last9.io/blog/grafana-cloud-pricing/>
- Cloudflare purge for all plans and its rate limits: <https://developers.cloudflare.com/changelog/post/2025-04-01-purge-for-all/>, <https://blog.cloudflare.com/instant-purge-for-all/>
- Cloudinary usage limits and the Admin API `usage` method: <https://cloudinary.com/documentation/developer_onboarding_faq_usage_limits>
- Resend usage API (private beta) and quota headers: <https://resend.com/docs/api-reference/usage/retrieve-usage>, <https://www.resend.com/docs/api-reference/rate-limit>
- OpenRouter credits: <https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits>
