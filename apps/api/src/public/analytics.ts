import { BEFORE_SEND_HOOK, type Screen } from '@gobbit/shared/analytics';
import type { Env } from '../env';
import { decisionLogger } from '../lib/decision-event';
import type { Logger } from '../lib/logger';
import { h, type Html } from './html';

/** D232: the only same-origin prefix Caddy proxies to Umami (`/stats/script.js`, `/stats/api/send`). */
export const STATS_BASE_PATH = '/stats';

/** D246: first-party script that defines the before-send hook on public pages (web image). */
export const PAGE_SCRIPT_PATH = '/analytics/page.js';

/** D250: what analytics covers when enabled; announced in `analytics.config`. */
export const ANALYTICS_SURFACES = ['landing', 'app', 'public', 'share'] as const;

/** What a page head needs to carry the tracker: the Umami website id and the public host. */
export type AnalyticsConfig = { siteId: string; host: string };

/**
 * D232 / D249: the tracker on an API-rendered page. Without `page` (the landing, 031) Umami sends
 * the page as is; with it, `page.js` rewrites every payload to the pattern and screen name.
 */
export type AnalyticsHead = AnalyticsConfig & { page?: Screen };

type AnalyticsEnv = Pick<Env, 'ANALYTICS_SITE_ID' | 'APP_URL' | 'API_URL'>;

export type AnalyticsDecisions = {
  'analytics.config': {
    outcome: 'enabled' | 'disabled';
    /** Comma-separated `ANALYTICS_SURFACES` (decision fields are scalars). */
    surfaces?: string;
  };
};

/**
 * D232 (contract §2): Umami's tracker, deferred, same origin, Do Not Track honoured, and limited
 * to the public host so copies of the page elsewhere send nothing.
 */
export function analyticsTag({ siteId, host, page }: AnalyticsHead): Html {
  if (!page) {
    return h`<script defer src="${STATS_BASE_PATH}/script.js" data-website-id="${siteId}" data-host-url="${STATS_BASE_PATH}" data-domains="${host}" data-do-not-track="true"></script>`;
  }
  // D249: page.js first (both deferred, so document order), then the tracker naming its hook.
  return h`<script defer src="${PAGE_SCRIPT_PATH}" data-pattern="${page.pattern}" data-screen="${page.name}"></script>
<script defer src="${STATS_BASE_PATH}/script.js" data-website-id="${siteId}" data-host-url="${STATS_BASE_PATH}" data-domains="${host}" data-do-not-track="true" data-exclude-search="true" data-exclude-hash="true" data-before-send="${BEFORE_SEND_HOOK}"></script>`;
}

/** D249: the head for a public page or share preview, or undefined when analytics is off. */
export function withPage(
  config: AnalyticsConfig | undefined,
  page: Screen,
): AnalyticsHead | undefined {
  return config ? { ...config, page } : undefined;
}

/** D232: `{ siteId, host }` when `ANALYTICS_SITE_ID` is set, else `undefined` (no tag). */
export function analyticsHead(env: AnalyticsEnv): AnalyticsConfig | undefined {
  if (!env.ANALYTICS_SITE_ID) return undefined;
  // The host pages are served from: APP_URL, else API_URL's (same-origin deployments).
  return { siteId: env.ANALYTICS_SITE_ID, host: new URL(env.APP_URL ?? env.API_URL).host };
}

/** D243 / D250: one `analytics.config` line per process start; host and surfaces, never the site id. */
export function recordAnalyticsConfig(
  env: AnalyticsEnv,
  ctx: { bootId: string },
  parent?: Logger,
): void {
  const head = analyticsHead(env);
  decisionLogger<AnalyticsDecisions>('analytics', { parent }).record('analytics.config', {
    outcome: head ? 'enabled' : 'disabled',
    host: head?.host,
    surfaces: head ? ANALYTICS_SURFACES.join(',') : undefined,
    bootId: ctx.bootId,
  });
}
