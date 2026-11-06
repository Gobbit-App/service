# Research: Share visuals

Decisions continue the project-wide D series (D343–D353). Each has the choice, why, and what else was weighed.

## D343 — An honest crawler identity for preview fetches

**Decision**: page fetches for previews and shares (ingest, the `link-snapshot` job, the editor's "Fetch preview"), host lookups (D345) and preview image downloads send

```text
Mozilla/5.0 (compatible; GobbitBot/1.0; +https://github.com/Gobbit-App/service/blob/main/docs/crawler.md)
```

`docs/crawler.md` says what the bot is, which requests it makes (only links a member shared or a card holds, one page at a time, no logins, no cookies, no scripts, nothing followed from the page) and how to reach the project. Link checks (`link-check-sweep`, "Check again") keep the current browser-like identity (FR-002): a site that refuses crawlers would otherwise see its links flagged dead, which is a worse outcome than a missing picture. The identity is one constant per kind in `fetch/user-agents.ts`, chosen through a `SafeFetchOptions.identity` option (`crawler` default, `browser` for link checks).

**Rationale**: the `Mozilla/5.0 (compatible; <Name>/<version>; +<url>)` form is the established crawler convention (it is how sites tell link previewers from people). The spec's evidence is that Instagram answers a self-identified previewer with the post's OG tags and the browser-like identity with an empty shell. The app never names another company's crawler: impersonation would break the honesty FR-001 asks for and the hosts' rules.

**Alternatives**: keep the browser-like identity (the reported failure); copy a known previewer's identity (dishonest, refused); a page on the app domain instead of the repository (needs a new route and has to exist on every deployment; the public repository is stable and already the project's home).

**Production check**: whether Instagram answers this identity from the production network is checked once after deploy (quickstart §5). If it walls the server, User Story 1 falls back to 015 (spec, Assumptions) and the `link_preview.built` discard rate per host (D352) shows it.

## D344 — Image candidates, in one ordered list

**Decision**: `fetch/page-images.ts` collects the page's image candidates in FR-010 order, each `{ url, source }`:

| Order | `source` | Read from |
|-------|----------|-----------|
| 1 | `og` | every `meta[property=og:image]` / `og:image:url`, in document order |
| 2 | `og_secure` | `og:image:secure_url` |
| 3 | `twitter` | `meta[name=twitter:image]`, `twitter:image:src` |
| 4 | `structured_data` | `script[type="application/ld+json"]`: `image` (string, `{ url }`, or array of these) or `thumbnailUrl` on the top object or any `@graph` entry; a script over 100 KB or with invalid JSON is skipped |
| 5 | `image_src` | `link[rel=image_src]` |
| 6 | `video_poster` | `video[poster]` |
| 7 | `article` | images in Readability's article content (below) |

- Every URL is resolved against the final page URL; only absolute `http(s)` URLs no longer than `LINK_PREVIEW_IMAGE_URL_MAX` are kept (FR-012); data URIs and other schemes are dropped; duplicates keep their first position.
- The list is capped at `LINK_IMAGE_CANDIDATES_MAX` = 5.
- **Article images (FR-011)**: an `img` counts when it states its size, either `width` (and optionally `height`) attributes as plain integers or a `srcset` with `w` descriptors (the largest `w`, and that entry's URL is the candidate). It must be at least `LINK_ARTICLE_IMAGE_MIN_PX` (default 300) wide and, when a height is stated, at least half that tall. Its `class`, `id`, `alt` or file name must not match `icon|logo|avatar|emoji|sprite|spacer|pixel|badge|gravatar|tracking`. Of those, the widest comes first (ties keep document order); only one article image enters the list.
- Readability already parses the page for its text (`extract-page.ts`); the article HTML comes from the same `parse()` call, so there is no second parse.

**Rationale**: one place that knows where images live, used by every caller (D346). The order is the spec's; the stated-size rule keeps icons and pixels out without downloading anything at build time.

**Alternatives**: download each in-article image to measure it (extra outbound requests on every build, refused); a metadata library such as `metascraper` or `open-graph-scraper` (new dependencies with their own fetchers that would bypass `safe-fetch`; `linkedom` + `@mozilla/readability`, which we already have, read these tags in a few lines).

## D345 — Host lookups through oEmbed, key-free only

**Decision**: `fetch/lookup-hosts.ts` is the one list of lookup hosts (FR-008):

| Host (and subdomains on a dot boundary) | Endpoint |
|------------------------------------------|----------|
| `youtube.com`, `youtu.be` | `https://www.youtube.com/oembed?format=json&url=<url>` |
| `tiktok.com` | `https://www.tiktok.com/oembed?url=<url>` |
| `vimeo.com` | `https://vimeo.com/api/oembed.json?url=<url>` |

- Each is a public oEmbed endpoint that needs no key or account. Instagram and Facebook oEmbed need an app token and are not on the list (FR-007, US2 AS4); a unit test pins that.
- The lookup is made only when the page gave no usable image or no title, or the page fetch failed, and at most once per preview build.
- It goes through a new `createSafeJsonFetch` in `safe-fetch.ts`: the same guarded client (scheme, port and address checks on every hop, redirect limit), `accept: application/json`, a body cap of `LINK_LOOKUP_MAX_BYTES` = 64 KB and a timeout of `LINK_LOOKUP_TIMEOUT_MS` (default 2500 ms, env-tunable).
- The answer is parsed with a small zod schema (`title`, `thumbnail_url`, `author_name`, all optional strings); anything else counts as `empty`.
- A lookup's thumbnail enters the candidate list (D344) as `host_lookup`, after the page's own candidates. Its title fills the title when the page had none.
- A failure only means less preview (FR-009). It is logged (D352), never thrown.

**Rationale**: oEmbed is the documented, stable way these hosts share a title and thumbnail. It returns JSON, so `createSafeFetch`'s HTML mode can't read it; a JSON mode on the same guarded client keeps ADR-048 ("outbound only through `safe-fetch`").

**Alternatives**: scrape the host's own page harder (unreliable, against their rules); `noembed.com` or similar aggregators (a third party in the middle that sees every shared URL); the YouTube Data API (needs a key, against AI-optional, constitution VII).

## D346 — One preview builder for every caller

**Decision**: `fetch/build-preview.ts` exports `buildLinkPreview(deps, url)`. It fetches the page once through `safeFetch`, extracts it (`extractPage`), collects candidates (D344), asks the lookup host when D345 allows, applies the locked-host rule (D347) and returns:

```ts
interface PreviewBuild {
  page: ExtractedPage | null;            // ingest still needs the text for the model
  fetch: { status; finalUrl; ms; error }; // as today's FetchOutcome
  preview: LinkPreview | null;           // title, description, image = candidates[0]
  candidates: string[];                  // ordered image URLs, preview.image first
  decision: PreviewDecision;             // D352, logged by the caller with its ids
}
```

Callers:

- **Ingest**: `normalizeRaw` uses it. It stores `linkPreview` and `imageCandidates` on the normalized source (data-model.md) and passes the decision to the `link_preview.built` event with the `jobId`.
- **Editor**: `link-preview.service` uses it and caches the whole build (its LRU, as today); the route still answers `{ preview }` only.
- **Snapshot job**: `link-snapshot` uses it when it has to look (D349).

`toLinkPreview` and `fetchLinkPreview` in `fetch/link-preview.ts` fold into the builder. `toLinkPreview` stays as the pure page → preview step, now taking the candidates.

**Rationale**: the spec requires the same rules everywhere (FR-008, FR-010). Today three callers share `fetchLinkPreview` but ingest builds its preview separately from `og`. One builder removes that drift and gives one place to record the decision.

**Alternatives**: add the new rules to each caller (three copies of the lookup and discard logic).

## D347 — Locked hosts: use a real preview, discard generic ones whole (revises D167/D168)

**Decision**:

- `isGenericLockedPreview` (in `fetch/locked-host-preview.ts`) now discards a locked host's preview whenever its title is generic. 015 discarded only a generic title with nothing else; a login wall usually also carries the site logo and a "log in to see" description, so the whole preview goes, image included.
- A title is generic when it only names the site (D167's test), is a login or sign-up wall, or matches a known "unavailable" page (`LOCKED_UNAVAILABLE_TITLES`: "page not found", "content unavailable", "this page isn't available", "post isn't available", "sorry, this page isn't available", compared case-insensitively after the site name and punctuation are removed). The reason is recorded: `login_wall`, `unavailable` or `generic`.
- A preview with a real title is used like any other host's (FR-003). The rule runs inside the builder, so ingest, the job and the editor agree.
- In `extract-validate.ts` `lockedPreview`:
  - the member's caption wins over the page description (FR-004 flips 015's order);
  - the member's shared image stays the image (unchanged);
  - the page title fills the title when it is real (unchanged);
  - the page's remote image is used only when the share had none (unchanged).
- The snapshot job copies a locked host's preview image like any link's (FR-005). 015's one-try rule stays for requeues after an edit (no requeue for locked hosts). Link checks for locked hosts stay unprobed (FR-006).

**Rationale**: with an honest identity, locked hosts can answer with a real preview. The only thing that must still be refused is a wall or a wrong page, and their title gives them away.

**Alternatives**: drop the locked-host special case altogether (login walls would become cards titled "Instagram"); compare images against known logo URLs (they change, and titles already catch these pages).

## D348 — Title honesty

**Decision**:

- **Prompt**: two rules in the extract system prompt.
  - "When <page_title> is a real title of the content, base the card title on it."
  - "When the source has no real title and no text beyond the URL, do not guess what the content is: title the card with the site's name and say in the body only that its content couldn't be read."
- **Validator**: for a locked host with neither a real page title nor a caption, `validateProposal` replaces the model's title and body:
  - title `<Label> link`, e.g. "Instagram link";
  - body `Shared from <Label>; its content couldn't be read.`;
  - no preview description.
- Ordinary hosts rely on the prompt rule: their page text, if any, is real content.

**Rationale**: the reported card ("Instagram Reel by User") was the model filling a gap. For locked hosts the gap is certain and checkable, so the code closes it rather than trusting the model. Elsewhere the model has real text to work from.

**Alternatives**: prompt only (the reported failure shows the model fills gaps anyway); leave the body empty (the card would show nothing at all; a short statement is what FR-016 allows).

## D349 — Snapshot job: candidates, tries, and dropping a dead image

**Decision**:

- **Where the candidates come from**: the job takes them from its data (`LinkSnapshotJob.candidates`, sent by ingest from the normalized source). Otherwise it builds the preview once (D346), when the preview is empty, when a lookup is due (D350), or when the first copy fails and it has no candidates yet. So a share's host lookup is never repeated by its snapshot (spec edge case).
- **How many tries**: up to `LINK_IMAGE_TRIES` (default 3, env-tunable) candidates are tried in order, the card's current `preview.image` first.
- **Image-level failures** move on to the next candidate:
  - `http_error`, `not_image`, `too_large`, `blocked`, `timeout`;
  - `too_small`: the stored copy is narrower than `LINK_IMAGE_MIN_STORED_PX` (default 200) or shorter than half that. The too-small asset stays unreferenced and `media-sweep` removes it after 7 days (ADR-054).
- **Storage failures stop the job**: `upload_failed`, or `unavailable` when no store is configured. The card keeps its remote image as today, to be retried by the next write or a rerun.
- **On success** `preview.image` becomes the candidate that worked, with its `publicId`, `width` and `height`.
- **When every tried candidate failed at image level**, `preview.image` is removed (FR-013) and the card is stamped (D350), so it is not retried in a loop.

**Rationale**: a remote image that can't be downloaded today usually shows broken in the reader too. Dropping it beats a broken picture. Storage outages are ours, not the image's, so they must not cost the card its picture.

**Alternatives**: always keep the remote image (FR-013 forbids); retry the same URL (pg-boss already retries the job on throws; image refusals are deterministic).

## D350 — Server-owned markers on the link preview, no migration

**Decision**: two optional, server-owned fields on `LinkPayload.preview` (jsonb, so no schema change):

- **`imageLookup`**: integer, the image-rules version the job last looked under (`LINK_IMAGE_RULES_VERSION` = 1 for 041).
  - The job writes it whenever it looked for or tried an image, found or not.
  - A card whose preview has a title or description but no image and no `publicId` needs the job only while `imageLookup` is below the current version (FR-014, "once per card").
- **`imageRemoved`**: `true` when a member pressed "Remove photo" (`publicId: null` in a write).
  - `link-preview-fields` sets it, and clears it when a member adds a photo or changes the URL.
  - The job and the pass never add an image to such a card (FR-014, US4 AS2).

Both behave like `publicId`/`width`/`height`: a client value is ignored, the stored value carries over, and the editor never sends them (its `linkPayload` drops non-string preview fields). They are left out of the editor lookup DTO (`linkPreviewSchema`) and the public DTO (`toPublicItem`).

**Rationale**: the state belongs to the card and dies with it. A jsonb field needs no migration, and the spec assumes none. A rules version lets a future change re-look at cards once more by bumping one constant.

**Alternatives**: a `link_previews` table (a migration and a join for one integer); reuse `link_checks` (different job, different lifecycle); a boolean "looked" (no way to re-look under newer rules).

## D351 — The one-time pass

**Decision**: `pnpm links:image-backfill` (`apps/api/scripts/links-image-backfill.ts`) enqueues `link-snapshot` for each card that qualifies:

- a live link card (`proposed` or `published`, not deleted) with a title or description;
- no `preview.image` and no `preview.publicId`;
- `imageLookup` missing or below the current version, and no `imageRemoved`;
- no `item_events` row of kind `updated` by a user (`actor_user_id` not null) whose `changes` include `payload`. Members' image removals from before 041 left no marker, so any member payload edit counts as a member choice (conservative: such cards keep their state).

**Spreading the load (FR-015)**: each card's job gets `startAfter` = (its position among the same host's cards) × `LINK_IMAGE_BACKFILL_HOST_SPACING_S` (default 60 s, a script flag). So each host sees at most one request a minute from the pass, while different hosts run in parallel. The script reads 100 rows a batch, like the 014 backfill.

**Rerunning is safe**: jobs are singletons per card (`singletonKey`), and stamped cards no longer qualify.

**Rationale**: the existing backfill pattern, with the spacing the spec asks for, and an over-cautious member-choice test for cards that predate the marker.

**Alternatives**: a sweep cron (the pass is one-time; new cards are enqueued on write); spreading by a global rate only (one host with many cards would still get a burst).

## D352 — Decision events

**Decision**: four named events (plan § Accountability). They carry ids, the host name and closed-set values only, never URLs, titles, captions or descriptions (FR-017).

| Event | Logged by |
|-------|-----------|
| `link_preview.built` | the caller of the builder (`caller` = `ingest`, `snapshot`, `editor`), with `imageSource`, `titleSource`, `lookup` and, when discarded or empty, `reason`; `lockedHost` names the locked host for FR-018 |
| `link_preview.lookup` | the builder, one per host lookup |
| `link_preview.applied` | ingest, after validation: whether the card's image came from the member's share, the page or nowhere, and whether its description came from the caption, the page or nowhere |
| `link_snapshot.image` | the job, per run that tried images: `copied`, `dropped`, `kept`, `none` or `member_choice`, with the number of tries and the last failure reason |

The pass prints a summary line and logs `link_snapshot.backfill` with counts (operator action: who ran it is the operator; the script has no user).

**Rationale**: FR-017/FR-018. The per-host discard rate is the signal that a host started walling the crawler.

## D353 — A committed page corpus for SC-002 / SC-003

**Decision**: the page fixtures and the corpus test:

- **Fixtures** live in `apps/api/src/fetch/__fixtures__/preview-pages/`: 16 small saved HTML files, written by hand to the shapes real sites use (no copied third-party content), plus a `manifest.json` that names each page's expected image and whether today's OG-only rule finds it.
- **Shapes covered**: OG, several OG, secure OG, Twitter only, JSON-LD (string, object, array, `@graph`), `image_src`, video poster, article image with `width`/`height`, with `srcset`, an icon-only page, a pixel-only page, a relative URL, a data URI, and a page with no image.
- **`page-images.corpus.test.ts`** (unit) checks three things:
  - ≥ 90% of pages that carry an image get it (SC-002);
  - every page that had an OG-only preview keeps the same image (SC-003);
  - the no-image pages get none.
- **oEmbed answers** are saved JSON fixtures too; tests never call real sites.

**Rationale**: SC-002/SC-003 need a fixed set to measure against; fixtures written to the patterns keep the public repository free of copied pages.
