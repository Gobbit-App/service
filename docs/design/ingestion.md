# Ingestion (Phase 5)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Anything shared into Gobbit (Android share sheet, iPhone Shortcut, paste box, optionally email) becomes a **proposed** card that a publisher reviews. The agent never publishes, except a publisher's own share on a deck that opted in ([Auto-publish](#auto-publish-022-d192d193)). Decisions D92–D111 (D84–D91 belong to the Phase 12 custom-domains plan).

## Data (migration `0009_ingest`)

- `ingest_jobs`: deck, sharer, `channel` (`pwa | shortcut | email | paste | mcp`), `client_label` (the AI app's name, ≤ 60, `0010_mcp_readiness`), `status` (`queued → running → proposed | failed`, then `published | discarded`), `raw` (shared text/url/title + uploaded image public ids), `normalized` (the fetched source), `extraction` (model, confidence, language, categories, `newCategory`), `dedup` (the verdict), `result_item_id`, `error`, `attempts`, `reviewed_by/at`. `raw` and `normalized` are nulled after 30 days by `prune-ingest-jobs` (weekly). Jobs are never soft-deleted.
- `ingest_tokens`: sha256 of an `ing_` token (shown once), label, display prefix, optional `deck_id`, `last_used_at`, `revoked_at`. At most 5 live per user.
- `items.entities jsonb` (phones, addresses, hours, prices, dates, people, urls; `entitiesSchema` in `@pb/shared/ingest`, ≤ 2 KB CHECK). `item_search_text()` gains a fifth argument so entities are searchable; every embedding hash changed, so the sweep re-embedded every item once (ADR-047).
- D95: a deferred constraint trigger refuses a `published` item with no category (`item_needs_category` → 422 `/problems/item-needs-category`).
- `llm_calls` accepts the purposes `extract`, `extract_escalated` and `embed_draft`; ingestion rows carry the job id in `job_id`.

## Submit (`POST /ingest`)

```
session or ing_ token (ingest-auth, only on this route) → JSON, or multipart with ≤ 3 `files`
  → ingest.service.submit: deck (bound token > deckId > me), item.create, daily caps (per channel + combined → 429),
    images → Cloudinary gobbit/ingest/<deckId> (tags ingest, job:<id>)
  → insert ingest_jobs (queued) → commit → enqueue `ingest {jobId}` (singleton per job) → 202 { id, status }
```

- Body limit 25 MB on `/ingest` only (1 MB elsewhere). Images: JPEG/PNG/WebP/HEIC/HEIF, ≤ 8 MB each.
- No extraction provider (`OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`) → 503; `/config.ingest.enabled` is false and the PWA hides the share UI.
- Token shares are always `channel = shortcut`; a bound token always ingests into its deck.
- Caps: `jobs.countByUserSince(userId, since, channel?)` over a rolling 24 h. Each channel has its own cap (`ingestDailyCaps()` in `@pb/shared/limits`: `INGEST_DAILY_CAP`, default 50, unless `INGEST_CHANNEL_DAILY_CAPS` overrides the channel), and all channels together stop at `INGEST_COMBINED_DAILY_CAP` (200).
- `GET /ingest/{id}` (sharer or a deck publisher) is the debug view: status, normalized source, extraction summary, dedup verdict, error and Σ `llm_calls.cost_usd` for the job.

## Worker pipeline (`jobs/ingest.ts`)

One pg-boss job runs **fetch → normalize → extract → validate → insert proposed item → embed draft → dedup**, updating `status` between stages. 2 retries with backoff; `ingest-sweep` re-enqueues `queued` jobs older than 5 minutes and fails ones that used every attempt.

- **Fetch** (`fetch/safe-fetch.ts`, ADR-048): undici `Agent` whose `connect.lookup` rejects private, loopback, link-local, CGNAT and metadata addresses (`fetch/ip-guard.ts`, IPv4-mapped IPv6 included). http(s), ports 80/443, ≤ 3 re-checked redirects, 10 s, 3 MB, `text/html` only.
- **Normalize** (`fetch/extract-page.ts`, `fetch/normalize-source.ts`): linkedom + Readability → title, text (≤ 8000 chars), Open Graph, lang. A blocked host, an error or no readable text falls back to OG, then to the shared text (`fetch.fallback` records which).
- **Extract** (`ingest/run-extraction.ts`): `Extractor` implementations for Anthropic and OpenRouter (forced `propose_card` tool) plus a fake for tests. The prompt (`ai/extract-prompt.ts`) holds the deck's categories the **sharer** can see, up to three recent cards as style examples, and the source inside `<source>` delimiters labelled untrusted. Output is validated with the create-item schema + `entitiesSchema` (`ai/extract-validate.ts`); one corrective retry quotes the error; `confidence < 0.6` escalates once to `EXTRACT_ESCALATION_MODEL`. Bodies over 600 characters are cut at a sentence boundary. Types: `text`, `link`, `image` only. The agent never creates categories; it may suggest a `newCategory`.
- **Locked social hosts** (015, D167): a share of an Instagram/Facebook/Threads/TikTok/X/LinkedIn URL always becomes a `link` card for that URL; the preview comes from the shared caption and image (stored as `preview.publicId`), never a generic login-wall OG. Detail: [links](links.md#locked-social-hosts-015-d166d168).
- **Insert** (`ingest/propose.ts`, shared with direct proposals): a `proposed` item, `created_by` = the sharer (re-checked when the job runs, `ingest/sharer-role.ts`); no fitting category → the deck's default category.
- **Dedup** (`ingest/run-dedup.ts`, `ingest/dedup-verdict.ts`): `embed_draft` embeds the proposal (filling its embedding), then compares with published and proposed items of the deck. Same normalized source URL → `update`; cosine ≥ 0.92 → `update`; 0.80–0.92 → `possible_duplicate`; else `new`. Without an embedding key: URL, then title `word_similarity ≥ 0.8` → `possible_duplicate`. Best-effort: a dedup error leaves `dedup` null. A direct proposal that names its target skips the search: `{ action: 'update', itemId, similarity: null, via: 'explicit' }`.
- Every provider call is recorded in `llm_calls` with `job_id`. Prompts never contain tokens or emails.

## Direct proposals (P5.9)

`ingest.service.proposeDirect({ user, deck, draft, channel, targetItemId?, clientLabel? })` proposes a ready card with no fetch or extraction: resolve the deck, `item.create`, validate the draft (create-item schema, `text | link | image` only, categories the caller can see, optional `newCategory`), check the target (a published card of the same deck the caller can see, else 404), apply the caps, insert a `proposed` job (`extraction.model = 'direct'`, `client_label`), then run the same `proposeItem` step as the worker (default-category fallback, proposed item, dedup verdict, job update, embedding after commit). It has no route yet: the planned MCP server (Phase 13, `docs/plans/mcp-server.md`, D112–D128) calls it with `channel = mcp`, and its edits land in the review queue (D117). Items it creates have `source_kind = mcp`; the review source line reads "shared by Dana via Claude (AI app)".

Non-session tokens are listed in `lib/token-prefixes.ts` (today `ing_`; Phase 13 adds its MCP prefixes). `session-auth` answers 401 for a bearer with a registered prefix on a route that doesn't accept it, without a session lookup. Prefixed tokens are minted and parsed by `lib/prefixed-token.ts`.

## Review (D106, D107)

- D96: proposed items are visible (list, get) only to callers with `item.publish` on the deck or to their creator; otherwise 404 (and `status=proposed` lists are 403). Search never returns them.
- `GET /decks/{id}/review` (≤ 50, newest first: `{ item, job, target? }`) and `GET /decks/{id}/review/count` need `item.publish`.
- `POST /items/{id}/publish { mode: 'new' | 'update', createCategory? }` runs in one transaction (`review.service`): `new` publishes the proposal; `update` copies its fields, categories and source onto the target and soft-deletes the proposal; a target that is no longer published (archived or deleted) is a 409, and the list leaves it out of `target`. `POST /items/{id}/discard` soft-deletes it, marks the job `discarded` and removes its uploads by tag after commit.
- Web: `/d/$slug/review` (`review/`): `ReviewCard` with the source line, entity chips, a duplicate/update banner with a client-side field diff, inline edit, Publish / Discard / Apply update / Publish as new. A "Review" link in the deck header, always shown to publishers ("Review · N" when proposals wait, D198); the empty queue links to "Your shares". A card held from auto-publish says why ("Not published directly: …", `review/held-line.ts`). The queue is excluded from the persisted cache.

## Share status (022, D194–D198)

- **Failure codes** (D194): a failed job carries `failure_code`, one of `content_expired`, `sharer_left`, `fetch_failed`, `unreadable_answer`, `assistant_unavailable`, `image_unavailable`, `unknown` (DB CHECK, `@pb/shared/ingest`). The worker picks it where the job fails (`ingest/failure-code.ts`); `error` keeps the detail for `GET /ingest/{id}`. Migration `0017_share_status` backfilled old failed rows from their `error` prefix. The web maps codes to sentences in `shares/failure-copy.ts`.
- **Log lines** (D195): a job that fails for good logs one `error` line "ingest job failed" with `{ jobId, deckId, channel, attempts, failureCode }`; a retried attempt logs `warn` "ingest attempt failed, will retry" with `{ jobId, attempts, failureCode }`. Neither carries shared text, URLs, titles or provider messages.
- **Shares API** (D196, `routes/my-shares.ts` → `shares.service`): `GET /decks/{id}/shares` lists the caller's own shares on the deck (share channels only, last 30 days, newest first, ≤ 50); `GET /shares/{id}` returns one. Only the sharer sees them (anyone else gets 404; publishers keep `GET /ingest/{id}`). `ShareSummary` has `state` (`processing | failed | in_review | published | not_added`), a content-free `preview` (title, host, photo count), `failureCode`, `canRetry`, `autoPublish`, the card (`{ id, title, deleted }`) and who reviewed it.
- **Retry in place** (D197): `POST /shares/{id}/retry` re-queues the same job (attempts reset, `retry_count + 1`, `retried_at`) when the caller is the sharer, it failed, its raw content is still kept, the sharer still has `item.create`, and it was retried fewer than 3 times. A retry takes a cap slot like a new share (`countByUserSince` also counts `retried_at`). 409 when not failed (a double tap), 410 `/problems/share-expired`, 422 `/problems/share-retry-limit`, 429.
- **Web** (D198): `/d/$slug/shares` ("Your shares", linked from the deck actions beside Paste for roles with `item.create`) and the "Sent" screen poll every 3 s (`SHARE_POLL_MS`) while something is processing. A failed row offers "Try again" or "Paste it again"; offline disables both.

## Auto-publish (022, D192–D193)

- **Setting** (D192): `decks.auto_publish_shares`, default off, on for personal decks (migration and `decksRepo`). Only owners and co-owners change it (`PATCH /decks/{id}`, `ownerRequired()`); deck settings show the switch to every admin, disabled for maintainers. ADR-058.
- **Gate** (D193, `ingest/auto-publish.ts`, bound in `worker.ts`): after the proposal and dedup, for share channels on decks with the setting, checked in order: the sharer's role has `item.publish` now → the extraction chose an existing category → the dedup verdict is `new` → `publishProposal()` (`review/publish-proposal.ts`, the same transaction review uses: D160 image check, `published` event with the sharer as actor and `via: 'ingest'`, job `published` with `reviewed_by` = sharer). After commit it enqueues the embedding and the link snapshot.
- **Outcomes** in `ingest_jobs.auto_publish`: `published`, or held in review as `held_not_publisher`, `held_needs_category`, `held_duplicate`, `held_duplicate_check_failed`, `held_publish_failed` (a thrown error; logged as a warning, never fails the share). `NULL` when the setting is off and for MCP and import jobs.

### Deviations from the 022 plan

- **Public page cache delay**: the worker can't purge the API's in-process page cache (D180), so a directly published card appears on a public deck's `/p/` pages within the 5-minute TTL.
- **`publishProposal` returns the published item id** and takes an optional `autoPublish` outcome, recorded on the job in the same transaction; `reviewTransaction(db)` builds the transactional repos once for review and the worker; `mergeIntoTarget` is split out of `review.service`.
- **Auto-publish is an optional handler dep** (`IngestHandlerDeps.autoPublish`). Its warnings read "ingest auto-publish failed, left in review" and "ingest auto-publish follow-up failed" (a failed enqueue after commit) and carry the error name, never its message.
- **Routes live in `routes/my-shares.ts`** (`routes/share.ts` already serves `/s/:id` previews).
- **Reviewer copy is separate from sharer copy**: "Not published directly: <reason>" on the review card; the sharer's row keeps its own wording.
- **One co-owner note** ("Only co-owners can change these settings.") under both deck switches, instead of one per switch; the auto-publish switch is its own component (`deck-admin/AutoPublishSwitch.tsx`) and shows on the personal deck too.
- **"Your shares" sits in the deck actions** (beside Paste), not the deck header: with Review always shown the header overflowed 360 px (smoke `web.spec.ts`). The header also tightens its gap and padding at ≤ 400 px, and its title can shrink (`min-width: 0`).
- **Test placement**: failure copy in `shares/share-state.test.ts`; auto-publish integration in `ingest-auto-publish.int.test.ts`; the `autoPublishShares` patch in `public-settings.int.test.ts`; the maintainer's disabled switch in `DeckSection.test.tsx` (a second admin can't sign in from e2e).

## Channels

- **Bulk import** (Phase 8): see [Bulk import](#bulk-import-phase-8-d189d191).

- **Android share target** (D98, ADR-045; separate PR `p5-share-target`): the service worker (`src/sw.ts`, `injectManifest`) answers the manifest's `share_target` POST to `/share`, keeps the form in IndexedDB (1 h) and redirects to the `/share` confirm screen (deck picker, thumbnails, "Send to Gobbit"). The deck page's **Paste** button opens the same screen empty. Caddy answers a POST that bypasses the SW with `303 /share?failed=1`.
- **iPhone Shortcut** (D99, ADR-046): a Shortcut posts to `/api/ingest` with an ingest token. Build and publish steps: `docs/shortcut/README.md`; `SHORTCUT_URL` (the iCloud link) is exposed by `/config` and linked from Settings.
- **Settings** (`/settings`, gear in the header): an intro ("Add cards from other apps") lists only the ways this server supports — the Shortcut when `SHORTCUT_URL` is set, email-in when it is on, and always plain `POST /api/ingest` with a Bearer token — then "Your tokens": list, create (optionally deck-bound) and revoke ingest tokens. A new token is shown once, with its email address when email-in is on.
- **Email-in** (D104, off by default): mail to `<token without ing_>@INGEST_EMAIL_DOMAIN` arrives through Resend Receiving. `POST /webhooks/resend/inbound` (plain Hono route, outside OpenAPI, registered only when `INGEST_EMAIL_DOMAIN`, `RESEND_WEBHOOK_SECRET` and `RESEND_API_KEY` are set) verifies the Svix signature, fetches the email and its attachments from the Resend API (`ingest/resend-inbound.ts`), maps subject → title, trimmed text body → text, first link → url, ≤ 3 images (`ingest/email-mapping.ts`), and submits with `channel = email`. Unknown/revoked tokens, ignored events and rejected shares answer 200 (no probing); Resend or DB errors answer 5xx so Resend retries.

## Bulk import (Phase 8, D189–D191)

- **Parser** (`@pb/shared/import`, zod-free, papaparse for CSV): `parseNotes(text, format)` for `lines` (one note per line; `title — body`, ` - ` or `: ` splits; a lone URL is a link card), `markdown` (headings become category names, list items and paragraphs become notes) and `csv` (header columns `title`, `body`, `url`, `category`, any case; BOM stripped). `detectFormat` goes by file extension, then content. Each row carries its source `line` and an `error` when it breaks a card limit. The same parser runs in the web preview and the CLI.
- **Import** (`POST /decks/{id}/imports { label, rows ≤ 100 }`, `item.publish`): `imports.service` runs `proposeDirect` per row, in order, on channel `import` (migration `0016_import_channel`) with `clientLabel = label`, so proposals land in review as "<label> (Imported)". Category names map to an existing category by id, else to a `newCategory` suggestion. No fetch, no LLM. The `import` cap is 150 rows a day per user, and `import` jobs neither count toward nor are held by the combined cap (`ingest/caps.ts`). A cap hit stops the loop and reports the rest as `failed` with `/problems/rate-limited`, unless it is the first row (429). `importInChunks` (shared) sends larger sets in requests of 100 and re-bases failure indexes.
- **Bulk publish** (`POST /decks/{id}/review/publish { ids ≤ 50 }`): `review.service.publishMany` publishes each `new` proposal through the single-publish path (one transaction and one `published` event each; the suggested category is created when the role has `category.create`). Possible duplicates and updates are skipped as `needs-decision`; cards that are not live proposals of the deck are skipped as `already-handled`. `GET /decks/{id}/review?source=<label>` filters the queue to one import in SQL; the count stays the deck total.
- **Web**: `/d/$slug/import` (lazy route; papaparse is a lazy-only budget marker), reached from **Import** in the deck header for owners and maintainers: paste or a `.txt/.md/.csv` file → format picker → preview (tick, edit, invalid rows unticked with the reason, new/existing category chip, more than 150 rows refused) → result (counts, failed rows by source line, "Review them" → `/d/$slug/review?source=<label>`). The review queue has a select mode (Select all shown, Publish selected) and a source chip with "Show all"; skipped cards are listed in an inline notice.
- **CLI**: `pnpm import:notes <file> --deck <slug> [--format] [--label] [--dry-run]` (`apps/api/scripts/import-notes.ts`, `GOBBIT_API_URL` + `GOBBIT_TOKEN`). Invalid rows are skipped and listed; it exits 1 when any row was not imported.

### Deviations from the 021 plan

- **CLI lives in `apps/api/scripts/`** (with its logic in `scripts/lib/import-notes-cli.ts`, next to the other API CLIs and inside the unit test glob) and uses the bearer `request` helper from `scripts/lib/api-cli.ts` instead of `@pb/api-client` (browser-oriented: same-origin `/api` base, cookies). The root script runs it with `tsx`, so relative file paths resolve from the repo root.
- **Combined-cap rule in `ingest/caps.ts`** (unit-tested there), not inline in `ingest.service`.
- **Chunking is shared** (`importInChunks` in `@pb/shared/import`), used by the web screen and the CLI.
- **Parser rules beyond the research list**: a spaced hyphen ` - ` also splits; list markers are stripped in `lines`; a URL-only title drops the scheme and `www.`, and a URL is removed from the title when it becomes the source; Markdown link-only list items become link cards; a CSV `url` column makes a link card, CSV `line` is the spreadsheet row number, and a CSV needs a `title` or `body` column.
- **A bad row refuses the whole request** (400 naming "Row N"); only cap hits give a partial result.
- **Link payload URL = `sourceUrl`** for imported link cards.
- **Bulk publish**: a 409 race on one card counts as `already-handled`; any other error aborts the rest of the batch (already published cards stay published).
- **Skipped-cards "toast" is an inline status notice** (stays until dismissed, lists each card with its reason), not the global undo toast.
- **Optimistic review cache updates cover every cached queue variant** (whole queue and per source) via `reviewListsFilter`.
- **Invalid preview rows start unticked** and can only be ticked once an edit fixes them; the import label is the file name, or "Pasted notes".

## Deviations from the Phase 5 plan

- **ADR numbers shifted by one** (045–048): ADR-044 was already taken by the OpenRouter gateway.
- **`/config.ingest.emailDomain`** (string | null) instead of an address: the address is per token.
- **The worker shares the API environment** (Compose `x-api-env` anchor): production `parseEnv()` needs the same vars, and ingestion needs the AI and Cloudinary keys.
- **No `ingest_jobs.deleted_at`**: jobs end `discarded` and are pruned by retention.
- **Extraction over OpenRouter too** (`ai/openai-chat-extractor.ts`), same provider order as Ask (ADR-044); the extractor takes the model per call so primary and escalation share a client.
- **An invalid escalation keeps the primary proposal**; a response without the tool call counts as invalid output; a sharer who lost access fails the job (`sharer_not_member`).
- **Dedup compares normalized source URLs in TypeScript** over same-host candidates; thresholds were not yet checked against real embeddings.
- **The publish body is optional** (`{ mode: 'new' }`); the diff covers title, text, link URL, source and entities.
- **The review queue has its own cache helpers** (not paginated, so not `removeFromPages`).
- **Email-in needs `RESEND_API_KEY`**: Resend's `email.received` webhook carries metadata only. No `email_id` dedupe yet; the token local part is case-sensitive.
- **The Shortcut ships as documented build steps** (a signed `.shortcut` can't be generated in CI); token and server are Import Questions, so the published link holds no secret.
- **No `pnpm test:ingest`** real-model injection check yet: prompt-injection handling is covered by `extract-prompt` unit tests and the fake extractor.
- **E2E** (`review`, `share`, `settings` specs) runs in CI's `e2e` job (Compose stack, every PR) and the post-deploy smoke workflow.
- **P5.9 (MCP readiness) is migration `0010_mcp_readiness`**, not part of `0009_ingest`: 0009 was already merged and deployed when the addendum landed. The down file recreates `source_kind` and `ingest_channel` without `mcp` (existing `mcp` items become `share`, `mcp` jobs are deleted).
- **`propose_card` accepts `null`** for its optional fields (`link`, `entities` and each list, `categoryIds`, `newCategory`): models send `"link": null` on photo cards, which failed both the call and its corrective retry (`unreadable_answer`). The `ingest job failed` line logs an invalid answer's zod issues as `detail` (paths and messages, never values), and extraction calls allow 2048 output tokens.
