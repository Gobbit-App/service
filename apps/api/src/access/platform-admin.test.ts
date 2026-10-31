import { describe, expect, it } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import type { CurrentUser } from '../types';
import { adminRouteLabel, createPlatformAdmins, recordAdminConfig } from './platform-admin';
import type { AdminAccessDecisions } from '../services/waitlist-admin.events';

const user = (email: string): CurrentUser => ({
  id: `u-${email.split('@')[0]}`,
  accountId: 'a1',
  email,
  displayName: 'Someone',
});

function setup(admins: string[]) {
  const capture = captureLogger();
  const guard = createPlatformAdmins({
    admins,
    decisions: decisionLogger<AdminAccessDecisions>('admin', {
      parent: capture.logger,
      levels: { 'admin.denied': 'warn' },
    }),
  });
  return { capture, guard };
}

const ctx = { requestId: 'req-1', method: 'get', path: '/admin/waitlist' };

describe('createPlatformAdmins (032, D234)', () => {
  it('matches listed emails case-insensitively', () => {
    const { guard } = setup([' Admin@Example.test ']);
    expect(guard.is(user('admin@example.test'))).toBe(true);
    expect(guard.is(user('ADMIN@example.test'))).toBe(true);
    expect(guard.is(user('owner@example.test'))).toBe(false);
    expect(guard.is(undefined)).toBe(false);
  });

  it('lets an admin through as a PlatformAdmin', () => {
    const { guard } = setup(['admin@example.test']);
    const admin = guard.require(user('admin@example.test'), ctx);
    expect(admin).toMatchObject({ id: 'u-admin', platformAdmin: true });
  });

  it('answers a non-admin with the unknown-route 404 and records not_admin', async () => {
    const { capture, guard } = setup(['admin@example.test']);
    expect(() => guard.require(user('owner@example.test'), ctx)).toThrow(
      expect.objectContaining({
        status: 404,
        type: '/problems/not-found',
        detail: 'Route not found',
      }),
    );
    await capture.flush();
    const line = expectDecision(capture.lines, 'admin.denied', {
      outcome: 'denied',
      reason: 'not_admin',
    });
    expect(line).toMatchObject({
      level: 'warn',
      actorId: 'u-owner',
      route: 'GET /admin/waitlist',
      requestId: 'req-1',
    });
    expect(JSON.stringify(line)).not.toContain('@example.test');
  });

  it('answers a signed-out caller with 401 and records signed_out', async () => {
    const { capture, guard } = setup(['admin@example.test']);
    expect(() => guard.require(undefined, ctx)).toThrow(expect.objectContaining({ status: 401 }));
    await capture.flush();
    const line = expectDecision(capture.lines, 'admin.denied', {
      outcome: 'denied',
      reason: 'signed_out',
    });
    expect(line.actorId).toBeUndefined();
  });

  it('denies everyone when the list is empty', () => {
    const { guard } = setup([]);
    expect(() => guard.require(user('admin@example.test'), ctx)).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });
});

describe('adminRouteLabel', () => {
  it.each([
    ['get', '/admin/waitlist', 'GET /admin/waitlist'],
    ['post', '/admin/waitlist/6f0c/invite', 'POST /admin/waitlist/{id}/invite'],
    ['delete', '/admin/waitlist/6f0c', 'DELETE /admin/waitlist/{id}'],
    ['get', '/admin/someone@example.test', 'GET /admin/other'],
  ])('%s %s → %s', (method, path, label) => {
    expect(adminRouteLabel(method, path)).toBe(label);
  });
});

describe('recordAdminConfig', () => {
  it.each([
    [['a@example.test', 'A@example.test', 'b@example.test'], 'production', 2, 'info'],
    [[], 'development', 0, 'info'],
    [[], 'production', 0, 'warn'],
  ] as const)('%j in %s → count %i at %s', async (admins, nodeEnv, count, level) => {
    const capture = captureLogger();
    recordAdminConfig(
      { PLATFORM_ADMINS: [...admins], NODE_ENV: nodeEnv },
      { bootId: 'boot-1' },
      capture.logger,
    );
    await capture.flush();
    const line = expectDecision(capture.lines, 'admin.config', { outcome: 'configured' });
    expect(line).toMatchObject({ level, count, bootId: 'boot-1' });
  });
});
