import { describe, expect, it, vi } from 'vitest';
import type { DeckRow, ItemRow } from '@gobbit/db';
import { PENDING_LIST_MAX, type DismisserMember } from '@gobbit/shared/reminders';
import type { MemberRole } from '@gobbit/shared';
import type { ComingUpRow } from '../repositories/event-cards.repo';
import type { PendingReminderRow } from '../repositories/reminders.repo';
import { createPendingService, PENDING_SCAN_MAX } from './pending.service';
import type { CurrentUser } from '../types';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const HOUR_MS = 3_600_000;
const DECK = '00000000-0000-4000-8000-0000000000d1';
const ME = '00000000-0000-4000-8000-0000000000a1';
const OWNER = '00000000-0000-4000-8000-0000000000a2';
const USER: CurrentUser = { id: ME, accountId: 'acc', email: 'me@example.test', displayName: 'me' };
const DECK_ROW = { id: DECK, slug: 'home', name: 'Home', kind: 'shared' } as DeckRow;

let seq = 0;
function reminder(
  o: {
    dueIn?: number;
    revealIn?: number;
    createdBy?: string;
    mode?: 'me' | 'writers' | 'people';
    userIds?: string[];
  } = {},
): PendingReminderRow {
  seq += 1;
  const deadline = new Date(NOW.getTime() + (o.dueIn ?? 1) * HOUR_MS);
  const item = {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    deckId: DECK,
    type: 'reminder',
    title: `R${seq}`,
    createdBy: o.createdBy ?? OWNER,
    revealAt: new Date(NOW.getTime() + (o.revealIn ?? -1) * HOUR_MS),
    payload: {
      deadline: deadline.toISOString(),
      showBefore: { amount: 1, unit: 'hours' },
      dismiss: { mode: o.mode ?? 'writers', userIds: o.userIds ?? [] },
      timeZone: 'UTC',
    },
  } as unknown as ItemRow;
  return { item, deadline };
}

function event(
  o: { startsIn?: number; mode?: 'everyone' | 'me' | 'nobody'; location?: string } = {},
): ComingUpRow {
  seq += 1;
  const startsAt = new Date(NOW.getTime() + (o.startsIn ?? 2) * HOUR_MS);
  const item = {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    deckId: DECK,
    type: 'event',
    title: `E${seq}`,
    createdBy: OWNER,
    payload: {
      allDay: false,
      start: startsAt.toISOString(),
      timeZone: 'UTC',
      ...(o.location ? { location: o.location } : {}),
      notify: {
        before: [{ amount: 1, unit: 'days' }],
        audience: { mode: o.mode ?? 'everyone', userIds: [] },
      },
    },
  } as unknown as ItemRow;
  return {
    item,
    span: {
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      allDay: false,
      timeZone: 'UTC',
    },
  };
}

function service(
  rows: PendingReminderRow[],
  o: {
    role?: MemberRole;
    members?: DismisserMember[];
    events?: ComingUpRow[];
    muted?: string[];
  } = {},
) {
  const role = o.role ?? 'editor';
  const members = o.members ?? [
    { userId: OWNER, role: 'owner' },
    { userId: ME, role },
  ];
  const pendingIn = vi.fn(async () => rows);
  const svc = createPendingService({
    decks: { listForUser: async () => [{ deck: DECK_ROW, role }] },
    reminders: {
      pendingIn,
      deckContext: async () => ({ personal: false, members }),
      categoryVisibilities: async (ids) => new Map(ids.map((id) => [id, ['shared' as const]])),
    },
    events: {
      comingUpIn: async () => o.events ?? [],
      mutedBy: async () => new Set(o.muted ?? []),
    },
    now: () => NOW,
  });
  return { svc, pendingIn };
}

describe('createPendingService (037, D298)', () => {
  it('lists revealed reminders the member may dismiss and marks the overdue ones', async () => {
    const late = reminder({ dueIn: -2 });
    const soon = reminder({ dueIn: 1 });
    const notMine = reminder({ mode: 'me' });
    const { svc, pendingIn } = service([late, soon, notMine]);
    const list = await svc.list(USER);
    expect(list.items.map((p) => [p.title, p.overdue])).toEqual([
      [late.item.title, true],
      [soon.item.title, false],
    ]);
    expect(list.items[0]).toMatchObject({ kind: 'reminder', deck: { slug: 'home', name: 'Home' } });
    expect(pendingIn).toHaveBeenCalledWith([DECK], PENDING_SCAN_MAX);
  });

  it('puts hidden reminders the member created in Upcoming, soonest reveal first', async () => {
    const later = reminder({ createdBy: ME, revealIn: 48, dueIn: 49 });
    const sooner = reminder({ createdBy: ME, revealIn: 5, dueIn: 400 });
    const someoneElses = reminder({ revealIn: 2, dueIn: 3 });
    const { svc } = service([later, sooner, someoneElses]);
    const list = await svc.list(USER);
    expect(list.items).toEqual([]);
    expect(list.upcoming.map((p) => p.title)).toEqual([sooner.item.title, later.item.title]);
  });

  it('drops Upcoming entries once the creator can no longer edit the deck', async () => {
    const { svc } = service([reminder({ createdBy: ME, revealIn: 5, dueIn: 6 })], {
      role: 'reader',
    });
    expect((await svc.list(USER)).upcoming).toEqual([]);
  });

  it('falls back to the owners when nobody picked can still act', async () => {
    const orphan = reminder({ mode: 'people', userIds: ['gone'], createdBy: 'gone' });
    const asOwner = service([orphan], { role: 'owner', members: [{ userId: ME, role: 'owner' }] });
    expect((await asOwner.svc.list(USER)).items).toHaveLength(1);
  });

  it('answers empty without loading deck context when nothing is pending', async () => {
    const { svc } = service([]);
    expect(await svc.list(USER)).toEqual({ items: [], upcoming: [], comingUp: [] });
  });

  it('caps each section', async () => {
    const rows = Array.from({ length: PENDING_LIST_MAX + 5 }, () => reminder());
    expect((await service(rows).svc.list(USER)).items).toHaveLength(PENDING_LIST_MAX);
  });
});

describe('Coming up (042, D366)', () => {
  it('lists events notifying the member, in the order the query returns (soonest start)', async () => {
    const first = event({ startsIn: 1, location: 'Town hall' });
    const second = event({ startsIn: 5 });
    const list = await service([], { events: [first, second] }).svc.list(USER);
    expect(list.items).toEqual([]);
    expect(list.comingUp.map((e) => e.title)).toEqual([first.item.title, second.item.title]);
    expect(list.comingUp[0]).toEqual({
      kind: 'event',
      itemId: first.item.id,
      title: first.item.title,
      deck: { slug: 'home', name: 'Home' },
      startsAt: first.span.startsAt.toISOString(),
      endsAt: first.span.endsAt.toISOString(),
      allDay: false,
      timeZone: 'UTC',
      location: 'Town hall',
    });
    expect(list.comingUp[1]!.location).toBeNull();
  });

  it('leaves out events the member muted or is not notified about', async () => {
    const muted = event();
    const onlyCreator = event({ mode: 'me' });
    const nobody = event({ mode: 'nobody' });
    const kept = event();
    const list = await service([], {
      events: [muted, onlyCreator, nobody, kept],
      muted: [muted.item.id],
    }).svc.list(USER);
    expect(list.comingUp.map((e) => e.itemId)).toEqual([kept.item.id]);
  });

  it('caps the section', async () => {
    const events = Array.from({ length: PENDING_LIST_MAX + 3 }, () => event());
    expect((await service([], { events }).svc.list(USER)).comingUp).toHaveLength(PENDING_LIST_MAX);
  });
});
