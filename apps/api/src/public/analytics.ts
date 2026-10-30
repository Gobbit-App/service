import type { Env } from '../env';
import { decisionLogger } from '../lib/decision-event';
import type { Logger } from '../lib/logger';
import { h, type Html } from './html';

/** D232: the only same-origin prefix Caddy proxies to Umami (`/stats/script.js`, `/stats/api/send`). */
export const STATS_BASE_PATH = '/stats';

/** What a page head needs to carry the tracker: the Umami website id and the public host. */
export type AnalyticsHead = { siteId: string; host: string };

type AnalyticsEnv = Pick<Env, 'ANALYTICS_SITE_ID' | 'APP_URL' | 'API_URL'>;

export type AnalyticsDecisions = {
  'analytics.config': { outcome: 'enabled' | 'disabled' };
};

/**
 * D232 (contract §2): Umami's tracker, deferred, same origin, Do Not Track honoured, and limited
 * to the public host so copies of the page elsewhere send nothing.
 */
export function analyticsTag({ siteId, host }: AnalyticsHead): Html {
  return h`<script defer src="${STATS_BASE_PATH}/script.js" data-website-id="${siteId}" data-host-url="${STATS_BASE_PATH}" data-domains="${host}" data-do-not-track="true"></script>`;
}

/** D232: `{ siteId, host }` when `ANALYTICS_SITE_ID` is set, else `undefined` (no tag). */
export function analyticsHead(env: AnalyticsEnv): AnalyticsHead | undefined {
  if (!env.ANALYTICS_SITE_ID) return undefined;
  // The host pages are served from: APP_URL, else API_URL's (same-origin deployments).
  return { siteId: env.ANALYTICS_SITE_ID, host: new URL(env.APP_URL ?? env.API_URL).host };
}

/** D243: one `analytics.config` line per process start; the host, never the site id. */
export function recordAnalyticsConfig(
  env: AnalyticsEnv,
  ctx: { bootId: string },
  parent?: Logger,
): void {
  const head = analyticsHead(env);
  decisionLogger<AnalyticsDecisions>('analytics', { parent }).record('analytics.config', {
    outcome: head ? 'enabled' : 'disabled',
    host: head?.host,
    bootId: ctx.bootId,
  });
}
