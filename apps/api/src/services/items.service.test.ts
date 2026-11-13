import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createItemsService } from './items.service';
import { createRemindersService } from './reminders.service';
import { createEventCardsService } from './event-cards.service';
import type { Actor, CurrentUser } from '../types';

type ItemsRepo = any;
type CategoriesRepo = any;
type DecksRepo = any;
type FavoritesRepo = any;

const USER: CurrentUser = {
  id: 'u1',
  accountId: 'a1',
  email: 'dev@example.test',
  displayName: 'dev',
};

/** D130: every service method takes the acting principal first. */
const ACTOR: Actor = { user: USER, via: 'session' };

const PB_ID = '550e8400-e29b-41d4-a716-446655440000';
const DEFAULT_CAT = '550e8400-e29b-41d4-a716-446655440001';

const PB_ROW = {
  id: PB_ID,
  ownerAccountId: 'a1',
  slug: 'fam',
  name: 'Family',
  kind: 'shared',
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const NOW = new Date('2026-10-20T12:00:00.000Z');
const DAY_MS = 86_400_000;

const KNOWN_CATS = new Set([DEFAULT_CAT, 'cat-2']);

function createItemRow(overrides = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440002',
    deckId: PB_ID,
    type: 'table',
    status: 'published',
    title: 'Test Item',
    body: 'Body',
    payload: {},
    sourceUrl: null,
    sourceKind: 'manual',
    verifiedAt: new Date(),
    createdBy: USER.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('createItemsService', () => {
  let service: any;
  let decks: any;
  let categories: any;
  let items: any;
  let favorites: any;
  let memberships: any;
  let embedQueue: { enqueueIfStale: ReturnType<typeof vi.fn<(id: string) => Promise<void>>> };
  let links: any;
  let remindersRepo: any;
  let decisions: { record: ReturnType<typeof vi.fn> };
  let itemDecisions: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    decks = {
      findBySlug: vi.fn().mockResolvedValue(PB_ROW),
      findById: vi.fn().mockResolvedValue(PB_ROW),
    } as unknown as DecksRepo;

    categories = {
      findDefault: vi.fn().mockResolvedValue({ id: DEFAULT_CAT }),
      findExistingIds: vi.fn().mockImplementation((pbId: string, ids: string[]) => {
        return Promise.resolve(ids.filter((id) => KNOWN_CATS.has(id)));
      }),
    } as unknown as CategoriesRepo;

    items = {
      create: vi.fn().mockResolvedValue(createItemRow()),
      findById: vi.fn().mockResolvedValue(createItemRow()),
      findByIdIncludingDeleted: vi.fn().mockResolvedValue(createItemRow()),
      update: vi.fn().mockResolvedValue(createItemRow()),
      undelete: vi.fn().mockResolvedValue(createItemRow()),
      softDelete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      listDeleted: vi.fn().mockResolvedValue([]),
      listUpcoming: vi.fn().mockResolvedValue([]),
      isVisibleTo: vi.fn().mockResolvedValue(true),
      categoryIdsFor: vi.fn().mockResolvedValue(new Map([[PB_ID, [DEFAULT_CAT]]])),
    } as unknown as ItemsRepo;

    favorites = {
      favoritedAmong: vi.fn().mockResolvedValue(new Set()),
    } as unknown as FavoritesRepo;

    memberships = { findActive: vi.fn().mockResolvedValue(null) };
    embedQueue = { enqueueIfStale: vi.fn().mockResolvedValue(undefined) };
    links = {
      checks: {
        flagsFor: vi.fn().mockResolvedValue(new Map()),
        find: vi.fn().mockResolvedValue(null),
        dismiss: vi.fn().mockResolvedValue(true),
      },
      checker: { checkOne: vi.fn().mockResolvedValue(undefined) },
      previewFields: vi.fn(async (_deckId: string, payload: unknown) => payload),
      snapshotQueue: { enqueueIfNeeded: vi.fn().mockResolvedValue(undefined) },
      rateLimits: { enforce: vi.fn().mockResolvedValue(undefined) },
    };

    remindersRepo = {
      states: vi.fn().mockResolvedValue(new Map()),
      deckContext: vi.fn().mockResolvedValue({ personal: false, members: [] }),
      deckMembers: vi.fn().mockResolvedValue([]),
      categoryVisibilities: vi.fn().mockResolvedValue(new Map()),
      dismiss: vi.fn(),
    };
    decisions = { record: vi.fn() };
    itemDecisions = { record: vi.fn() };

    service = createItemsService({
      decks,
      categories,
      items,
      favorites,
      memberships,
      embedQueue,
      mediaReference: async (_deckId, _type, payload) => payload,
      decisions: itemDecisions as any,
      links,
      reminders: createRemindersService({
        reminders: remindersRepo,
        limits: { maxDeadlineDays: 1825, maxShowBeforeDays: 365, resolutionMax: 600 },
        decisions: decisions as any,
        now: () => NOW,
      }),
      eventCards: createEventCardsService({
        events: {
          spans: vi.fn().mockResolvedValue(new Map()),
          currentNotices: vi.fn().mockResolvedValue(new Map()),
          mutedBy: vi.fn().mockResolvedValue(new Set()),
          setMute: vi.fn().mockResolvedValue(undefined),
        },
        members: remindersRepo,
        limits: {
          notifyTimesMax: 3,
          notifyBeforeMaxDays: 30,
          startMaxDays: 1825,
          locationMax: 200,
          allDayNoticeHour: 9,
        },
        decisions: decisions as any,
        now: () => NOW,
      }),
      now: () => NOW,
    });
  });

  /** Makes USER a `role` member of a deck owned by another account. */
  function actAs(role: string) {
    decks.findById.mockResolvedValue({ ...PB_ROW, ownerAccountId: 'other-account' });
    decks.findBySlug.mockResolvedValue({ ...PB_ROW, ownerAccountId: 'other-account' });
    memberships.findActive.mockResolvedValue({ role, acceptedAt: new Date() });
  }

  describe('create', () => {
    it('D6: uses default category when categoryIds not provided', async () => {
      const input = {
        type: 'text',
        title: 'New Item',
        body: '',
        payload: {},
      };

      await service.create(ACTOR, 'fam', input);

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deckId: PB_ID,
        }),
        [DEFAULT_CAT],
        [expect.objectContaining({ kind: 'created', via: 'session', actorUserId: USER.id })],
        expect.any(Function),
      );
      expect(embedQueue.enqueueIfStale).toHaveBeenCalledWith(createItemRow().id);
    });

    it('rejects unknown category id with 400 error at path categoryIds', async () => {
      const input = {
        type: 'text',
        title: 'New Item',
        body: '',
        categoryIds: ['unknown-cat-id'],
        payload: {},
      };

      await expect(service.create(ACTOR, 'fam', input)).rejects.toMatchObject({
        status: 400,
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: 'categoryIds',
          }),
        ]),
      });

      expect(items.create).not.toHaveBeenCalled();
    });

    it('D13: sets verifiedAt to Date when status is published', async () => {
      const input = {
        type: 'text',
        title: 'New Item',
        body: '',
        status: 'published',
        payload: {},
      };

      await service.create(ACTOR, 'fam', input);

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'published',
          verifiedAt: expect.any(Date),
        }),
        expect.any(Array),
        expect.any(Array),
        expect.any(Function),
      );
    });

    it('D13: sets verifiedAt to null when status is proposed', async () => {
      const input = {
        type: 'text',
        title: 'New Item',
        body: '',
        status: 'proposed',
        payload: {},
      };

      await service.create(ACTOR, 'fam', input);

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'proposed',
          verifiedAt: null,
        }),
        expect.any(Array),
        expect.any(Array),
        expect.any(Function),
      );
    });
  });

  describe('the image alias (D387)', () => {
    const aliasLogged = (route: string) =>
      expect(itemDecisions.record).toHaveBeenCalledWith(
        'item.type_alias',
        expect.objectContaining({
          outcome: 'accepted',
          reason: 'image',
          actorId: USER.id,
          route,
        }),
      );

    it('creates a media card from type image and a flat payload, and logs it', async () => {
      await service.create({ ...ACTOR, requestId: 'req-1' }, 'fam', {
        type: 'image',
        title: 'Bread',
        body: '',
        payload: { publicId: 'p/1', alt: 'A loaf', width: 3, height: 4 },
      });
      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'media',
          payload: {
            kind: 'image',
            images: [{ publicId: 'p/1', alt: 'A loaf', width: 3, height: 4 }],
          },
        }),
        expect.any(Array),
        expect.any(Array),
        expect.any(Function),
      );
      aliasLogged('create');
      expect(itemDecisions.record.mock.calls[0]![1]).toMatchObject({
        requestId: 'req-1',
        deckId: PB_ID,
      });
    });

    it('logs nothing for a media create', async () => {
      await service.create(ACTOR, 'fam', {
        type: 'media',
        title: 'Bread',
        body: '',
        payload: { kind: 'image', images: [{ publicId: 'p/1' }] },
      });
      expect(itemDecisions.record).not.toHaveBeenCalled();
    });

    it('lists media for ?type=image and logs it', async () => {
      await service.list(ACTOR, 'fam', { status: 'published', type: 'image', limit: 20 });
      expect(items.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'media' }));
      aliasLogged('list');
    });

    it('reshapes a flat photo payload sent for a media card', async () => {
      items.findById.mockResolvedValue(
        createItemRow({
          type: 'media',
          payload: { kind: 'image', images: [{ publicId: 'p/1' }] },
        }),
      );
      items.categoryIdsFor.mockResolvedValue(
        new Map([['550e8400-e29b-41d4-a716-446655440002', [DEFAULT_CAT]]]),
      );
      await service.update(ACTOR, '550e8400-e29b-41d4-a716-446655440002', {
        type: 'image',
        payload: { publicId: 'p/2', alt: 'New' },
      });
      expect(items.update).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440002',
        expect.objectContaining({
          payload: { kind: 'image', images: [{ publicId: 'p/2', alt: 'New' }] },
        }),
        undefined,
        expect.any(Array),
        undefined,
      );
      aliasLogged('update');
    });
  });

  describe('update', () => {
    it('D6: rejects empty categoryIds on published item with 422', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      items.findById.mockResolvedValue(createItemRow({ status: 'published', type: 'text' }));
      items.categoryIdsFor.mockResolvedValue(new Map([[itemId, [DEFAULT_CAT]]]));

      const patch = { categoryIds: [] };

      await expect(service.update(ACTOR, itemId, patch)).rejects.toMatchObject({
        status: 422,
        type: '/problems/item-needs-category',
      });

      expect(items.update).not.toHaveBeenCalled();
      expect(embedQueue.enqueueIfStale).not.toHaveBeenCalled();
    });

    it('D6: allows empty categoryIds when status is archived', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      items.findById.mockResolvedValue(createItemRow({ status: 'published', type: 'text' }));
      items.categoryIdsFor.mockResolvedValue(new Map([[itemId, [DEFAULT_CAT]]]));

      const patch = { categoryIds: [], status: 'archived' };

      await service.update(ACTOR, itemId, patch);

      expect(items.update).toHaveBeenCalled();
      expect(embedQueue.enqueueIfStale).toHaveBeenCalledTimes(1);
    });

    it('D12/042: rejects a change of type with 409 type-change-not-supported', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      items.findById.mockResolvedValue(createItemRow());

      const patch = { type: 'link' } as any;

      await expect(service.update(ACTOR, itemId, patch)).rejects.toMatchObject({
        status: 409,
        type: '/problems/type-change-not-supported',
      });
    });

    it('rejects invalid payload for stored type', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      items.findById.mockResolvedValue(createItemRow({ type: 'table' }));

      const patch = { payload: { columns: [] } };

      await expect(service.update(ACTOR, itemId, patch)).rejects.toThrow();
    });

    it('returns 404 for item owned by different account', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      const otherItem = createItemRow({ deckId: 'other-pb' });
      items.findById.mockResolvedValue(otherItem);
      decks.findById.mockResolvedValue({
        ...PB_ROW,
        ownerAccountId: 'other-account',
      });

      const patch = { title: 'Updated' };

      await expect(service.update(ACTOR, itemId, patch)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('403s a reader member trying to update', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      decks.findById.mockResolvedValue({ ...PB_ROW, ownerAccountId: 'other-account' });
      memberships.findActive.mockResolvedValue({ role: 'reader', acceptedAt: new Date() });

      await expect(service.update(ACTOR, itemId, { title: 'x' })).rejects.toMatchObject({
        status: 403,
      });
      expect(items.update).not.toHaveBeenCalled();
    });
  });

  describe('archive / restore (D131)', () => {
    const itemId = '550e8400-e29b-41d4-a716-446655440002';

    it('archive: 409 invalid-transition on a proposal, nothing written', async () => {
      items.findById.mockResolvedValue(createItemRow({ status: 'proposed', verifiedAt: null }));

      await expect(service.archive(ACTOR, itemId)).rejects.toMatchObject({
        status: 409,
        type: '/problems/invalid-transition',
      });
      expect(items.update).not.toHaveBeenCalled();
    });

    it('archive: idempotent on an archived card (no write)', async () => {
      items.findById.mockResolvedValue(createItemRow({ status: 'archived' }));

      const dto = await service.archive(ACTOR, itemId);

      expect(dto.status).toBe('archived');
      expect(items.update).not.toHaveBeenCalled();
    });

    it('restore: archived → published without touching verifiedAt, then re-embeds if stale', async () => {
      const verifiedAt = new Date('2026-01-02T03:04:05.000Z');
      items.findById.mockResolvedValue(createItemRow({ status: 'archived', verifiedAt }));
      items.update.mockResolvedValue(createItemRow({ status: 'published', verifiedAt }));

      const dto = await service.restore(ACTOR, itemId);

      expect(items.update).toHaveBeenCalledWith(
        itemId,
        { status: 'published' },
        undefined,
        [expect.objectContaining({ kind: 'restored', via: 'session', actorUserId: USER.id })],
        undefined,
      );
      expect(dto.verifiedAt).toBe(verifiedAt.toISOString());
      expect(embedQueue.enqueueIfStale).toHaveBeenCalledWith(itemId);
    });

    it('restore: idempotent on a published card (no write)', async () => {
      items.findById.mockResolvedValue(createItemRow({ status: 'published' }));

      const dto = await service.restore(ACTOR, itemId);

      expect(dto.status).toBe('published');
      expect(items.update).not.toHaveBeenCalled();
      expect(embedQueue.enqueueIfStale).not.toHaveBeenCalled();
    });

    it('restore: 409 invalid-transition on a proposal', async () => {
      items.findById.mockResolvedValue(createItemRow({ status: 'proposed', verifiedAt: null }));

      await expect(service.restore(ACTOR, itemId)).rejects.toMatchObject({
        status: 409,
        type: '/problems/invalid-transition',
      });
      expect(items.update).not.toHaveBeenCalled();
    });

    it('restore: 403 for a reader', async () => {
      actAs('reader');
      items.findById.mockResolvedValue(createItemRow({ status: 'archived' }));

      await expect(service.restore(ACTOR, itemId)).rejects.toMatchObject({ status: 403 });
    });

    it('update: 409 use-restore on archived → published, nothing written', async () => {
      items.findById.mockResolvedValue(createItemRow({ status: 'archived', type: 'text' }));

      await expect(
        service.update(ACTOR, itemId, { status: 'published', title: 'x' }),
      ).rejects.toMatchObject({ status: 409, type: '/problems/use-restore' });
      expect(items.update).not.toHaveBeenCalled();
    });

    it("update: status 'archived' on a proposal is 409 invalid-transition", async () => {
      items.findById.mockResolvedValue(
        createItemRow({ status: 'proposed', type: 'text', verifiedAt: null }),
      );

      await expect(service.update(ACTOR, itemId, { status: 'archived' })).rejects.toMatchObject({
        status: 409,
        type: '/problems/invalid-transition',
      });
    });

    it('update: publishing a proposal sets verifiedAt (first publication)', async () => {
      items.findById.mockResolvedValue(
        createItemRow({ status: 'proposed', type: 'text', verifiedAt: null }),
      );
      items.categoryIdsFor.mockResolvedValue(new Map([[itemId, [DEFAULT_CAT]]]));

      await service.update(ACTOR, itemId, { status: 'published' });

      expect(items.update).toHaveBeenCalledWith(
        itemId,
        expect.objectContaining({ status: 'published', verifiedAt: NOW }),
        undefined,
        [expect.objectContaining({ kind: 'published', via: 'session', actorUserId: USER.id })],
        undefined,
      );
    });
  });

  describe('remove / undelete / listDeleted (D132)', () => {
    const itemId = '550e8400-e29b-41d4-a716-446655440002';

    it('remove: soft-deletes at the service clock', async () => {
      await service.remove(ACTOR, itemId);

      expect(items.softDelete).toHaveBeenCalledWith(itemId, NOW, [
        expect.objectContaining({ kind: 'deleted', via: 'session', actorUserId: USER.id }),
      ]);
    });

    it('undelete: inside the window clears deleted_at and re-embeds if stale', async () => {
      items.findByIdIncludingDeleted.mockResolvedValue(
        createItemRow({ deletedAt: new Date(NOW.getTime() - 29 * DAY_MS) }),
      );

      const dto = await service.undelete(ACTOR, itemId);

      expect(items.undelete).toHaveBeenCalledWith(
        itemId,
        [expect.objectContaining({ kind: 'undeleted', via: 'session', actorUserId: USER.id })],
        undefined,
      );
      expect(embedQueue.enqueueIfStale).toHaveBeenCalledWith(itemId);
      expect(dto.deletedAt).toBeUndefined();
    });

    it('undelete: idempotent on a live card (no write)', async () => {
      items.findByIdIncludingDeleted.mockResolvedValue(createItemRow({ deletedAt: null }));

      await service.undelete(ACTOR, itemId);

      expect(items.undelete).not.toHaveBeenCalled();
    });

    it('undelete: 410 undo-expired past 30 days', async () => {
      items.findByIdIncludingDeleted.mockResolvedValue(
        createItemRow({ deletedAt: new Date(NOW.getTime() - 30 * DAY_MS - 1) }),
      );

      await expect(service.undelete(ACTOR, itemId)).rejects.toMatchObject({
        status: 410,
        type: '/problems/undo-expired',
      });
      expect(items.undelete).not.toHaveBeenCalled();
    });

    it('undelete: 404 for a deleted proposal (review-owned)', async () => {
      items.findByIdIncludingDeleted.mockResolvedValue(
        createItemRow({ status: 'proposed', verifiedAt: null, deletedAt: NOW }),
      );

      await expect(service.undelete(ACTOR, itemId)).rejects.toMatchObject({ status: 404 });
    });

    it('undelete: 404 when the row is gone', async () => {
      items.findByIdIncludingDeleted.mockResolvedValue(null);

      await expect(service.undelete(ACTOR, itemId)).rejects.toMatchObject({ status: 404 });
    });

    it.each(['editor', 'reader'])('undelete: 403 for an %s', async (role) => {
      actAs(role);
      items.findByIdIncludingDeleted.mockResolvedValue(createItemRow({ deletedAt: NOW }));

      await expect(service.undelete(ACTOR, itemId)).rejects.toMatchObject({ status: 403 });
    });

    it.each(['editor', 'reader'])('listDeleted: 403 for an %s', async (role) => {
      actAs(role);

      await expect(
        service.list(ACTOR, 'fam', { status: 'deleted', limit: 20 }),
      ).rejects.toMatchObject({ status: 403 });
      expect(items.listDeleted).not.toHaveBeenCalled();
    });

    const ID_A = '550e8400-e29b-41d4-a716-44665544000a';
    const ID_B = '550e8400-e29b-41d4-a716-44665544000b';

    it('listDeleted: window start is now − 30 d; cursor carries (deletedAt, id)', async () => {
      const deletedAt = new Date(NOW.getTime() - DAY_MS);
      items.listDeleted.mockResolvedValue([
        createItemRow({ id: ID_A, deletedAt }),
        createItemRow({ id: ID_B, deletedAt }),
      ]);

      const page = await service.list(ACTOR, 'fam', { status: 'deleted', limit: 1 });

      expect(items.listDeleted).toHaveBeenCalledWith(
        expect.objectContaining({
          deckId: PB_ID,
          deletedSince: new Date(NOW.getTime() - 30 * DAY_MS),
          limit: 2,
        }),
      );
      expect(page.data).toHaveLength(1);
      expect(page.data[0].deletedAt).toBe(deletedAt.toISOString());
      expect(page.nextCursor).not.toBeNull();

      await service.list(ACTOR, 'fam', { status: 'deleted', limit: 1, cursor: page.nextCursor });
      expect(items.listDeleted).toHaveBeenLastCalledWith(
        expect.objectContaining({ after: { deletedAt: deletedAt.toISOString(), id: ID_A } }),
      );
    });
  });

  describe('link checks (D164/D165)', () => {
    const LINK = createItemRow({
      type: 'link',
      payload: { url: 'https://x.test/', preview: { title: 'T' } },
    });

    it('checks a live link now, rate limited per user', async () => {
      items.findById.mockResolvedValue(LINK);
      await service.checkLink(ACTOR, LINK.id);
      expect(links.rateLimits.enforce).toHaveBeenCalledWith(expect.stringContaining(USER.id), 10);
      expect(links.checker.checkOne).toHaveBeenCalledWith(
        { itemId: LINK.id, url: 'https://x.test/', previewTitle: 'T', check: null },
        { manual: true },
      );
    });

    it.each([
      ['not a link', createItemRow()],
      ['archived', { ...LINK, status: 'archived' }],
    ])('422 when the card is %s', async (_label, row) => {
      items.findById.mockResolvedValue(row);
      await expect(service.checkLink(ACTOR, LINK.id)).rejects.toMatchObject({ status: 422 });
      expect(links.checker.checkOne).not.toHaveBeenCalled();
    });

    it('422 for a locked host before the rate limit, without a probe (D168)', async () => {
      items.findById.mockResolvedValue({
        ...LINK,
        payload: { url: 'https://www.instagram.com/p/abc/' },
      });
      await expect(service.checkLink(ACTOR, LINK.id)).rejects.toMatchObject({
        status: 422,
        detail: "Links to Instagram can't be checked automatically",
      });
      expect(links.rateLimits.enforce).not.toHaveBeenCalled();
      expect(links.checker.checkOne).not.toHaveBeenCalled();
    });

    it('a viewer cannot check or dismiss', async () => {
      actAs('viewer');
      items.findById.mockResolvedValue(LINK);
      await expect(service.checkLink(ACTOR, LINK.id)).rejects.toMatchObject({ status: 403 });
      await expect(service.dismissLinkFlag(ACTOR, LINK.id)).rejects.toMatchObject({ status: 403 });
    });

    it('dismisses a flag, 404 without one', async () => {
      items.findById.mockResolvedValue(LINK);
      await expect(service.dismissLinkFlag(ACTOR, LINK.id)).resolves.toBeUndefined();
      expect(links.checks.dismiss).toHaveBeenCalledWith(LINK.id, NOW);
      links.checks.dismiss.mockResolvedValueOnce(false);
      await expect(service.dismissLinkFlag(ACTOR, LINK.id)).rejects.toMatchObject({ status: 404 });
    });

    it('flag=link lists published link cards only', async () => {
      const base = { status: 'published', limit: 20, flag: 'link' };
      await expect(
        service.list(ACTOR, PB_ID, { ...base, status: 'proposed' }),
      ).rejects.toMatchObject({
        status: 400,
      });
      await expect(service.list(ACTOR, PB_ID, { ...base, type: 'text' })).rejects.toMatchObject({
        status: 400,
      });
    });

    it('a saved link card is offered to the snapshot queue', async () => {
      items.create.mockResolvedValue(LINK);
      await service.create(ACTOR, PB_ID, {
        type: 'link',
        title: 'Plumber',
        body: '',
        payload: { url: 'https://x.test/' },
      });
      expect(links.previewFields).toHaveBeenCalledWith(PB_ID, { url: 'https://x.test/' }, null);
      expect(links.snapshotQueue.enqueueIfNeeded).toHaveBeenCalledWith(LINK);
    });
  });
  describe('reminders (037)', () => {
    const itemId = '550e8400-e29b-41d4-a716-446655440002';
    const OTHER = '550e8400-e29b-41d4-a716-4466554400ff';
    const PAYLOAD = {
      deadline: new Date(NOW.getTime() + 3 * DAY_MS).toISOString(),
      showBefore: { amount: 1, unit: 'days' },
      dismiss: { mode: 'writers', userIds: [] },
      timeZone: 'Europe/London',
    };
    const reminderRow = (overrides = {}) =>
      createItemRow({
        type: 'reminder',
        payload: PAYLOAD,
        revealAt: new Date(NOW.getTime() + 2 * DAY_MS),
        ...overrides,
      });

    it('D292: a hidden reminder is a 404 for a reader who did not create it', async () => {
      actAs('editor');
      items.findById.mockResolvedValue(reminderRow({ createdBy: OTHER }));

      await expect(service.get(ACTOR, itemId)).rejects.toMatchObject({ status: 404 });
    });

    it('D292: the creator and private-access roles open a hidden reminder', async () => {
      items.findById.mockResolvedValue(reminderRow({ createdBy: OTHER }));
      await expect(service.get(ACTOR, itemId)).resolves.toMatchObject({ id: itemId });

      actAs('editor');
      items.findById.mockResolvedValue(reminderRow({ createdBy: USER.id }));
      await expect(service.get(ACTOR, itemId)).resolves.toMatchObject({ id: itemId });
    });

    it('D292: a revealed reminder opens for everyone who sees the card', async () => {
      actAs('reader');
      items.findById.mockResolvedValue(
        reminderRow({ createdBy: OTHER, revealAt: new Date(NOW.getTime() - 1) }),
      );

      await expect(service.get(ACTOR, itemId)).resolves.toMatchObject({ id: itemId });
    });

    it('D292: Upcoming lists all hidden reminders for owners, only their own for others', async () => {
      await service.list(ACTOR, 'fam', { status: 'upcoming', limit: 20 });
      expect(items.listUpcoming).toHaveBeenLastCalledWith(
        expect.objectContaining({ createdBy: undefined, proposalsOf: 'all', limit: 21 }),
      );

      actAs('editor');
      await service.list(ACTOR, 'fam', { status: 'upcoming', limit: 20 });
      expect(items.listUpcoming).toHaveBeenLastCalledWith(
        expect.objectContaining({ createdBy: USER.id, proposalsOf: USER.id }),
      );
      expect(items.list).not.toHaveBeenCalled();
    });

    it('D291: create refuses a deadline in the past (422 payload.deadline)', async () => {
      const input = {
        type: 'reminder',
        title: 'Renew',
        body: '',
        payload: { ...PAYLOAD, deadline: new Date(NOW.getTime() - 1000).toISOString() },
      };

      await expect(service.create(ACTOR, 'fam', input)).rejects.toMatchObject({ status: 422 });
      expect(items.create).not.toHaveBeenCalled();
    });

    it('D293: personal decks always store mode "me"', async () => {
      decks.findBySlug.mockResolvedValue({ ...PB_ROW, kind: 'personal' });
      const input = { type: 'reminder', title: 'Renew', body: '', payload: PAYLOAD };

      await service.create(ACTOR, 'fam', input);

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({ payload: { ...PAYLOAD, dismiss: { mode: 'me', userIds: [] } } }),
        expect.anything(),
        expect.anything(),
        expect.any(Function),
      );
    });

    it("D293: an editor deletes a reminder they created, not someone else's", async () => {
      actAs('editor');
      items.findById.mockResolvedValue(reminderRow({ revealAt: NOW }));
      await service.remove(ACTOR, itemId);
      expect(items.softDelete).toHaveBeenCalledTimes(1);

      items.findById.mockResolvedValue(reminderRow({ revealAt: NOW, createdBy: OTHER }));
      await expect(service.remove(ACTOR, itemId)).rejects.toMatchObject({ status: 403 });
      expect(decisions.record).toHaveBeenLastCalledWith(
        'reminder.delete',
        expect.objectContaining({ outcome: 'refused', reason: 'not_creator' }),
      );
    });

    it('editors still cannot delete other cards', async () => {
      actAs('editor');

      await expect(service.remove(ACTOR, itemId)).rejects.toMatchObject({ status: 403 });
      expect(items.softDelete).not.toHaveBeenCalled();
    });

    it('D294: restore of a reminder reopens it in the same transaction', async () => {
      items.findById.mockResolvedValue(reminderRow({ status: 'archived', revealAt: NOW }));

      await service.restore(ACTOR, itemId);

      expect(items.update).toHaveBeenCalledWith(
        itemId,
        { status: 'published' },
        undefined,
        expect.any(Array),
        expect.any(Function),
      );
    });

    it('D294: dismiss on a non-reminder is a 409', async () => {
      await expect(service.dismiss(ACTOR, itemId, { done: true })).rejects.toMatchObject({
        status: 409,
      });
    });

    it('D294: an eligible member dismisses a pending reminder', async () => {
      const row = reminderRow({ revealAt: NOW });
      items.findById.mockResolvedValue(row);
      remindersRepo.states.mockResolvedValue(
        new Map([[itemId, { outcome: 'pending', deadline: new Date(PAYLOAD.deadline) }]]),
      );
      remindersRepo.deckContext.mockResolvedValue({
        personal: false,
        members: [{ userId: USER.id, role: 'owner' }],
      });
      remindersRepo.categoryVisibilities.mockResolvedValue(new Map([[itemId, ['members']]]));
      remindersRepo.dismiss.mockResolvedValue({ ...row, status: 'archived' });

      await service.dismiss(ACTOR, itemId, { done: true, resolution: ' renewed ' });

      expect(remindersRepo.dismiss).toHaveBeenCalledWith(
        itemId,
        { outcome: 'done', by: USER.id, resolution: 'renewed' },
        [expect.objectContaining({ kind: 'completed' })],
      );
    });
  });
});
