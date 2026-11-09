import { describe, expect, it } from 'vitest';
import type { ItemRow } from '@gobbit/db';
import type { Recipient } from '../repositories/notifications.repo';
import { audienceOf, planEventNotice, type AudienceContext } from './notify.event-plan';

const FIRE = new Date('2026-12-02T16:00:00Z');

function item(audience: { mode: string; userIds?: string[] }): ItemRow {
  return {
    id: 'i1',
    deckId: 'deck-1',
    type: 'event',
    status: 'published',
    createdBy: 'olive',
    payload: {
      allDay: false,
      start: '2026-12-03T16:00:00.000Z',
      timeZone: 'UTC',
      notify: { before: [{ amount: 1, unit: 'days' }], audience: { userIds: [], ...audience } },
    },
  } as unknown as ItemRow;
}

const shared: AudienceContext = {
  personal: false,
  members: [
    { userId: 'olive', role: 'owner' },
    { userId: 'rita', role: 'reader' },
    { userId: 'ed', role: 'editor' },
  ],
};

const person = (pushTargetIds: string[]): Recipient => ({
  userId: 'x',
  reminderEmails: true,
  pushTargetIds,
});

function plan(
  row: ItemRow,
  opts: {
    ctx?: AudienceContext;
    recipients?: Record<string, Recipient>;
    muted?: string[];
    pushOn?: boolean;
  } = {},
) {
  const ctx = opts.ctx ?? shared;
  const audience = audienceOf(row, ctx, ['shared']);
  return planEventNotice({
    claimed: { noticeId: 'n1', item: row, fireAt: FIRE, startsAt: FIRE },
    audience,
    ctx,
    recipients: new Map(Object.entries(opts.recipients ?? {})),
    muted: new Set(opts.muted ?? []),
    pushOn: opts.pushOn ?? true,
  });
}

const summary = (records: ReturnType<typeof plan>['records']) =>
  records.map((r) => [r.userId ?? '-', r.outcome, r.reason ?? ''].join(':'));

describe('audienceOf (D362)', () => {
  it('everyone who can read the card, on a shared deck', () => {
    expect(audienceOf(item({ mode: 'everyone' }), shared, ['shared'])).toEqual([
      'olive',
      'rita',
      'ed',
    ]);
  });

  it('only those who may read private categories, for a private-only card', () => {
    expect(audienceOf(item({ mode: 'everyone' }), shared, ['private'])).toEqual(['olive']);
  });

  it('only the creator on a personal deck', () => {
    expect(
      audienceOf(item({ mode: 'everyone' }), { ...shared, personal: true }, ['shared']),
    ).toEqual(['olive']);
  });
});

describe('planEventNotice (D360)', () => {
  it('one push row per device of each audience member', () => {
    const { rows, records } = plan(item({ mode: 'everyone' }), {
      recipients: {
        olive: person(['s1', 's2']),
        rita: person(['s3']),
        ed: person(['s4']),
      },
    });
    expect(rows.map((r) => `${r.userId}:${r.target}`)).toEqual([
      'olive:s1',
      'olive:s2',
      'rita:s3',
      'ed:s4',
    ]);
    expect(rows[0]).toEqual({
      itemId: 'i1',
      kind: 'event',
      noticeId: 'n1',
      deadline: FIRE,
      userId: 'olive',
      channel: 'push',
      target: 's1',
    });
    expect(summary(records)).toEqual(['-:planned:']);
  });

  it('skips muted people, people without a device and people who are gone', () => {
    const { rows, records } = plan(item({ mode: 'everyone' }), {
      recipients: { olive: person(['s1']), rita: person([]) },
      muted: ['olive'],
    });
    expect(rows).toEqual([]);
    expect(summary(records)).toEqual([
      '-:planned:',
      'olive:skipped:muted',
      'rita:skipped:no_channel',
      'ed:skipped:ineligible',
    ]);
  });

  it('plans nothing without VAPID and says so per person', () => {
    const { rows, records } = plan(item({ mode: 'me' }), {
      recipients: { olive: person(['s1']) },
      pushOn: false,
    });
    expect(rows).toEqual([]);
    expect(summary(records)).toEqual(['-:planned:', 'olive:skipped:push_off']);
  });

  it('records picked people who can no longer read the card', () => {
    const { rows, records } = plan(item({ mode: 'people', userIds: ['rita', 'gone'] }), {
      recipients: { olive: person(['s1']), rita: person(['s3']) },
    });
    expect(rows.map((r) => r.userId)).toEqual(['olive', 'rita']);
    expect(summary(records)).toEqual(['-:planned:', 'gone:skipped:ineligible']);
  });

  it('nobody means nobody, the creator included', () => {
    const { rows, records } = plan(item({ mode: 'nobody' }), {
      recipients: { olive: person(['s1']) },
    });
    expect(rows).toEqual([]);
    expect(summary(records)).toEqual(['-:planned:']);
  });
});
