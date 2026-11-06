# Contract: preview builder and image candidates

## `collectImageCandidates(document, pageUrl, opts)` (`fetch/page-images.ts`)

```ts
type ImageSource = 'og' | 'og_secure' | 'twitter' | 'structured_data' | 'image_src' | 'video_poster' | 'article' | 'host_lookup';
interface ImageCandidate { url: string; source: ImageSource }
export function collectImageCandidates(doc: Document, pageUrl: string, opts: { articleHtml?: string | null; articleMinPx: number }): ImageCandidate[];
```

- Order, filters and caps are as in research D344.
- The result is deduplicated by URL, keeps the first source, and holds at most `LINK_IMAGE_CANDIDATES_MAX` entries.

`extractPage` adds `images: ImageCandidate[]` to `ExtractedPage`. `og.image` stays for callers that read it.

## `buildLinkPreview(deps, url)` (`fetch/build-preview.ts`)

```ts
interface BuildDeps {
  safeFetch: SafeFetch;
  fetchJson: SafeJsonFetch | null; // null → no lookups (tests, or off)
  extract: typeof extractPage;
  articleMinPx: number;
}
type PreviewOutcome = 'preview' | 'none' | 'discarded';
type PreviewReason = 'generic' | 'login_wall' | 'unavailable' | 'fetch_failed' | 'nothing';
interface PreviewDecision {
  outcome: PreviewOutcome;
  reason?: PreviewReason;
  host: string | null;
  lockedHost: string | null; // label, e.g. 'Instagram'
  imageSource: ImageSource | 'none';
  titleSource: 'og' | 'title_tag' | 'host_lookup' | 'none';
  lookup: 'ok' | 'empty' | 'failed' | 'skipped';
  ms: number;
}
interface PreviewBuild {
  page: ExtractedPage | null;
  fetch: { status: number | null; finalUrl: string | null; ms: number; error: string | null };
  preview: LinkPreview | null;
  candidates: string[];
  decision: PreviewDecision;
}
export function buildLinkPreview(deps: BuildDeps, url: string, log?: Logger): Promise<PreviewBuild>;
```

Steps:

1. Fetch once (`safeFetch(url)`).
2. On HTML, extract the page and read its candidates. Otherwise `page = null`.
3. Locked host: if the title is generic (`lockedPreviewVerdict` → `generic` | `login_wall` | `unavailable`), return `preview = null`, `candidates = []`, `outcome = 'discarded'`. No lookup is made: locked hosts are never on the lookup list.
4. If the host is on the lookup list and (fetch failed or no title or no candidate), call `lookupPreview` once. Its thumbnail is appended as `host_lookup`, and its title is used only if the page had none.
5. `preview = toLinkPreview({ title, og.description, image: candidates[0] })`, clipped to the `LINK_PREVIEW_*_MAX` limits. If it is empty, return `null` with `outcome = 'none'` and reason `fetch_failed` or `nothing`.
6. The builder logs `link_preview.lookup` (when made). The caller logs `link_preview.built` with its ids.

The builder never throws on fetch, lookup or parse failures.

## `lockedPreviewVerdict(title, match)` (`fetch/locked-host-preview.ts`)

```ts
export function lockedPreviewVerdict(title: string | null | undefined, match: LockedHostMatch): 'real' | 'generic' | 'login_wall' | 'unavailable';
```

- **`generic`**: empty, or only the site name (D167 test).
- **`login_wall`**: contains any of the `WALL_WORDS`.
- **`unavailable`**: after removing the site name and punctuation, the title matches a `LOCKED_UNAVAILABLE_TITLES` phrase.

`isGenericLockedTitle` keeps its meaning (≠ `real`) for existing callers.

## Snapshot job (`jobs/link-snapshot.ts`)

The handler's dependencies change. `fetchPreview` is replaced by `buildPreview: (url) => Promise<PreviewBuild>`, and `imageTries` and `minStoredPx` are added. The behaviour follows research D349 and the state diagram in data-model.md. `link_snapshot.image` is logged once per run that tried images or met `imageRemoved`.
