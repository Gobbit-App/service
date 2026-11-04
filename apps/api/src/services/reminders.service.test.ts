import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ItemRow } from '@gobbit/db';
import { createRemindersService } from './reminders.service';
import type { Actor, CurrentUser } from '../types';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const DAY_MS = 86_400_000;
const DECK = '00000000-0000-4000-8000-0000000000d1';
const ITEM = '00000000-0000-4000-8000-000000000001';
const ME = '00000000-0000-4000-8000-0000000000a1';
const WRITER = '00000000-0000-4000-8000-0000000000a2';
const READER = '00000000-0000-4000-8000-0000000000a3';

const USER: CurrentUser = { id: ME, accountId: 'acc', email: 'me@example.test', displayName: 'me' };
const actor = (id = ME): Actor => ({ user: { ...USER, id }, via: 'session', requestId: 'req-1' });

const PAYLOAD = {
  deadline: new Date(NOW.getTime() + 3 * DAY_MS).toISOString(),
  showBefore: { amount: 1, unit: 'days' },
  dismiss: { mode: 'writers', userIds: [] as string[] },
  timeZone: 'Europe/London',
};

const MEMBERS = [
  { userId: ME, role: 'owner' as const },
  { userId: WRITER, role: 'editor' as const },
  { userId: READER, role: 'reader' as const },
];

function row(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: ITEM,
    deckId: DECK,
    type: 'reminder',
    status: 'published',
    title: 'Renew passport',
    body: '',
    payload: PAYLOAD,
    entities: {},
    sourceUrl: null,
    sourceKind: 'manual',
    verifiedAt: NOW,
    createdBy: ME,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    searchText: '',
    embeddingModel: null,
    embeddedHash: null,
    embeddedAt: null,
    revealAt: new Date(NOW.getTime() + 2 * DAY_MS),
    ...overrides,
  } as ItemRow;
}

describe('createRemindersService', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let decisions: { record: ReturnType<typeof vi.fn> };
  let service: ReturnType<typeof createRemindersService>;
  const shared = { role: 'owner' as const, deck: { id: DECK, kind: 'shared' } };

  beforeEach(() => {
    repo = {
      states: vi
        .fn()
        .mockResolvedValue(
          new Map([[ITEM, { outcome: 'pending', deadline: new Date(PAYLOAD.deadline) }]]),
        ),
      deckContext: vi.fn().mockResolvedValue({ personal: false, members: MEMBERS }),
      deckMembers: vi.fn().mockResolvedValue(MEMBERS),
      categoryVisibilities: vi.fn().mockResolvedValue(new Map([[ITEM, ['members']]])),
      dismiss: vi.fn().mockImplementation(async () => row({ status: 'archived' })),
    };
    decisions = { record: vi.fn() };
    service = createRemindersService({
      reminders: repo as never,
      limits: { maxDeadlineDays: 30, maxShowBeforeDays: 7, resolutionMax: 10 },
      decisions: decisions as never,
      now: () => NOW,
    });
  });

  describe('checkPayload (D291/D293/D299)', () => {
    it('accepts a valid payload', async () => {
      await expect(service.checkPayload({ actor: actor(), ...shared }, PAYLOAD)).resolves.toEqual(
        PAYLOAD,
      );
    });

    it('422 on a deadline past the env cap', async () => {
      const deadline = new Date(NOW.getTime() + 31 * DAY_MS).toISOString();
      await expect(
        service.checkPayload({ actor: actor(), ...shared }, { ...PAYLOAD, deadline }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('422 on show-before past the env cap', async () => {
      await expect(
        service.checkPayload(
          { actor: actor(), ...shared },
          { ...PAYLOAD, showBefore: { amount: 8, unit: 'days' } },
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('keeps an unchanged past deadline on edit', async () => {
      const past = row({ payload: { ...PAYLOAD, deadline: '2026-10-01T00:00:00.000Z' } });
      await expect(
        service.checkPayload(
          { actor: actor(), ...shared },
          { ...PAYLOAD, deadline: '2026-10-01T00:00:00.000Z' },
          { item: past },
        ),
      ).resolves.toMatchObject({ deadline: '2026-10-01T00:00:00.000Z' });
    });

    it('422 when a picked person is not a writer (refused event)', async () => {
      const payload = { ...PAYLOAD, dismiss: { mode: 'people', userIds: [READER] } };
      await expect(
        service.checkPayload({ actor: actor(), ...shared }, payload),
      ).rejects.toMatchObject({ status: 422 });
      expect(decisions.record).toHaveBeenCalledWith(
        'reminder.dismissers',
        expect.objectContaining({ outcome: 'refused', reason: 'not_writer', requestId: 'req-1' }),
      );
    });

    it('403 when someone other than the creator changes the rule', async () => {
      const payload = { ...PAYLOAD, dismiss: { mode: 'me', userIds: [] } };
      await expect(
        service.checkPayload({ actor: actor(WRITER), role: 'editor', deck: shared.deck }, payload, {
          item: row(),
        }),
      ).rejects.toMatchObject({ status: 403, type: '/problems/reminder-dismissers' });
    });

    it('personal decks store mode "me"', async () => {
      const payload = { ...PAYLOAD, dismiss: { mode: 'people', userIds: [WRITER] } };
      await expect(
        service.checkPayload(
          { actor: actor(), role: 'owner', deck: { id: DECK, kind: 'personal' } },
          payload,
        ),
      ).resolves.toMatchObject({ dismiss: { mode: 'me', userIds: [] } });
    });
  });

  describe('states (D291)', () => {
    it('reports hidden, canDismiss and canChangeDismissers', async () => {
      const states = await service.states(USER, [row()], 'owner');
      expect(states.get(ITEM)).toMatchObject({
        state: 'pending',
        hidden: true,
        canDismiss: true,
        canChangeDismissers: true,
        timeZone: 'Europe/London',
      });
    });

    it('a reader cannot dismiss a writers-only reminder', async () => {
      const states = await service.states({ ...USER, id: READER }, [row()], 'reader');
      expect(states.get(ITEM)).toMatchObject({ canDismiss: false, canChangeDismissers: false });
    });

    it('skips rows that are not reminders', async () => {
      const states = await service.states(USER, [row({ type: 'text', revealAt: null })], 'owner');
      expect(states.size).toBe(0);
      expect(repo.states).not.toHaveBeenCalled();
    });
  });

  describe('dismiss (D294)', () => {
    it('records done with a trimmed resolution and the accepted event', async () => {
      await service.dismiss(actor(), row(), { done: true, resolution: '  ok  ' });
      expect(repo.dismiss).toHaveBeenCalledWith(
        ITEM,
        { outcome: 'done', by: ME, resolution: 'ok' },
        [expect.objectContaining({ kind: 'completed' })],
      );
      expect(decisions.record).toHaveBeenCalledWith(
        'reminder.dismiss',
        expect.objectContaining({ outcome: 'accepted', reason: 'done' }),
      );
    });

    it('403 for someone who is not a dismisser', async () => {
      await expect(service.dismiss(actor(READER), row(), { done: false })).rejects.toMatchObject({
        status: 403,
        type: '/problems/not-a-dismisser',
      });
      expect(repo.dismiss).not.toHaveBeenCalled();
    });

    it('409 when the reminder is no longer pending', async () => {
      repo.states.mockResolvedValue(new Map([[ITEM, { outcome: 'done' }]]));
      await expect(service.dismiss(actor(), row(), { done: false })).rejects.toMatchObject({
        status: 409,
      });
    });

    it('409 when another dismiss won the race', async () => {
      repo.dismiss.mockResolvedValue(null);
      await expect(service.dismiss(actor(), row(), { done: false })).rejects.toMatchObject({
        status: 409,
      });
    });

    it('409 on a proposal', async () => {
      await expect(
        service.dismiss(actor(), row({ status: 'proposed' }), { done: true }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('422 when the resolution is over the env limit', async () => {
      await expect(
        service.dismiss(actor(), row(), { done: true, resolution: 'x'.repeat(11) }),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('assertCanDelete (D293)', () => {
    it('owners delete anything; an editor only their own reminder', () => {
      expect(() => service.assertCanDelete(actor(), row(), 'owner')).not.toThrow();
      expect(() => service.assertCanDelete(actor(), row(), 'editor')).not.toThrow();
      expect(() => service.assertCanDelete(actor(WRITER), row(), 'editor')).toThrowError(
        expect.objectContaining({ status: 403 }),
      );
      expect(() => service.assertCanDelete(actor(), row({ type: 'text' }), 'editor')).toThrow();
    });
  });
});
