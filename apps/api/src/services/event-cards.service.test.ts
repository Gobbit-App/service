import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemRow } from '@gobbit/db';
import type { MemberRole } from '@gobbit/shared';
import type { EventPayload } from '@gobbit/shared/events-cards';
import type { Actor } from '../types';
import {
  EVENT_AUDIENCE_UNKNOWN_MEMBER_PROBLEM,
  EVENT_NOTIFY_LOCKED_PROBLEM,
  TYPE_CHANGE_PROBLEM,
  createEventCardsService,
  createEventNoticeHook,
  sameNotify,
  type EventLimits,
  type EventWriteContext,
} from './event-cards.service';

const NOW = new Date('2030-01-01T12:00:00.000Z');
const CREATOR = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const DECK = 'd1';

const LIMITS: EventLimits = {
  notifyTimesMax: 3,
  notifyBeforeMaxDays: 30,
  startMaxDays: 365,
  locationMax: 20,
  allDayNoticeHour: 9,
};

const PAYLOAD: EventPayload = {
  allDay: false,
  start: '2030-06-01T18:00:00+03:00',
  timeZone: 'Asia/Jerusalem',
  notify: { before: [{ amount: 1, unit: 'days' }], audience: { mode: 'everyone', userIds: [] } },
};

function actor(userId: string): Actor {
  return { user: { id: userId }, via: 'session', requestId: 'req-1' } as unknown as Actor;
}

function ctx(userId = CREATOR, role: MemberRole = 'editor', kind = 'shared'): EventWriteContext {
  return { actor: actor(userId), role, deck: { id: DECK, kind } };
}

function row(o: Partial<ItemRow> = {}): ItemRow {
  return {
    id: 'i1',
    deckId: DECK,
    type: 'event',
    status: 'published',
    payload: PAYLOAD,
    createdBy: CREATOR,
    ...o,
  } as ItemRow;
}

describe('createEventCardsService', () => {
  let members: {
    deckMembers: ReturnType<typeof vi.fn>;
    deckContext: ReturnType<typeof vi.fn>;
    categoryVisibilities: ReturnType<typeof vi.fn>;
  };
  let events: {
    spans: ReturnType<typeof vi.fn>;
    currentNotices: ReturnType<typeof vi.fn>;
    mutedBy: ReturnType<typeof vi.fn>;
    setMute: ReturnType<typeof vi.fn>;
  };
  let decisions: { record: ReturnType<typeof vi.fn> };
  let service: ReturnType<typeof createEventCardsService>;

  beforeEach(() => {
    const live = [
      { userId: CREATOR, role: 'editor' },
      { userId: OTHER, role: 'owner' },
    ];
    members = {
      deckMembers: vi.fn(async () => live),
      deckContext: vi.fn(async () => ({ personal: false, members: live })),
      categoryVisibilities: vi.fn(async () => new Map()),
    };
    events = {
      spans: vi.fn(async () => new Map()),
      currentNotices: vi.fn(async () => new Map()),
      mutedBy: vi.fn(async () => new Set()),
      setMute: vi.fn(async () => undefined),
    };
    decisions = { record: vi.fn() };
    service = createEventCardsService({
      events: events as never,
      members: members as never,
      limits: LIMITS,
      decisions: decisions as never,
      now: () => NOW,
    });
  });

  describe('checkPayload (D356/D363/D371)', () => {
    it('accepts a valid create and skips the member lookup', async () => {
      const out = await service.checkPayload(ctx(), PAYLOAD);
      expect(out).toEqual({ payload: PAYLOAD, notifyChanged: false });
      expect(members.deckMembers).not.toHaveBeenCalled();
    });

    it('stores audience "me" on a personal deck', async () => {
      const out = await service.checkPayload(ctx(CREATOR, 'owner', 'personal'), {
        ...PAYLOAD,
        notify: { ...PAYLOAD.notify, audience: { mode: 'people', userIds: [OTHER] } },
      });
      expect(out.payload.notify.audience).toEqual({ mode: 'me', userIds: [] });
    });

    it.each([
      ['start_too_far', { start: '2031-06-01T18:00:00Z' }, 'payload.start'],
      ['location_too_long', { location: 'x'.repeat(21) }, 'payload.location'],
      [
        'before_too_long',
        {
          notify: {
            before: [{ amount: 31, unit: 'days' }],
            audience: { mode: 'everyone', userIds: [] },
          },
        },
        'payload.notify.before',
      ],
    ])('refuses %s with 422 and a decision event', async (reason, over, path) => {
      await expect(service.checkPayload(ctx(), { ...PAYLOAD, ...over })).rejects.toMatchObject({
        status: 422,
        errors: [expect.objectContaining({ path })],
      });
      expect(decisions.record).toHaveBeenCalledWith(
        'event.write',
        expect.objectContaining({ outcome: 'refused', reason, requestId: 'req-1', deckId: DECK }),
      );
    });

    it('refuses more notify times than the env limit', async () => {
      const limited = createEventCardsService({
        events: events as never,
        members: members as never,
        limits: { ...LIMITS, notifyTimesMax: 1 },
        decisions: decisions as never,
        now: () => NOW,
      });
      const payload = {
        ...PAYLOAD,
        notify: {
          before: [
            { amount: 1, unit: 'days' },
            { amount: 1, unit: 'hours' },
          ],
          audience: { mode: 'everyone', userIds: [] },
        },
      };
      await expect(limited.checkPayload(ctx(), payload)).rejects.toMatchObject({ status: 422 });
      expect(decisions.record).toHaveBeenCalledWith(
        'event.write',
        expect.objectContaining({ reason: 'too_many_times' }),
      );
    });

    it('keeps a far start that did not move (the limit applies to new starts only)', async () => {
      const far = { ...PAYLOAD, start: '2031-06-01T18:00:00Z' };
      const out = await service.checkPayload(
        ctx(),
        { ...far, location: 'Hall' },
        {
          item: row({ payload: far }),
        },
      );
      expect(out.payload.location).toBe('Hall');
    });

    it('accepts a past start', async () => {
      const out = await service.checkPayload(ctx(), { ...PAYLOAD, start: '2020-01-01T10:00:00Z' });
      expect(out.payload.start).toBe('2020-01-01T10:00:00Z');
    });

    it('refuses people who are not live members (422 audience-unknown-member)', async () => {
      const payload = {
        ...PAYLOAD,
        notify: {
          ...PAYLOAD.notify,
          audience: { mode: 'people', userIds: ['00000000-0000-4000-8000-000000000009'] },
        },
      };
      await expect(service.checkPayload(ctx(), payload)).rejects.toMatchObject({
        status: 422,
        type: EVENT_AUDIENCE_UNKNOWN_MEMBER_PROBLEM,
      });
      expect(decisions.record).toHaveBeenCalledWith(
        'event.write',
        expect.objectContaining({ reason: 'audience_unknown_member' }),
      );
    });

    it('lets the creator change notify after publish and reports the change', async () => {
      const next = {
        ...PAYLOAD,
        notify: { ...PAYLOAD.notify, before: [{ amount: 2, unit: 'hours' }] },
      };
      const out = await service.checkPayload(ctx(CREATOR), next, { item: row() });
      expect(out.notifyChanged).toBe(true);
    });

    it('locks notify for someone else while the creator is a member (409)', async () => {
      const next = {
        ...PAYLOAD,
        notify: { ...PAYLOAD.notify, before: [{ amount: 2, unit: 'hours' }] },
      };
      await expect(
        service.checkPayload(ctx(OTHER, 'owner'), next, { item: row() }),
      ).rejects.toMatchObject({ status: 409, type: EVENT_NOTIFY_LOCKED_PROBLEM });
      expect(decisions.record).toHaveBeenCalledWith(
        'event.notify_settings',
        expect.objectContaining({ outcome: 'refused', reason: 'not_creator', itemId: 'i1' }),
      );
    });

    it('lets an owner change notify once the creator left', async () => {
      members.deckMembers.mockResolvedValue([{ userId: OTHER, role: 'owner' }]);
      const next = {
        ...PAYLOAD,
        notify: { ...PAYLOAD.notify, before: [{ amount: 2, unit: 'hours' }] },
      };
      const out = await service.checkPayload(ctx(OTHER, 'owner'), next, { item: row() });
      expect(out.notifyChanged).toBe(true);
    });

    it('lets anyone edit other fields of a locked event', async () => {
      const out = await service.checkPayload(
        ctx(OTHER, 'editor'),
        { ...PAYLOAD, location: 'Hall' },
        { item: row() },
      );
      expect(out.notifyChanged).toBe(false);
    });
  });

  it('refuseTypeChange: 409 and a decision event when an event is involved', () => {
    expect(() => service.refuseTypeChange(ctx(), row(), 'link')).toThrow(
      expect.objectContaining({ status: 409, type: TYPE_CHANGE_PROBLEM }),
    );
    expect(decisions.record).toHaveBeenCalledWith(
      'event.write',
      expect.objectContaining({ reason: 'type_change', itemId: 'i1' }),
    );
    decisions.record.mockClear();
    expect(() => service.refuseTypeChange(ctx(), row({ type: 'text' }), 'link')).toThrow();
    expect(decisions.record).not.toHaveBeenCalled();
  });

  it('states(): span, notices, mute and audience for event rows only', async () => {
    const span = {
      itemId: 'i1',
      startsAt: new Date('2030-06-01T15:00:00Z'),
      endsAt: new Date('2030-06-01T16:00:00Z'),
      allDay: false,
      timeZone: 'Asia/Jerusalem',
    };
    events.spans.mockResolvedValue(new Map([['i1', span]]));
    events.currentNotices.mockResolvedValue(
      new Map([
        [
          'i1',
          [
            {
              id: 'n1',
              amount: 1,
              unit: 'days',
              fireAt: new Date('2030-05-31T15:00:00Z'),
              state: 'pending',
            },
          ],
        ],
      ]),
    );
    events.mutedBy.mockResolvedValue(new Set(['i1']));
    const user = { id: OTHER } as never;
    const states = await service.states(user, [row(), row({ id: 'i2', type: 'text' })], 'owner');
    expect([...states.keys()]).toEqual(['i1']);
    expect(states.get('i1')).toEqual({
      startsAt: '2030-06-01T15:00:00.000Z',
      endsAt: '2030-06-01T16:00:00.000Z',
      allDay: false,
      timeZone: 'Asia/Jerusalem',
      notices: [{ amount: 1, unit: 'days', fireAt: '2030-05-31T15:00:00.000Z', state: 'pending' }],
      muted: true,
      inAudience: true,
      canEditNotify: false,
    });
  });

  describe('mute (D364)', () => {
    const recorded = () =>
      decisions.record.mock.calls
        .filter(([name]) => name === 'event.mute')
        .map(([, f]) => [f.outcome, f.reason].filter(Boolean).join(':'));

    it('mutes for an audience member and records it', async () => {
      await service.mute(actor(OTHER), row(), true);
      expect(events.setMute).toHaveBeenCalledWith('i1', OTHER, true);
      expect(recorded()).toEqual(['muted']);
    });

    it('refuses a card that is not an event', async () => {
      await expect(service.mute(actor(OTHER), row({ type: 'text' }), true)).rejects.toMatchObject({
        status: 409,
        type: '/problems/not-an-event',
      });
      expect(events.setMute).not.toHaveBeenCalled();
      expect(recorded()).toEqual(['refused:not_an_event']);
    });

    it('refuses to mute for someone the event does not notify', async () => {
      const onlyMe = row({
        payload: {
          ...PAYLOAD,
          notify: { ...PAYLOAD.notify, audience: { mode: 'me', userIds: [] } },
        },
      });
      await expect(service.mute(actor(OTHER), onlyMe, true)).rejects.toMatchObject({
        status: 409,
        type: '/problems/event-not-in-audience',
      });
      expect(recorded()).toEqual(['refused:not_in_audience']);
    });

    it('always lets a reader unmute, in the audience or not', async () => {
      const nobody = row({
        payload: {
          ...PAYLOAD,
          notify: { ...PAYLOAD.notify, audience: { mode: 'nobody', userIds: [] } },
        },
      });
      await service.mute(actor(OTHER), nobody, false);
      expect(events.setMute).toHaveBeenCalledWith('i1', OTHER, false);
      expect(members.deckContext).not.toHaveBeenCalled();
      expect(recorded()).toEqual(['unmuted']);
    });
  });
});

describe('sameNotify', () => {
  it('ignores order of times and people', () => {
    expect(
      sameNotify(
        {
          before: [
            { amount: 1, unit: 'days' },
            { amount: 2, unit: 'hours' },
          ],
          audience: { mode: 'people', userIds: ['a', 'b'] },
        },
        {
          before: [
            { amount: 2, unit: 'hours' },
            { amount: 1, unit: 'days' },
          ],
          audience: { mode: 'people', userIds: ['b', 'a'] },
        },
      ),
    ).toBe(true);
  });

  it('sees a changed mode or time', () => {
    const base = PAYLOAD.notify;
    expect(sameNotify(base, { ...base, audience: { mode: 'me', userIds: [] } })).toBe(false);
    expect(sameNotify(base, { ...base, before: [{ amount: 2, unit: 'days' }] })).toBe(false);
  });
});

describe('createEventNoticeHook (D359)', () => {
  it('returns nothing for other types and a tx step for events', () => {
    const hook = createEventNoticeHook({ allDayNoticeHour: 9, now: () => NOW });
    expect(hook({ id: 'i1', type: 'text' }, {}, 'past_at_save')).toBeUndefined();
    expect(hook({ id: 'i1', type: 'event' }, PAYLOAD, 'past_at_save')).toBeTypeOf('function');
  });
});
