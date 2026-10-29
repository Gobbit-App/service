import type { Env } from '../env';
import { decisionLogger } from '../lib/decision-event';
import type { Logger } from '../lib/logger';
import type { AuthDecisions } from './auth.events';

/**
 * D241: one `registration.mode` line per process start, so an operator can see which gate is live.
 * Open registration in production is a warning: anyone with an address can create an account.
 */
export function recordRegistrationMode(
  env: Pick<Env, 'REGISTRATION_MODE' | 'NODE_ENV'>,
  ctx: { bootId: string },
  parent?: Logger,
): void {
  const warn = env.REGISTRATION_MODE === 'open' && env.NODE_ENV === 'production';
  decisionLogger<AuthDecisions>('auth', {
    parent,
    levels: { 'registration.mode': warn ? 'warn' : 'info' },
  }).record('registration.mode', {
    outcome: 'configured',
    mode: env.REGISTRATION_MODE,
    bootId: ctx.bootId,
  });
}
