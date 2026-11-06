import {
  LINK_IMAGE_CANDIDATES_MAX,
  LINK_PREVIEW_TITLE_MAX,
  type LinkPreview,
} from '@gobbit/shared';
import { lockedHostOf } from '@gobbit/shared/links';
import type { Logger } from '../lib/logger';
import type { ExtractedPage, ExtractOptions } from './extract-page';
import { clipLine, toLinkPreview } from './link-preview';
import { lockedPreviewVerdict } from './locked-host-preview';
import { lookupHostOf, lookupPreview } from './lookup-hosts';
import type { ImageCandidate } from './page-images';
import {
  PREVIEW_EVENTS,
  previewHost,
  type ImageSource,
  type LookupState,
  type PreviewCaller,
  type PreviewOutcome,
  type PreviewReason,
  type TitleSource,
} from './preview-events';
import type { SafeFetch, SafeJsonFetch } from './safe-fetch';

export interface BuildDeps {
  safeFetch: SafeFetch;
  /** Null: no host lookups (tests, or turned off). */
  fetchJson: SafeJsonFetch | null;
  extract: (html: string, url: string, opts?: ExtractOptions) => ExtractedPage;
  articleMinPx: number;
}

export interface PreviewDecision {
  outcome: PreviewOutcome;
  reason?: PreviewReason;
  host: string | null;
  /** The locked host's label (e.g. `Instagram`), for FR-018. */
  lockedHost: string | null;
  imageSource: ImageSource | 'none';
  titleSource: TitleSource;
  lookup: LookupState;
  ms: number;
}

export interface PreviewBuild {
  /** Ingest still needs the page text for the model. */
  page: ExtractedPage | null;
  fetch: { status: number | null; finalUrl: string | null; ms: number; error: string | null };
  preview: LinkPreview | null;
  /** Ordered image URLs, `preview.image` first. */
  candidates: string[];
  decision: PreviewDecision;
}

type LookupLog = Pick<Logger, 'info' | 'warn'>;

function extractSafely(deps: BuildDeps, html: string | null, url: string): ExtractedPage | null {
  if (html === null) return null;
  try {
    return deps.extract(html, url, { articleMinPx: deps.articleMinPx });
  } catch {
    return null;
  }
}

function pageTitleSource(page: ExtractedPage | null): TitleSource {
  if (clipLine(page?.og.title, LINK_PREVIEW_TITLE_MAX)) return 'og';
  if (clipLine(page?.title, LINK_PREVIEW_TITLE_MAX)) return 'title_tag';
  return 'none';
}

/**
 * D346: the one link preview builder (ingest, editor, snapshot). Fetches the page once, reads its
 * image candidates (D344), applies the locked-host rule (D347) and asks the lookup host when
 * D345 allows. Logs `link_preview.lookup`; the caller logs `link_preview.built` with its ids.
 * Never throws.
 */
export async function buildLinkPreview(
  deps: BuildDeps,
  url: string,
  log?: LookupLog,
): Promise<PreviewBuild> {
  const started = Date.now();
  const host = previewHost(url);
  const locked = lockedHostOf(url);

  let fetched: PreviewBuild['fetch'];
  let html: string | null = null;
  try {
    const result = await deps.safeFetch(url);
    fetched = {
      status: result.status,
      finalUrl: result.finalUrl,
      ms: result.ms,
      error: result.error,
    };
    html = result.error ? null : result.html;
  } catch (err) {
    fetched = {
      status: null,
      finalUrl: null,
      ms: Date.now() - started,
      error: `fetch_failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
  const page = extractSafely(deps, html, fetched.finalUrl ?? url);

  const decide = (
    over: Partial<PreviewDecision> & Pick<PreviewDecision, 'outcome'>,
  ): PreviewDecision => ({
    host,
    lockedHost: locked?.label ?? null,
    imageSource: 'none',
    titleSource: 'none',
    lookup: 'skipped',
    ...over,
    ms: Date.now() - started,
  });

  // D347: a wall or a missing page on a locked host is discarded whole.
  if (locked && page) {
    const verdict = lockedPreviewVerdict(page.og.title ?? page.title, locked);
    if (verdict !== 'real') {
      return {
        page,
        fetch: fetched,
        preview: null,
        candidates: [],
        decision: decide({ outcome: 'discarded', reason: verdict }),
      };
    }
  }

  const images: ImageCandidate[] = [...(page?.images ?? [])];
  let title = page ? (page.og.title ?? page.title) : null;
  let titleSource = pageTitleSource(page);
  let lookup: LookupState = 'skipped';

  // D345: one lookup when the page alone can't give a title or an image.
  const lookupHost = lookupHostOf(url);
  if (lookupHost && deps.fetchJson && (!page || titleSource === 'none' || images.length === 0)) {
    const found = await lookupPreview({ fetchJson: deps.fetchJson, log }, lookupHost, url);
    lookup = found.outcome;
    if (found.outcome === 'ok') {
      if (
        found.image &&
        images.length < LINK_IMAGE_CANDIDATES_MAX &&
        !images.some((i) => i.url === found.image)
      ) {
        images.push({ url: found.image, source: 'host_lookup' });
      }
      if (titleSource === 'none' && found.title) {
        title = found.title;
        titleSource = 'host_lookup';
      }
    }
  }

  const preview = toLinkPreview(
    { title, og: page?.og ?? { title: null, description: null, image: null, siteName: null } },
    images[0]?.url ?? null,
  );
  if (!preview) {
    return {
      page,
      fetch: fetched,
      preview: null,
      candidates: [],
      decision: decide({ outcome: 'none', reason: page ? 'nothing' : 'fetch_failed', lookup }),
    };
  }
  return {
    page,
    fetch: fetched,
    preview,
    candidates: images.map((i) => i.url),
    decision: decide({
      outcome: 'preview',
      imageSource: preview.image ? (images[0]?.source ?? 'none') : 'none',
      titleSource: preview.title ? titleSource : 'none',
      lookup,
    }),
  };
}

/** D352: the caller logs the build with its ids (`jobId`, `itemId`, `requestId`, `deckId`). */
export function logPreviewBuilt(
  log: Pick<Logger, 'info' | 'warn'>,
  caller: PreviewCaller,
  decision: PreviewDecision,
  ids: Record<string, string | null | undefined>,
): void {
  const fields = { event: PREVIEW_EVENTS.built, caller, ...ids, ...decision };
  if (decision.outcome === 'discarded') log.warn(fields, 'link preview discarded');
  else log.info(fields, 'link preview built');
}
