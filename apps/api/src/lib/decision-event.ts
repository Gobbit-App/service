import { childLogger, logger as rootLogger, type Logger } from './logger';

export type DecisionLevel = 'info' | 'warn' | 'error';

/** Per-event outcome/reason sets: `{ 'waitlist.join': { outcome: 'created' | …; reason: … } }`. */
export type DecisionCatalog = Record<string, { outcome: string; reason?: string }>;

/** Exactly one correlation id: the request's, or the pg-boss job's. */
type Correlation = { requestId: string; jobId?: never } | { jobId: string; requestId?: never };

/** Subjects are ids or keyed hashes (`emailHash`, `ipHash`); never the raw value. */
type Subjects = Record<string, string | number | boolean | null | undefined> & {
  email?: never;
  ip?: never;
};

export type DecisionFields<C extends DecisionCatalog, E extends keyof C> = {
  outcome: C[E]['outcome'];
  reason?: C[E]['reason'];
} & Correlation &
  Subjects;

/** Keys that would put personal data in a log line (constitution IV, D239). */
const FORBIDDEN_KEYS = new Set(['email', 'ip', 'emailAddress', 'ipAddress', 'to']);

/**
 * D239 / ADR-060: one JSON line per decision about a person, their content or experience.
 * `levels` maps `event` or `event:outcome` to a level (default `info`); a missing correlation id
 * or a raw `email`/`ip` field is a programming error and throws.
 */
export function decisionLogger<C extends DecisionCatalog>(
  component: string,
  opts: { levels?: Partial<Record<string, DecisionLevel>>; parent?: Logger } = {},
) {
  const log = childLogger(component, opts.parent ?? rootLogger);
  const levels = opts.levels ?? {};

  return {
    record<E extends keyof C & string>(event: E, fields: DecisionFields<C, E>): void {
      for (const key of Object.keys(fields)) {
        if (FORBIDDEN_KEYS.has(key)) {
          throw new Error(`decision event ${event}: field "${key}" must be a keyed hash`);
        }
      }
      const correlated = fields as { requestId?: string; jobId?: string };
      if (!correlated.requestId && !correlated.jobId) {
        throw new Error(`decision event ${event}: requestId or jobId is required`);
      }
      const level = levels[`${event}:${String(fields.outcome)}`] ?? levels[event] ?? 'info';
      log[level]({ event, ...fields }, event);
    },
  };
}

export type DecisionLogger<C extends DecisionCatalog> = ReturnType<typeof decisionLogger<C>>;
