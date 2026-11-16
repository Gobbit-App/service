import { describe, expect, it } from 'vitest';
import { createEventsService } from './events.service';
import type { MemberSummaries } from './member-summaries';
import type { Actor } from '../types';

const user = { id: 'me', accountId: 'acc', email: 'me@x.io', displayName: 'me' };
const actor: Actor = { user, via: 'session' };
const deck = { id: 'd1', ownerAccountId: 'acc' };
const at = new Date('2026-10-25T10:00:00.000Z');
const row = (id: string, actorUserId: string | null, actorName: string | null) => ({
  id,
  deckId: 'd1',
  itemId: null,
  actorUserId,
  via: 'session',
  kind: 'create',
  title: 'T',
  changes: null,
  createdAt: at,
  actorName,
});

describe('events.list actor (D419/D421)', () => {
  it('carries username, initials and photo from the summary; former members stay null', async () => {
    const photo = { publicId: 'p', width: 1, height: 2 };
    const svc = createEventsService({
      decks: { findById: async () => deck, findBySlug: async () => deck } as never,
      memberships: { findActive: async () => null },
      events: { list: async () => [row('e1', 'u1', 'Dana Lev'), row('e2', 'u2', null)] } as never,
      summaries: {
        summaries: async () =>
          new Map([
            ['u1', { id: 'u1', name: 'Dana Lev', username: 'dana', initials: 'DL', photo }],
          ]),
      } as unknown as MemberSummaries,
    });
    const page = await svc.list(actor, 'd1', { limit: 10 } as never);
    expect(page.data[0]?.actor).toEqual({
      userId: 'u1',
      displayName: 'Dana Lev',
      username: 'dana',
      initials: 'DL',
      photo,
    });
    expect(page.data[1]?.actor).toBeNull();
  });
});
