import type { Env } from '../env';
import type { CurrentUser } from '../types';
import type { Logger } from '../lib/logger';
import { decisionLogger, type DecisionLogger } from '../lib/decision-event';
import { notFound, unauthorized } from '../errors/http-errors';
import { normalizeEmail } from '../services/users.service';
import {
  ADMIN_ACCESS_DECISION_LEVELS,
  type AdminAccessDecisions,
} from '../services/waitlist-admin.events';

/** 032: a user the guard checked against `PLATFORM_ADMINS`; only `require` makes one. */
export type PlatformAdmin = CurrentUser & { readonly platformAdmin: true };

/** The 404 a non-admin gets: the same body as an unknown route (`notFoundHandler`). */
const ROUTE_NOT_FOUND = 'Route not found';

/** Known admin addresses as templates; anything else is `other`, so no path text reaches a log. */
const ROUTE_TEMPLATES: ReadonlyArray<[RegExp, string]> = [
  [/^\/admin\/waitlist\/?$/, '/admin/waitlist'],
  [/^\/admin\/waitlist\/[^/]+\/invite\/?$/, '/admin/waitlist/{id}/invite'],
  [/^\/admin\/waitlist\/[^/]+\/?$/, '/admin/waitlist/{id}'],
];

export function adminRouteLabel(method: string, path: string): string {
  const template = ROUTE_TEMPLATES.find(([pattern]) => pattern.test(path))?.[1];
  return `${method.toUpperCase()} ${template ?? '/admin/other'}`;
}

/**
 * D234: platform admins are an env allow-list of emails, separate from deck roles. Signed-out
 * callers get 401; everyone else who isn't listed gets the unknown-route 404, so the admin
 * surface stays invisible. Every refusal records `admin.denied` with the reason.
 */
export function createPlatformAdmins(deps: {
  admins: readonly string[];
  decisions?: DecisionLogger<AdminAccessDecisions>;
}) {
  const admins = new Set(deps.admins.map(normalizeEmail));
  const decisions =
    deps.decisions ??
    decisionLogger<AdminAccessDecisions>('admin', { levels: ADMIN_ACCESS_DECISION_LEVELS });

  const is = (user: Pick<CurrentUser, 'email'> | undefined): boolean =>
    user !== undefined && admins.has(normalizeEmail(user.email));

  return {
    is,

    require(
      user: CurrentUser | undefined,
      ctx: { requestId: string; method: string; path: string },
    ): PlatformAdmin {
      const route = adminRouteLabel(ctx.method, ctx.path);
      if (!user) {
        decisions.record('admin.denied', {
          outcome: 'denied',
          reason: 'signed_out',
          route,
          requestId: ctx.requestId,
        });
        throw unauthorized('Authentication required');
      }
      if (!is(user)) {
        decisions.record('admin.denied', {
          outcome: 'denied',
          reason: 'not_admin',
          actorId: user.id,
          route,
          requestId: ctx.requestId,
        });
        throw notFound(ROUTE_NOT_FOUND);
      }
      return { ...user, platformAdmin: true };
    },
  };
}

export type PlatformAdmins = ReturnType<typeof createPlatformAdmins>;

/** One `admin.config` line per process start; an empty list in production is a warning. */
export function recordAdminConfig(
  env: Pick<Env, 'PLATFORM_ADMINS' | 'NODE_ENV'>,
  ctx: { bootId: string },
  parent?: Logger,
): void {
  const count = new Set(env.PLATFORM_ADMINS.map(normalizeEmail)).size;
  const warn = count === 0 && env.NODE_ENV === 'production';
  decisionLogger<AdminAccessDecisions>('admin', {
    parent,
    levels: { 'admin.config': warn ? 'warn' : 'info' },
  }).record('admin.config', { outcome: 'configured', count, bootId: ctx.bootId });
}
