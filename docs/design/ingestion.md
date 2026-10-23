# Ingestion (Phase 5)

_Overview: [architecture.md](../architecture.md). Decisions: [adr.md](../adr.md)._

Anything shared into Gobbit (Android share sheet, iPhone Shortcut, paste box, optionally email) becomes a **proposed** card that a publisher reviews. The agent never publishes. Decisions D92–D111 (D84–D91 belong to the Phase 12 custom-domains plan).

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
- Web: `/d/$slug/review` (`review/`): `ReviewCard` with the source line, entity chips, a duplicate/update banner with a client-side field diff, inline edit, Publish / Discard / Apply update / Publish as new. A "Review · N" pill in the deck header for publishers. The queue is excluded from the persisted cache.

## Channels

- **Android share target** (D98, ADR-045; separate PR `p5-share-target`): the service worker (`src/sw.ts`, `injectManifest`) answers the manifest's `share_target` POST to `/share`, keeps the form in IndexedDB (1 h) and redirects to the `/share` confirm screen (deck picker, thumbnails, "Send to Gobbit"). The deck page's **Paste** button opens the same screen empty. Caddy answers a POST that bypasses the SW with `303 /share?failed=1`.
- **iPhone Shortcut** (D99, ADR-046): a Shortcut posts to `/api/ingest` with an ingest token. Build and publish steps: `docs/shortcut/README.md`; `SHORTCUT_URL` (the iCloud link) is exposed by `/config` and linked from Settings.
- **Settings** (`/settings`, gear in the header): an intro ("Add cards from other apps") lists only the ways this server supports — the Shortcut when `SHORTCUT_URL` is set, email-in when it is on, and always plain `POST /api/ingest` with a Bearer token — then "Your tokens": list, create (optionally deck-bound) and revoke ingest tokens. A new token is shown once, with its email address when email-in is on.
- **Email-in** (D104, off by default): mail to `<token without ing_>@INGEST_EMAIL_DOMAIN` arrives through Resend Receiving. `POST /webhooks/resend/inbound` (plain Hono route, outside OpenAPI, registered only when `INGEST_EMAIL_DOMAIN`, `RESEND_WEBHOOK_SECRET` and `RESEND_API_KEY` are set) verifies the Svix signature, fetches the email and its attachments from the Resend API (`ingest/resend-inbound.ts`), maps subject → title, trimmed text body → text, first link → url, ≤ 3 images (`ingest/email-mapping.ts`), and submits with `channel = email`. Unknown/revoked tokens, ignored events and rejected shares answer 200 (no probing); Resend or DB errors answer 5xx so Resend retries.

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
