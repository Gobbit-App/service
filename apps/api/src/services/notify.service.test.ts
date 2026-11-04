import { describe, expect, it, vi } from 'vitest';
import type { Mailer } from '../mail/mailer';
import type { PushOutcome, PushSender } from '../push/push-sender';
import type { ClaimedDelivery, NotificationsRepo } from '../repositories/notifications.repo';
import { createNotifyService } from './notify.service';

/** Unit tests for the deliver half (D295/D296); planning runs against Postgres in notify.int. */
const NOW = new Date('2026-11-03T10:00:00Z');
const deadline = new Date('2026-11-03T09:00:00Z');

function delivery(over: Partial<ClaimedDelivery> = {}): ClaimedDelivery {
  return {
    id: 'd1',
    itemId: 'item-1',
    deadline,
    userId: 'u1',
    channel: 'email',
    target: 'email',
    attempts: 1,
    ...over,
  };
}

function setup(opts: {
  claimed: ClaimedDelivery;
  stillDue?: boolean;
  mailFails?: boolean;
  pushOutcome?: PushOutcome;
  device?: boolean;
  interrupted?: Array<Pick<ClaimedDelivery, 'id' | 'itemId' | 'userId' | 'channel'>>;
}) {
  const notifications = {
    markInterrupted: vi.fn().mockResolvedValue(opts.interrupted ?? []),
    duePending: vi.fn().mockResolvedValue([opts.claimed.id]),
    claim: vi.fn().mockResolvedValue(opts.claimed),
    context: vi.fn().mockResolvedValue({
      title: 'Pay rent',
      deckName: 'Home',
      payload: { timeZone: 'UTC' },
      email: 'member@example.test',
      stillDue: opts.stillDue ?? true,
    }),
    finish: vi.fn().mockResolvedValue(undefined),
  };
  const pushSubscriptions = {
    findById: vi.fn().mockResolvedValue(
      opts.device === false
        ? null
        : {
            id: 'sub-1',
            userId: 'u1',
            endpoint: 'https://fcm.googleapis.com/x',
            p256dh: 'p',
            auth: 'a',
          },
    ),
    deleteById: vi.fn().mockResolvedValue(undefined),
    touch: vi.fn().mockResolvedValue(undefined),
  };
  const mailer: Mailer = {
    send: vi.fn(async () => {
      if (opts.mailFails) throw new Error('resend down');
    }),
  };
  const push: PushSender = {
    send: vi.fn().mockResolvedValue(opts.pushOutcome ?? { kind: 'sent' }),
  };
  const decisions = { record: vi.fn() };
  const service = createNotifyService({
    notifications: notifications as unknown as NotificationsRepo,
    pushSubscriptions,
    mailer,
    push,
    limits: { batch: 10, maxAttempts: 3, retryBaseSeconds: 60 },
    appUrl: 'https://app.example.test',
    decisions,
    now: () => NOW,
  });
  return { service, notifications, pushSubscriptions, mailer, push, decisions };
}

const outcomes = (decisions: { record: ReturnType<typeof vi.fn> }) =>
  decisions.record.mock.calls.map(([, f]) => `${f.outcome}${f.reason ? `:${f.reason}` : ''}`);

describe('notify deliver (D295)', () => {
  it('emails with an idempotency key per delivery and marks it sent', async () => {
    const t = setup({ claimed: delivery() });
    await t.service.deliver('job-1');
    expect(t.mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@example.test',
        subject: 'Reminder: Pay rent',
        idempotencyKey: 'reminder-d1',
      }),
    );
    expect(t.notifications.finish).toHaveBeenCalledWith('d1', { status: 'sent', error: null });
    expect(outcomes(t.decisions)).toEqual(['sent']);
  });

  it('drops a reminder that is no longer due without sending', async () => {
    const t = setup({ claimed: delivery(), stillDue: false });
    await t.service.deliver('job-1');
    expect(t.mailer.send).not.toHaveBeenCalled();
    expect(t.notifications.finish).toHaveBeenCalledWith('d1', { status: 'failed', error: 'stale' });
    expect(outcomes(t.decisions)).toEqual(['dropped:stale']);
  });

  it('retries a failed email with backoff until the attempts run out', async () => {
    const first = setup({ claimed: delivery({ attempts: 2 }), mailFails: true });
    await first.service.deliver('job-1');
    expect(first.notifications.finish).toHaveBeenCalledWith('d1', {
      status: 'pending',
      error: 'mail_error',
      retryAt: new Date(NOW.getTime() + 120_000),
    });
    expect(outcomes(first.decisions)).toEqual(['retried:mail_error']);

    const last = setup({ claimed: delivery({ attempts: 3 }), mailFails: true });
    await last.service.deliver('job-1');
    expect(last.notifications.finish).toHaveBeenCalledWith('d1', {
      status: 'failed',
      error: 'mail_error',
    });
    expect(outcomes(last.decisions)).toEqual(['failed:max_attempts']);
  });

  it('pushes to the device, links the card and touches the subscription', async () => {
    const t = setup({ claimed: delivery({ channel: 'push', target: 'sub-1' }) });
    await t.service.deliver('job-1');
    expect(t.push.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub-1' }),
      expect.objectContaining({ title: 'Pay rent', url: '/i/item-1', tag: 'item-1' }),
    );
    expect(t.pushSubscriptions.touch).toHaveBeenCalledWith('sub-1');
    expect(outcomes(t.decisions)).toEqual(['sent']);
  });

  it('deletes a device the push service says is gone (404/410)', async () => {
    const t = setup({
      claimed: delivery({ channel: 'push', target: 'sub-1' }),
      pushOutcome: { kind: 'gone', code: 'http_410' },
    });
    await t.service.deliver('job-1');
    expect(t.pushSubscriptions.deleteById).toHaveBeenCalledWith('sub-1');
    expect(t.notifications.finish).toHaveBeenCalledWith('d1', {
      status: 'gone',
      error: 'http_410',
    });
    expect(outcomes(t.decisions)).toEqual(['gone:http_410']);
  });

  it('marks a delivery to a removed device gone without sending', async () => {
    const t = setup({ claimed: delivery({ channel: 'push', target: 'sub-1' }), device: false });
    await t.service.deliver('job-1');
    expect(t.push.send).not.toHaveBeenCalled();
    expect(outcomes(t.decisions)).toEqual(['gone:device_missing']);
  });

  it('fails a push the service refuses for good', async () => {
    const t = setup({
      claimed: delivery({ channel: 'push', target: 'sub-1' }),
      pushOutcome: { kind: 'failed', code: 'http_400' },
    });
    await t.service.deliver('job-1');
    expect(t.notifications.finish).toHaveBeenCalledWith('d1', {
      status: 'failed',
      error: 'http_400',
    });
    expect(outcomes(t.decisions)).toEqual(['failed:http_400']);
  });

  it('records sends cut off mid-flight as interrupted and never resends them', async () => {
    const t = setup({
      claimed: delivery(),
      interrupted: [{ id: 'd0', itemId: 'item-1', userId: 'u1', channel: 'email' }],
    });
    const result = await t.service.deliver('job-1');
    expect(result).toEqual({ attempted: 1, interrupted: 1 });
    expect(t.decisions.record).toHaveBeenCalledWith(
      'reminder.notify',
      expect.objectContaining({ deliveryId: 'd0', outcome: 'interrupted', jobId: 'job-1' }),
    );
  });

  it('skips a delivery another tick already claimed', async () => {
    const t = setup({ claimed: delivery() });
    t.notifications.claim.mockResolvedValueOnce(null);
    await t.service.deliver('job-1');
    expect(t.mailer.send).not.toHaveBeenCalled();
    expect(t.decisions.record).not.toHaveBeenCalled();
  });
});
