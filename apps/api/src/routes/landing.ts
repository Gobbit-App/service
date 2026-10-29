import type { Context } from 'hono';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../types';
import type { Env } from '../env';
import type { Services } from '../services';
import type { AnonRateLimiter } from '../lib/anon-rate-limiter';
import { clientIp } from '../lib/client-ip';
import { HttpError } from '../errors/http-errors';
import type { DecisionLogger } from '../lib/decision-event';
import type { LandingDecisions } from '../services/landing.events';
import { LANDING_COPY_EN } from '../public/landing-copy';
import { landingPage, type LandingState, type LandingView } from '../public/landing';
import { parseLandingForm, landingUtmSource, type LandingFormValues } from '../public/landing-form';
import {
  landingStateFromQuery,
  landingVia,
  renderStateName,
  retryMinutes,
  VIA_HEADER,
} from '../public/landing-request';
import { LANDING_JOINED_PATH, LANDING_PATH } from '../public/public-url';
import { PAGE_CACHE_CONTROL, PRIVATE_CACHE_CONTROL } from '../public/responses';

export type LandingRoutesDeps = {
  env: Pick<Env, 'APP_URL' | 'API_URL' | 'CLIENT_IP_HEADER'>;
  /** 028's per-IP waitlist bucket, shared with `POST /waitlist` (D219). */
  joinLimiter: AnonRateLimiter;
  now: () => Date;
  /** 028's `rate_limit.refused` event for the per-IP bucket. */
  recordIpRefusal: (c: Context<AppEnv>, retryAfterSeconds: number) => void;
  decisions: DecisionLogger<LandingDecisions>;
};

/** Every landing answer depends on the session cookie (D226: members get the signed-in variant). */
const VARY = 'Cookie';
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data'];

function isFormPost(c: Context<AppEnv>): boolean {
  const type = c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  return FORM_TYPES.includes(type);
}

/** 028's per-email refusal surfaces as the shared 429 error; its `Retry-After` is the wait. */
function perEmailRetryAfter(err: unknown): number | null {
  if (!(err instanceof HttpError) || err.status !== 429) return null;
  return Number(err.headers['Retry-After']) || 60;
}

/**
 * D226–D228, D242: the landing page and its no-JS waitlist form, API-rendered HTML outside
 * OpenAPI like 017's `/p/*` pages. Joins go only through `waitlist.join` (source `landing`).
 */
export function registerLandingRoutes(
  app: OpenAPIHono<AppEnv>,
  services: Services,
  deps: LandingRoutesDeps,
): void {
  const { env, decisions } = deps;
  const origin = env.APP_URL ?? new URL(env.API_URL).origin;

  function render(
    c: Context<AppEnv>,
    status: 200 | 400 | 429,
    view: Omit<LandingView, 'origin'>,
    headers: Record<string, string>,
  ): Response {
    return c.html(landingPage({ ...view, origin }), status, { Vary: VARY, ...headers });
  }

  /** The 400/429 re-render: values kept, never cached, never indexed (the template says noindex). */
  function rerender(
    c: Context<AppEnv>,
    status: 400 | 429,
    values: Partial<LandingFormValues>,
    extra: Pick<LandingView, 'errors' | 'notice'>,
    headers: Record<string, string> = {},
  ): Response {
    return render(
      c,
      status,
      { state: 'invalid', form: values, ...extra },
      {
        'Cache-Control': PRIVATE_CACHE_CONTROL,
        ...headers,
      },
    );
  }

  function limited(
    c: Context<AppEnv>,
    values: Partial<LandingFormValues>,
    reason: 'per_ip' | 'per_email',
    retryAfterSec: number,
  ): Response {
    decisions.record('landing.form', {
      outcome: 'refused',
      reason,
      retryAfterSec,
      requestId: c.get('requestId'),
    });
    return rerender(
      c,
      429,
      values,
      { notice: LANDING_COPY_EN.errors.tooManyTries(retryMinutes(retryAfterSec)) },
      { 'Retry-After': String(retryAfterSec) },
    );
  }

  function get(stateFor: (c: Context<AppEnv>) => LandingState) {
    return (c: Context<AppEnv>): Response => {
      const signedIn = Boolean(c.get('user'));
      const state: LandingState = signedIn ? 'signed-in' : stateFor(c);
      const utmSource = landingUtmSource(c.req.query('utm_source'));
      decisions.record('landing.render', {
        outcome: 'rendered',
        state: renderStateName(state),
        via: landingVia(c.req.header(VIA_HEADER), c.req.query('from')),
        utmSource,
        requestId: c.get('requestId'),
      });
      return render(
        c,
        200,
        { state, form: utmSource ? { utmSource } : undefined },
        { 'Cache-Control': signedIn ? PRIVATE_CACHE_CONTROL : PAGE_CACHE_CONTROL },
      );
    };
  }

  app.get(
    LANDING_PATH,
    get((c) =>
      landingStateFromQuery({
        confirmed: c.req.query('confirmed'),
        confirm: c.req.query('confirm'),
      }),
    ),
  );
  app.get(
    LANDING_JOINED_PATH,
    get(() => 'joined'),
  );

  // D228: post/redirect/get. The session is ignored: a member posting the form joins like anyone.
  app.post(LANDING_PATH, async (c) => {
    const ip = clientIp(c, env.CLIENT_IP_HEADER);
    const body = isFormPost(c) ? await c.req.parseBody() : null;
    const parsed = parseLandingForm(body ?? {});

    const perIp = deps.joinLimiter.hit(ip, deps.now());
    if (!perIp.allowed) {
      deps.recordIpRefusal(c, perIp.retryAfterSeconds);
      return limited(c, parsed.values, 'per_ip', perIp.retryAfterSeconds);
    }

    if (!parsed.ok) {
      decisions.record('landing.form', {
        outcome: 'invalid',
        fields: Object.keys(parsed.errors).sort().join(','),
        requestId: c.get('requestId'),
      });
      return rerender(c, 400, parsed.values, { errors: parsed.errors });
    }

    try {
      await services.waitlist.join({
        ...parsed.input,
        source: 'landing',
        ip,
        requestId: c.get('requestId'),
      });
    } catch (err) {
      const retryAfter = perEmailRetryAfter(err);
      if (retryAfter === null) throw err;
      return limited(c, parsed.values, 'per_email', retryAfter);
    }
    decisions.record('landing.form', { outcome: 'accepted', requestId: c.get('requestId') });
    // Relative, so it stays on whichever origin served the form.
    return c.body(null, 303, { Location: LANDING_JOINED_PATH, 'Cache-Control': 'no-store' });
  });
}
