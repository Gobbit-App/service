# Community go-list

Everything needed to launch the first communal deck: a public, Hebrew-first knowledge deck for a community living abroad, seeded from a curated Markdown file (plus media) through bulk import and reviewed card by card.

Status: draft, Nov 15. Read against `origin/main` at `dd8fe4f`; roles and registration re-read Nov 16 at `0fbc4a5`. This is a checklist that feeds `PLAN.md` and `/speckit-specify`; it takes no D numbers and decides nothing durable. Items marked **(verify)** were not confirmed in code.

## Goal and definition of done

- A communal deck is live at `/p/<slug>`, indexable, with public categories.
- The seed content (several hundred cards, Hebrew with English and Greek mixed in) went in through import, each card with its category already set, and was reviewed and published by a person.
- A stranger on a phone can find a card by searching in Hebrew, English or Greek spelling.
- Wrong or stale cards have a way back to the curators.
- Backups, abuse limits and privacy basics are in place before the link is shared.
- Nothing the public deck depends on runs in the home lab: compute, database, backups and analytics are on external services, and the app answers on a product domain (Track I).
- The deck is served white-labelled on its own domain (Track J).
- The deck belongs to a community account, not the family one, and each launch stage (curators, invited readers, waitlist cohort, anonymous readers) has a defined way in (Track H).

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
| G15 | Every user of the account that owns a deck is an owner of it, with no membership row and no way to lower the role. A communal deck created under the family account makes every family user an owner. A deck cannot be moved to another account **(verify)**. | `resolveRole`, `docs/design/auth.md`; `deckPatchSchema` |
| G16 | No role can only suggest. A reader cannot create or share a card (`item.create` is editor and up). An editor's card from the composer is published at once, and an editor can edit and archive any card. Only shares and imports arrive as proposals. | `PERMISSION_MATRIX`, `items.service.create` (status defaults to `published`) |
| G17 | Every role, readers included, can list the deck's members with their email addresses. Fine for a family, not for a community of strangers. | `member.list`, `memberSchema` |
| G18 | The waitlist and decks are not connected. A waitlist invite creates an account and a personal deck, not a membership in the communal deck. There is no cohort size ("first X"), no join link and no self-join; deck invites are one address at a time, by owners only. | `waitlist-admin.service`, `inviteCreateSchema`, `member.invite` |
| G19 | Registration is one global switch. `open` lets anyone create an account with a personal deck and its ingestion costs; nothing lets a visitor register for one deck as a reader. | `REGISTRATION_MODE`, `users.service.register` reasons |
| G20 | `robots.txt` has one `User-agent: *` group. Communal public pages are indexable by every crawler; there is no setting for AI crawlers. | `apps/api/src/public/seo.ts` |

## Track A — Import v2 (blocks seeding)

One spec-kit feature, next number `046`. Split into small PRs per stream. E2E tier: smoke for the import journey (it exists for 021; extend it), full for the edge cases.

- [ ] **A1. Card-per-section Markdown.** `# Heading` sets the category; `## Heading` starts a card and is its title; everything up to the next heading is the body, kept as rich text (line breaks, bold, lists, links). The 021 behaviour stays for files without `##` headings. Verify: a fixture with a three-paragraph Hebrew card imports as one card with the same body.
- [ ] **A2. Per-card fields.** A small set of `key: value` lines directly under the card heading: `source` (URL), `categories` (extra names or slugs), `image` or `cover` (relative path), `type` (text, link, media). Unknown keys are a row error, not silently dropped. Verify: parser unit tests per key.
- [ ] **A3. Several categories per card.** `categoryIds` already takes a list on the wire; the parser and preview carry more than one. Verify: a card under `# Health` with `categories: athens` gets both.
- [ ] **A4. Media from the CLI.** `pnpm import:notes` resolves relative paths, uploads through the existing signed upload, records the asset and sends a media row or a cover. The web screen reports media rows as "use the CLI". Tests never call Cloudinary. Verify: integration test with a fake uploader; one real run in rehearsal.
- [ ] **A5. Hebrew-safe category slugs.** Either transliterate when the slug comes out empty or let the caller pass a slug wherever a category is created (API already accepts `slug`; the web app and `ensureNewCategory` do not). Pick one in `/speckit-clarify`. Verify: creating `בריאות` from the web app and from a suggested category both succeed.
- [ ] **A6. Strict category mode.** An import flag that refuses rows whose category does not match an existing one, so a typo never becomes a new category. Default on for the CLI. Verify: dry run lists the unmatched names.
- [ ] **A7. Bulk publish keeps going.** A card that cannot be published is reported as skipped with its reason; the rest continue. Verify: integration test with one category-less proposal in a batch of three.
- [ ] **A8. Import cap.** Make the `import` cap env-tunable, or lift it for deck owners; raise the preview limit with it. Add a `CHANGELOG.md` entry if an env var is added. Record the refusal as a decision event (constitution VIII). Verify: unit test on the cap table.
- [ ] **A9. Bulk discard by import label.** Undo of a bad import in one action. Verify: integration test; activity log shows the discards.
- [ ] **A10. Dry-run lint output.** `--dry-run` prints, per file: card count per category, over-long titles and bodies with their line, missing categories, missing media files, bad URLs. Verify: snapshot test on a broken fixture.
- [ ] **A11. Docs.** `docs/design/ingestion.md` gets the format and a "Deviations" list; `README.md` the CLI usage; `docs/architecture.md` at most one line.

Left out on purpose: table, calc, reminder and event cards on import (events have their own rules, D377); update-in-place on re-import (G14); an LLM step inside import. The file is a one-time seed and the deck is the source of truth afterwards.

## Track B — Deck setup

- [ ] **B1. Create the deck** from the community account (H2) as `communal` with an explicit Latin slug and `isPublic: false`. Today this is one API call; a kind choice in the web app is optional and small.
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

## Track E — Before the link is shared

| Item | Source | Gap | Why |
|---|---|---|---|
| Phase 8 demos 1–6 run against production | `PLAN.md` Phase 8 | | The public pages are the product for strangers |
| Hebrew, right-to-left chrome on public pages | new | G9 | The audience reads Hebrew; card text already renders correctly, the frame does not |
| Report a problem on a card | Phase 14, item 2 | G10 | Community information goes wrong; curators need the signal |
| "Last verified" shown on cards and public pages | new, small | G11 | Readers must be able to judge how fresh a phone number or price is |
| Backups that restore | Phase 11.1 | | Hundreds of hand-reviewed cards |
| Abuse controls on public routes | Phase 11.3 | | Public and indexed |
| Privacy basics (export, delete), privacy notice | Phase 11.4 | | Public deck with community-sourced content |
| Monitoring thresholds on decision events | Phase 11.2 | | Liveness exists; refusals and failures are not alerted |
| Take-down path | new, process | | A named contact and a same-day way to unpublish a card; archive already does the unpublishing |

Each of these that adds behaviour goes through spec-kit; the two "new" product items are small features of their own.

## Track F — Soon after launch

- **Suggest a card** without an invite (G12; members suggesting is H5): a public form that creates a proposal, behind the anonymous rate limiter, or a low-friction contributor role. Needs Phase 11.3 first.
- **Staleness watcher** (Phase 10.1) and **gap detection** from failed searches (Phase 10.4).
- **Member app in Hebrew** (rest of G9).
- **Like and useful** (Phase 14.1). Threads (14.3) and MCP (Phase 13) can wait.

## Track H — People and access

How people get into the communal deck at each stage, what the code does today and what is missing. Nothing here is built by this file; H5–H8 become spec-kit features.

### The model today

- **Account and users.** Every user belongs to one account. Registering creates a new account with one user and, on first sign-in, a personal deck at `/d/me`. Users of the account that owns a deck are its owners implicitly (G15).
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
| 1. Community account | A dedicated address is registered as its own account and creates the communal deck. Your own user and one more get `owner` memberships. Family users get nothing on it. | yes, by hand (H2) |
| 2. Curators | One or two people as `maintainer` (curate and publish) or `owner` (also manage members). | yes (H3) |
| 3. Soft launch | Invited `reader`s; deck not public. | reading yes; suggesting no (G16); member emails exposed (G17) |
| 4. Waitlist cohort | Announce; the first X confirmed entries are let in to this deck. | by hand only (H4); not connected (G18) |
| 5. Public | `isPublic` on, categories `public`; anonymous reading, indexed. Any interaction needs an account. | reading yes; self-registration for the deck no (G19); interactions are Phase 14; AI crawlers undecided (G20) |

### Steps

- [ ] **H1. Decide the open points below** before B1; the owning account cannot be changed afterwards **(verify)**.
- [ ] **H2. Community account.** A dedicated mailbox that more than one person can recover. On the new stack, the platform admin invites it from the waitlist screen; it signs in and creates the deck (B1). Keep your own address as platform admin and add it to the deck as `owner`. Verify: `GET /decks/<slug>/members` lists the community user as implicit owner and no family user.
- [ ] **H3. Curators.** `maintainer` for people who review and publish; `owner` only for whoever also manages members. Avoid `editor` on this deck: it publishes without review.
- [ ] **H4. Soft launch and cohort, with no new code.** Invite readers from deck settings one address at a time. For the waitlist cohort, read confirmed `community` entries in `/admin/waitlist` and send each a deck invite instead of a waitlist invite; the cap is counted by hand and the entries stay `confirmed`. Good for tens of people, not hundreds.
- [ ] **H5. Suggesting members** (closes G16, part of G12). A member who can only propose: the share and paste paths and a short "suggest a card" form, always `proposed`, own proposals visible, daily caps. Either a new role between reader and editor or a deck setting that lets readers propose. Needed before stage 3 if early readers should contribute.
- [ ] **H6. Member privacy on communal decks** (closes G17). Readers and suggesting members do not see the member list or anyone's email; decide what name, if any, shows on a suggested card. Needed before stage 3.
- [ ] **H7. Waitlist to deck** (closes G18). Invite a waitlist entry into a named deck with a role, in batches, with a cohort size and a decision event per invite and per refusal; the entry becomes `invited`. Needed before stage 4 at any real size.
- [ ] **H8. Join the public deck** (closes G19). A "join" action on the public pages that registers a visitor as a reader (or suggesting member) of that deck only, behind the abuse controls of Phase 11.3, with its own registration reason and decision events. Whether such a user also gets a personal deck is an open point. Needed for stage 5; Phase 14 reactions, reports and threads then require this membership.
- [ ] **H9. Crawler policy** (closes G20). Decide search engines and AI crawlers separately; implement as named `User-agent` groups in `robots.txt` plus the Cloudflare AI-crawler setting **(verify)**. `robots.txt` is a request, not a control: public text can be copied either way.
- [ ] **H10. Custom host and members.** On the deck's own domain (Track J) a session acts on that deck only, so community members never see `/d/me` there. Decide with H8 whether that is the intended experience.

Order within the track: H1 → H2, H3 (with Track B) → H5, H6 → stage 3 → H7 → stage 4 → H8, H9 → stage 5.

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
| Hostname | a subdomain of the home-lab domain | yes |
| Images, CI | GHCR, GitHub Actions | no |
| Images in cards, mail, uptime pings, models | Cloudinary, Resend, Healthchecks.io, OpenRouter | no |

### Constraints the target must respect

- `api` and `worker` are long-running Node processes. The worker polls pg-boss, the API pings the database every 60 s and the worker sends a heartbeat every 30 s, so the database never goes idle.
- The API keeps state in memory (anonymous rate limiter, public page cache), so it runs as one instance.
- Everything is one origin; Caddy owns the routing, including the cookie-based choice between landing page and app at `/` (ADR-063).
- CI builds images without a multi-platform setting, so an `arm64` host needs a build change.
- Sessions, installed PWAs, offline drafts and push subscriptions belong to the origin; magic links, share links, public pages, the mail sender and email-in all carry the hostname.

### Candidate services

Free-tier figures were read on Nov 15 from the pages listed under Sources, several of them third-party summaries. Confirm each on the provider's own pricing page before choosing.

| Need | Candidate | Free tier as read | Fit |
|---|---|---|---|
| Postgres | Neon | 100 CU-hours and 1 GB per project a month; suspends after 5 minutes idle | Compute does not fit as the app stands: an always-awake database at the smallest size uses about 180 CU-hours a month. Works only if the pings and polling let it sleep (I3) or on the paid plan. Confirm pgvector and pg_trgm **(verify)**. |
| Postgres | another managed free tier | **(verify)** | Check storage, pause policy and both extensions. |
| Postgres | same VM as the app | n/a | No extra service, no network hop; backups become ours to run (I5). |
| Always-on compute | Oracle Cloud Always Free (Ampere A1) | reported cut in 2026 to about 2 OCPU / 12 GB; idle instances can be reclaimed | Enough capacity, but `arm64` images are needed, capacity is hard to get and idle instances are reclaimed. Not for the only copy of anything. |
| Always-on compute | small paid VPS in the EU | not free | The dependable option; the same Compose file runs unchanged. |
| Compute | Cloud Run, Render, Koyeb free tiers | scale to zero or sleep when idle; an always-on Cloud Run instance is billed | Do not fit a polling worker and in-memory state. |
| Compute | Cloudflare Containers | needs the Workers Paid plan | Not free; no gain over a VM here. |
| Ingress, DNS, TLS, CDN | Cloudflare free plan + tunnel | already in use | Keep. The tunnel end moves with the containers, so no ports are opened. |
| Static web | Cloudflare Workers static assets | static requests free | Possible later; it would move Caddy's routing into a Worker. Not in this phase. |
| Backups | Cloudflare R2 | 10 GB, no egress fee | Fits nightly dumps for years. |
| Analytics | Umami Cloud Hobby | free, about 100K events a month; site count unclear | Fits; Caddy proxies `/stats/*` to it so the tracker stays same-origin. |
| Mail, images, uptime | Resend, Cloudinary, Healthchecks.io | already in use | Re-check limits against launch traffic (I8). |

There is no dependable free home for an always-on container. Recommended target: one small EU VM running the committed Compose file behind the existing Cloudflare tunnel, Postgres on a managed service in the same region if the free compute budget can be met and otherwise on the VM, dumps to R2, Umami Cloud. Everything else stays where it is.

### Steps

- [ ] **I1. Decide the target** (compute host, database home, deploy tool) and record it as the next ADR, superseding the relevant parts of ADR-038, ADR-039 and ADR-073. Verify: ADR merged with the checked free-tier numbers.
- [ ] **I2. Product domain.** Register it, put the zone on Cloudflare, decide the app hostname. Verify: DNS resolves; nothing points at it yet.
- [ ] **I3. Database fit.** Measure database size and connection pattern in production. If a suspend-when-idle database is the aim, change the health pings and worker polling so an idle app lets it sleep, and prove pg-boss works over the provider's direct connection. Verify: a week of metrics under the monthly compute allowance, or the decision to host Postgres on the VM.
- [ ] **I4. Compute.** Provision the VM, run the Compose file with a second tunnel on a staging hostname. If the host is `arm64`, add it to the CI image build. Keep Dokploy or replace it with a plain pull-and-`up` deploy; either way the repo file stays the source (ADR-073). Verify: e2e smoke green against staging.
- [ ] **I5. Backups.** Nightly `pg_dump` to R2 with retention, plus the provider's own recovery if managed. Keep a pull copy on the NAS as a second location. Rehearse the restore and write the date in `infra/README.md`. Verify: Phase 11.1 demo.
- [ ] **I6. Analytics.** Create the site in Umami Cloud, point `ANALYTICS_UPSTREAM` at it, check visitor IP and country still arrive through the proxy. Old history stays behind unless exported. Verify: a landing view shows up; the `landing.render` versus Umami check still holds.
- [ ] **I7. Host-bound settings.** `API_URL`, `APP_URL`, `CORS_ORIGINS`, `PUBLIC_HOST`, `MAIL_FROM` and the Resend sending domain (SPF, DKIM), `INGEST_EMAIL_DOMAIN` and the inbound webhook, the iPhone Shortcut URL, Healthchecks names, Umami website host. Add a `CHANGELOG.md` entry marked **Action required**.
- [ ] **I8. Limits check.** Compare launch estimates with the free tiers kept: Resend sends, Cloudinary credits, Healthchecks checks, embedding spend.
- [ ] **I9. Cut-over.** Announce a short write freeze; dump and restore into the new database (extensions first, pg-boss schema included); switch the tunnel and DNS; the old hostname answers 301 to the new one for `/p/*`, `/s/*` and the app. Members sign in again and re-install the PWA; push subscriptions are re-created on first open; unsynced drafts on the old origin are lost, so say so beforehand. Verify: post-deploy smoke on the new host; a shared link from before the move lands on the same card.
- [ ] **I10. Escape hatch.** From last night's R2 dump, bring the app up on a scratch VM with the domain pointed at it. Verify: Phase 11.6 demo.
- [ ] **I11. Decommission.** After two quiet weeks: remove the Dokploy project, the `gobbit` database on the shared instance and the old tunnel; keep the 301s for a year.
- [ ] **I12. Docs.** `infra/README.md` (layout, backups, monitoring, restore), `docs/design/deployment.md`, `README.md`, one line and one ADR row in `docs/architecture.md`.

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

## Order

1. B2 and C1 now; they shape both the importer and the content.
2. Track A through spec-kit, in parallel with Track C writing. Track I can run alongside; it touches no application behaviour beyond I3.
3. H1–H3 with B1, B4, B5, then D1.
4. D2–D6 (the deck stays non-public).
5. Track I cut-over (I9) at the latest here, so nothing public is ever on the home-lab hostname.
6. H5 and H6, then the soft launch (stage 3); H7, then the waitlist cohort (stage 4).
7. Track E, H8 and H9.
8. Track J, then switch the deck to public and share the custom-domain link (stage 5).

If Track J slips, the fallback is to go public on the product domain after step 7 and add the custom domain later; the J6 redirects keep those links working.

## Open decisions

- A5: transliterate Hebrew slugs or require an explicit slug.
- A8: env-tunable cap or an owner exemption.
- B3: location as categories or something new.
- E: how much Hebrew chrome is needed for launch (public pages only, or the reader too).
- F: whether "suggest a card" is needed at launch rather than after.
- Whether the import can target an existing card later (G14), should the seed file need a second pass.
- I1: free but fragile compute (Oracle Always Free) or a small paid VM; managed Postgres or Postgres on the VM; keep Dokploy or deploy with plain Compose.
- I2 and J2: the product domain and the community domain.
- I3: whether to change the ping and polling pattern to fit a suspend-when-idle database.
- Track J: whether the custom domain is required for launch or follows it.
- H1: dedicated community account (recommended) or the family account; who holds its mailbox.
- H1: once the deck is public, what members see that visitors do not (members-only `shared` categories, or everything `public` and membership only unlocks interaction).
- H5: suggesting as a new role or as a deck setting for readers.
- H8: whether people who join only the communal deck get a personal deck, and whether its ingestion is on for them.
- H9: search engines yes or no; AI crawlers yes or no.

## To verify

- Whether a phone number in a card body becomes a tappable link on public pages.
- How the review screen behaves for a proposal with no category before Publish is pressed (the API answers 422).
- Whether the Cloudinary plan and the media sweep settings fit a few hundred seed images.
- Every free-tier figure in Track I, on the provider's own page.
- That pg-boss runs on the chosen managed Postgres (direct connection, schema creation rights).

## Sources

Free-tier figures in Track I, read Nov 15:

- Neon free plan: <https://neon.com/faqs/free-plan-limits-and-quotas>
- Oracle Always Free resources: <https://docs.oracle.com/iaas/Content/FreeTier/resourceref.htm>, and the reported 2026 reduction: <https://linuxiac.com/oracle-quietly-cuts-free-tier-ampere-a1-resources-in-half/>
- Hosting free tiers side by side: <https://flaviocopes.com/hosting-free-tiers/>, <https://agentdeals.dev/hosting-free-tier-comparison-2026>
- Cloudflare plans and Workers pricing: <https://www.cloudflare.com/plans/>, <https://developers.cloudflare.com/workers/platform/pricing>
- Umami Cloud: <https://umami.is/docs/cloud/faq>
