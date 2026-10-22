import type { LinkCheckRow } from '@pb/db';
import {
  LINK_CHECK_BATCH,
  LINK_CHECK_DEAD_AFTER,
  LINK_CHECK_HOST_PARALLEL,
  LINK_CHECK_INTERVAL_DAYS,
  LINK_CHECK_JITTER_DAYS,
  LINK_CHECK_RETRY_DAYS,
  LINK_CHECK_TEXT_MAX,
  type LinkCheckStatus,
} from '@pb/shared';
import { lockedHostOf } from '@pb/shared/links';
import type { ExtractedPage } from '../fetch/extract-page';
import { classify, normalizedTitle, type LinkProbeClass } from '../fetch/link-status';
import type { SafeFetch, SafeFetchResult } from '../fetch/safe-fetch';
import { lineSink } from '../lib/logger';
import type { DueLink, LinkCheckWrite, LinkChecksRepo } from '../repositories/link-checks.repo';

const DAY_MS = 86_400_000;

/** What one probe saw: the guarded fetch result and the page title (OG title, else `<title>`). */
export interface LinkProbe {
  result: Pick<SafeFetchResult, 'status' | 'error'>;
  title: string | null;
}

export type ProbeLink = (url: string) => Promise<LinkProbe>;

/** The link to check: its URL, the stored preview title and the previous check row. */
export type CheckTarget = Pick<DueLink, 'itemId' | 'url' | 'previewTitle' | 'check'>;

export interface SweepSummary {
  checked: number;
  ok: number;
  changed: number;
  dead: number;
  /** Definite failures that are not `dead` yet (retried the next day). */
  failing: number;
  failedTemp: number;
  /** D168: locked-host links recorded without a request. */
  unchecked: number;
}

/** A guarded GET (`accept: 'any'`); HTML answers also give their title. Never throws. */
export function createLinkProbe(deps: {
  safeFetch: SafeFetch;
  extract: (html: string, url: string) => Pick<ExtractedPage, 'title' | 'og'>;
}): ProbeLink {
  return async (url) => {
    const result = await deps.safeFetch(url);
    let title: string | null = null;
    if (result.html !== null) {
      try {
        const page = deps.extract(result.html, result.finalUrl ?? url);
        title = page.og.title ?? page.title;
      } catch {
        title = null;
      }
    }
    return { result, title };
  };
}

function clipText(value: string | null): string | null {
  return value === null ? null : Array.from(value).slice(0, LINK_CHECK_TEXT_MAX).join('');
}

/**
 * D164 state rules (pure): two definite failures in a row make a link `dead` (a manual check,
 * D165, never does); a temporary failure changes nothing but the probe fields; the flag is set
 * when the status becomes `dead`/`changed`, cleared on `ok`, and left alone (so a dismissal
 * holds) while the status is unchanged.
 */
export function nextCheckState(input: {
  prev: LinkCheckRow | null;
  cls: LinkProbeClass;
  probe: LinkProbe;
  now: Date;
  manual: boolean;
  /** 0..1, for the ± jitter on the next check. */
  random: number;
}): LinkCheckWrite {
  const { prev, cls, probe, now, manual, random } = input;
  const prevStatus: LinkCheckStatus = prev?.status ?? 'ok';
  let status: LinkCheckStatus = prevStatus;
  let failures = prev?.consecutiveFailures ?? 0;
  let retrySoon = false;

  if (cls === 'ok' || cls === 'changed') {
    status = cls;
    failures = 0;
  } else if (cls === 'definite') {
    failures += 1;
    if (failures >= LINK_CHECK_DEAD_AFTER && !manual) status = 'dead';
    else retrySoon = status !== 'dead';
  }

  const days = retrySoon
    ? LINK_CHECK_RETRY_DAYS
    : LINK_CHECK_INTERVAL_DAYS + (random * 2 - 1) * LINK_CHECK_JITTER_DAYS;

  let flaggedAt = prev?.flaggedAt ?? null;
  let dismissedAt = prev?.dismissedAt ?? null;
  if (!prev || status !== prev.status) {
    if (status === 'dead' || status === 'changed') {
      flaggedAt = now;
      dismissedAt = null;
    } else {
      flaggedAt = null;
      dismissedAt = null;
    }
  }

  const succeeded = probe.result.error === null;
  return {
    status,
    httpStatus: probe.result.status,
    error: clipText(probe.result.error),
    titleSeen: succeeded
      ? normalizedTitle(probe.title, LINK_CHECK_TEXT_MAX)
      : (prev?.titleSeen ?? null),
    consecutiveFailures: failures,
    checkedAt: now,
    nextCheckAt: new Date(now.getTime() + Math.round(days * DAY_MS)),
    flaggedAt,
    dismissedAt,
  };
}

/**
 * D168: a locked host's link is never probed; it is recorded `unchecked` (no strikes, no flag,
 * so an old flag clears) and looked at again in the usual interval.
 */
export function uncheckedState(now: Date, random: number): LinkCheckWrite {
  const days = LINK_CHECK_INTERVAL_DAYS + (random * 2 - 1) * LINK_CHECK_JITTER_DAYS;
  return {
    status: 'unchecked',
    httpStatus: null,
    error: null,
    titleSeen: null,
    consecutiveFailures: 0,
    checkedAt: now,
    nextCheckAt: new Date(now.getTime() + Math.round(days * DAY_MS)),
    flaggedAt: null,
    dismissedAt: null,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Runs `tasks` with at most `limit` in flight. */
async function runLimited(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      await task();
    }
  });
  await Promise.all(lanes);
}

/** D164/D165: probe links and keep `link_checks` up to date. Fetch failures never throw. */
export function createLinkChecksService(deps: {
  linkChecks: Pick<LinkChecksRepo, 'due' | 'upsert'>;
  probe: ProbeLink;
  now?: () => Date;
  random?: () => number;
  batch?: number;
  hostParallel?: number;
  log?: (message: string) => void;
}) {
  const {
    linkChecks,
    probe,
    now = () => new Date(),
    random = Math.random,
    batch = LINK_CHECK_BATCH,
    hostParallel = LINK_CHECK_HOST_PARALLEL,
    log = lineSink('link-check'),
  } = deps;

  async function checkOne(
    link: CheckTarget,
    opts: { manual: boolean },
  ): Promise<{ row: LinkCheckRow; cls: LinkProbeClass | 'unchecked' }> {
    if (lockedHostOf(link.url)) {
      return {
        row: await linkChecks.upsert(link.itemId, uncheckedState(now(), random())),
        cls: 'unchecked',
      };
    }
    const seen = await probe(link.url);
    const cls = classify(seen.result, seen.title, link.previewTitle);
    const write = nextCheckState({
      prev: link.check,
      cls,
      probe: seen,
      now: now(),
      manual: opts.manual,
      random: random(),
    });
    return { row: await linkChecks.upsert(link.itemId, write), cls };
  }

  return {
    checkOne,

    /** One run: up to `batch` due links; one request per host at a time, hosts in parallel. */
    async sweep(): Promise<SweepSummary> {
      const due = await linkChecks.due(now(), batch);
      const summary: SweepSummary = {
        checked: 0,
        ok: 0,
        changed: 0,
        dead: 0,
        failing: 0,
        failedTemp: 0,
        unchecked: 0,
      };

      const byHost = new Map<string, DueLink[]>();
      for (const link of due) {
        const host = hostOf(link.url);
        byHost.set(host, [...(byHost.get(host) ?? []), link]);
      }

      const tasks = [...byHost.values()].map((links) => async () => {
        for (const link of links) {
          const { row, cls } = await checkOne(link, { manual: false });
          summary.checked += 1;
          if (cls === 'temporary') summary.failedTemp += 1;
          else if (cls === 'definite') {
            if (row.status === 'dead') summary.dead += 1;
            else summary.failing += 1;
          } else summary[cls] += 1;
        }
      });
      await runLimited(tasks, hostParallel);

      log(`[link-check] sweep ${JSON.stringify(summary)}`);
      return summary;
    },
  };
}

export type LinkChecksService = ReturnType<typeof createLinkChecksService>;
