import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../errors/http-errors';
import type { PushSender } from '../push/push-sender';
import type { PushSubscriptionsRepo } from '../repositories/push-subscriptions.repo';
import { createPushSubscriptionsService, PUSH_HOST_PROBLEM } from './push-subscriptions.service';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const input = { endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } };
const ctx = { requestId: 'req-1' };

function setup(
  opts: { push?: PushSender | null; existing?: boolean; enforce?: () => Promise<void> } = {},
) {
  const subscriptions = {
    upsert: vi.fn().mockResolvedValue({ id: 'sub-1', created: !opts.existing }),
    removeForUser: vi.fn().mockResolvedValue(true),
    listForUser: vi.fn().mockResolvedValue([
      { id: 'sub-1', userId: 'u1', endpoint: ENDPOINT, p256dh: 'p', auth: 'a' },
      { id: 'sub-2', userId: 'u1', endpoint: `${ENDPOINT}2`, p256dh: 'p', auth: 'a' },
    ]),
    deleteById: vi.fn().mockResolvedValue(undefined),
  };
  const users = {
    findReminderEmails: vi.fn().mockResolvedValue(true),
    setReminderEmails: vi.fn().mockResolvedValue(true),
  };
  const push: PushSender | null =
    opts.push === undefined ? { send: vi.fn().mockResolvedValue({ kind: 'sent' }) } : opts.push;
  const rateLimits = { enforce: vi.fn(opts.enforce ?? (async () => undefined)) };
  const decisions = { record: vi.fn() };
  const service = createPushSubscriptionsService({
    subscriptions: subscriptions as unknown as PushSubscriptionsRepo,
    users,
    push,
    rateLimits,
    decisions,
  });
  return { service, subscriptions, users, push, rateLimits, decisions };
}

describe('push subscriptions service (D297)', () => {
  it('answers 404 on every push route when push is not configured', async () => {
    const { service } = setup({ push: null });
    await expect(service.add('u1', input, ctx)).rejects.toMatchObject({ status: 404 });
    await expect(service.remove('u1', ENDPOINT, ctx)).rejects.toMatchObject({ status: 404 });
    await expect(service.test('u1')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses an endpoint off the push allow-list and records it', async () => {
    const { service, subscriptions, decisions } = setup();
    const err = await service
      .add('u1', { ...input, endpoint: 'https://evil.example/push' }, ctx)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 400, type: PUSH_HOST_PROBLEM });
    expect(subscriptions.upsert).not.toHaveBeenCalled();
    expect(decisions.record).toHaveBeenCalledWith('push.subscription', {
      outcome: 'refused',
      reason: 'host_not_allowed',
      userId: 'u1',
      requestId: 'req-1',
    });
  });

  it('records a new device as added and a re-added one as refreshed', async () => {
    const fresh = setup();
    await fresh.service.add('u1', { ...input, label: 'Phone' }, ctx);
    expect(fresh.subscriptions.upsert).toHaveBeenCalledWith({
      userId: 'u1',
      endpoint: ENDPOINT,
      p256dh: 'p',
      auth: 'a',
      label: 'Phone',
    });
    expect(fresh.decisions.record.mock.calls[0]![1]).not.toHaveProperty('reason');

    const again = setup({ existing: true });
    await again.service.add('u1', input, ctx);
    expect(again.decisions.record.mock.calls[0]![1]).toMatchObject({
      outcome: 'added',
      reason: 'refreshed',
    });
  });

  it('removes idempotently and records only a real removal', async () => {
    const { service, subscriptions, decisions } = setup();
    subscriptions.removeForUser.mockResolvedValueOnce(false);
    await service.remove('u1', ENDPOINT, ctx);
    expect(decisions.record).not.toHaveBeenCalled();
    await service.remove('u1', ENDPOINT, ctx);
    expect(decisions.record).toHaveBeenCalledWith('push.subscription', {
      outcome: 'removed',
      userId: 'u1',
      requestId: 'req-1',
    });
  });

  it('sends a test to each device, counts the sent ones and drops gone ones', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'sent' })
      .mockResolvedValueOnce({ kind: 'gone', code: 'http_410' });
    const { service, subscriptions, rateLimits } = setup({ push: { send } });
    expect(await service.test('u1')).toEqual({ devices: 1 });
    expect(rateLimits.enforce).toHaveBeenCalledWith('push-test:u1', expect.any(Number));
    expect(subscriptions.deleteById).toHaveBeenCalledWith('sub-2');
  });

  it('sends nothing when the test is rate limited', async () => {
    const send = vi.fn();
    const { service } = setup({
      push: { send },
      enforce: async () => {
        throw new HttpError(429, '/problems/rate-limited', 'Too many requests');
      },
    });
    await expect(service.test('u1')).rejects.toMatchObject({ status: 429 });
    expect(send).not.toHaveBeenCalled();
  });

  it('reads and saves the reminder-email switch; a vanished user is unauthorized', async () => {
    const { service, users } = setup();
    expect(await service.preferences('u1')).toEqual({ reminderEmails: true });
    expect(await service.setPreferences('u1', { reminderEmails: false })).toEqual({
      reminderEmails: false,
    });
    expect(users.setReminderEmails).toHaveBeenCalledWith('u1', false);

    users.findReminderEmails.mockResolvedValueOnce(null);
    await expect(service.preferences('u1')).rejects.toMatchObject({ status: 401 });
    users.setReminderEmails.mockResolvedValueOnce(null);
    await expect(service.setPreferences('u1', { reminderEmails: true })).rejects.toMatchObject({
      status: 401,
    });
  });
});
