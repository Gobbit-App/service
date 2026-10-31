# Research: Links from locked social hosts

Decisions continue the project-wide D numbering. Phase 7 reserves D156–D173. This feature owns **D166–D168**. They extend **ADR-055** (014) and add no ADR of their own.

## What happens today (after 014)

- **Server fetches**: Instagram, Facebook, Threads, TikTok, X and LinkedIn answer `safe-fetch` with a login wall, a consent page, a 429 or a 403.
  - Sometimes they return a generic OG title ("Instagram") and no image.
  - `normalize-raw` then falls back to the shared text (`fetch.fallback = 'shared_text'`).
- **Extraction** (`jobs/ingest.ts`):
  - It passes `sourceUrl` and `imagePublicId = raw.images[0]` to `validateProposal`.
  - If the model picks `image`, the card becomes an image card. The post URL survives only as `sourceUrl`, and the card no longer links anywhere.
  - If the model picks `link`, 014's ingest preview comes from `og`, which is empty or generic, so the card has no image although the member shared one.
- **014's snapshot job** fills the empty preview by fetching the page again, and gets the same login wall.
- **014's link check**: the same hosts would produce `403`/`429` (temporary) or a login page whose title differs from the stored one (`changed`), so every card would be flagged sooner or later.

## D166 — Locked-host registry

- **Decision**: `packages/shared/src/links/locked-hosts.ts` exported from `@gobbit/shared/links`. It is zod-free, so the web can import it without pulling in schemas:

  ```ts
  export const LOCKED_HOSTS = {
    'instagram.com': 'Instagram',
    'facebook.com': 'Facebook',
    'fb.watch': 'Facebook',
    'threads.net': 'Threads',
    'tiktok.com': 'TikTok',
    'x.com': 'X',
    'twitter.com': 'X',
    'linkedin.com': 'LinkedIn',
  } as const;

  /** The locked host for a URL (exact host or any subdomain), or null. */
  export function lockedHostOf(url: string): { host: string; label: string } | null;
  ```

  Matching:
  - The URL is parsed with `URL.canParse`/`new URL`; only `http:` and `https:` match.
  - The hostname is lowercased, a trailing dot is removed, and it matches when it equals a listed host or ends with `.` + a listed host (`m.facebook.com`, `www.instagram.com`, `vm.tiktok.com`).
  - It looks at the URL as stored. Redirects are not followed (short links other than `fb.watch` are out of scope).
- **Rationale**:
  - One list for the API (ingest, snapshot, checks) and the web (badge), so they can't drift (constitution II).
  - Suffix matching on a dot boundary covers the hosts' mobile and short subdomains without matching look-alikes (`notinstagram.com`).
- **Alternatives considered**:
  - **Detect login walls at fetch time** (status codes, page fingerprints): fragile and changes without notice; the hosts are few and well known.
  - **A database table or deck setting**: nobody needs to edit it at runtime; a code change is reviewed and tested.

## D167 — Ingest and the editor use what the member shared

- **Decision (ingest)**: `validateProposal` gains `ctx.lockedHost` and `ctx.sharedText` (the raw shared text). `jobs/ingest.ts` sets them from `lockedHostOf(sourceUrl)` and `job.raw.text`. When `ctx.lockedHost` is set and there is a URL:
  - The type is forced to `link`, whatever the model chose. (`text` is also turned into `link`, since the URL is the point of the share.)
  - The preview is built as:
    - `title`: the OG title when it isn't just the host's label or site name, else the extracted card title.
    - `description`: the OG description when present, else the shared text, trimmed to `LOCKED_CAPTION_MAX = 500` code points with `truncateAtSentence`.
    - `publicId`: `ctx.imagePublicId` (the first shared image) when present. It is already an `ingest` asset of the same deck (012, D157), so the D160 reference rule accepts it and writes `width`/`height`.
    - `image` is left out when `publicId` is set, so 014's job has nothing to copy.
  - The extractor-off direct draft path applies the same rules.
- **Decision (editor)**:
  - The link editor gets an "Add photo" control in its preview area, next to "Fetch preview".
  - It reuses `useImageUpload` and the same signed upload as image cards (D133), and writes the result to `preview.publicId`. "Remove photo" clears it.
  - It is available for every link card, not only locked hosts.
- **Decision (server-owned rule, refines D163)**:
  - On update, when the URL or `preview.image` changes, `items.service` drops `preview.publicId`/`width`/`height` **only if** the asset's `source` is `link_snapshot`.
  - A photo with source `editor` or `ingest` is kept.
  - The 014 snapshot job skips the copy when `preview.publicId` is already set, whatever its source.
- **Rationale**:
  - For these posts, what the member shared is the only content the server can see. The share sheet gives the caption as text and the post image as a file.
  - Forcing `link` keeps the card pointing at the post. The image is still shown, as the preview.
  - Reusing the image card upload means no new upload path and no new asset kind.
- **Alternatives considered**:
  - **Keep the model's choice and add the URL to image cards**: image payloads have no URL field, and adding one duplicates the link card.
  - **Store the caption in the card body**: the extractor already writes a body. The caption is the source, the body is the summary, and both are useful.
  - **Scrape through the host's oEmbed APIs**: they need app tokens and review, and they change terms often (constitution VII).

## D168 — Rendering, snapshot and checks for locked hosts

- **Decision**:
  - **Card**: `LinkCard` shows a small label with the host's display name ("Instagram") in place of the bare domain line when `lockedHostOf(url)` matches. Image order: the stored `preview.publicId` (`CloudImage`), else the remote `preview.image`, else none (unchanged from 014).
  - **Snapshot job** (014, D163), for locked hosts:
    - If the preview is empty, it tries `fetchPreview` **once**. A generic result (title equal to the label or site name, no description, no image) is discarded.
    - Failures are not retried and not logged above `debug`.
    - It never copies a remote image when `preview.publicId` is set.
  - **Link checks** (014, D164):
    - The sweep's due query still selects locked-host cards, so each one gets a row, but it does not probe them.
    - It writes `status = 'unchecked'`, `consecutive_failures = 0`, `http_status`/`error`/`title_seen` null, and `flagged_at` and `dismissed_at` null. `next_check_at` is set to now + 30 days ± 3 days.
    - If a host is removed from the list later, its cards are probed at their next due date.
    - `POST /items/{id}/link-check` answers 422 `/problems/validation`, "Links to Instagram can't be checked automatically", without a probe and without using the rate limit.
- **Rationale**:
  - The label tells readers what to expect when they tap the link.
  - Writing `unchecked` rows keeps the sweep's "due" query simple and records why a link has no health, which helps Phase 10's staleness watcher.
  - Using no request at all for checks is polite to hosts that reject automated access.
- **Alternatives considered**:
  - **Filter locked hosts out in the due query**: the query is SQL, and the list lives in TypeScript. Duplicating it in SQL invites drift, and the batch is small.
  - **Check with a browser user agent or a headless browser**: this goes against the hosts' terms and against the outbound rules (constitution IV).

## Other choices (no new D-number)

- **No migration**: `unchecked` is already in 014's `link_check_status` enum. The preview fields are already in 014's link payload.
- **Constants**: `LOCKED_CAPTION_MAX = 500` lives in `@gobbit/shared/links` next to the 014 constants.
- **Search**: the caption in `preview.description` is searchable like any link preview (014's `item_search_text` keeps strings and only strips `preview.publicId`).
