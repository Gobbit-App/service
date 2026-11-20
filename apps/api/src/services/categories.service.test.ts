import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import type { CurrentUser } from '../types';
import type { CategoryDecisions } from './categories.events';
import { createCategoriesService } from './categories.service';

const user: CurrentUser = { id: 'u1', accountId: 'a1', email: 'a@b.co', displayName: 'A' };
const deck = { id: 'd1', slug: 'family', ownerAccountId: 'a1' };

// D445: a name with no Latin letters gets the stable `c-<hash>` address and a decision event.
function setup() {
  const capture = captureLogger();
  const decks = {
    findBySlug: vi.fn().mockResolvedValue(deck),
    findById: vi.fn(),
    findDefaultForAccount: vi.fn(),
  };
  const categories = {
    maxPosition: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockImplementation(async (row) => ({
      id: 'c1',
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...row,
    })),
  };
  const service = createCategoriesService({
    decks: decks as never,
    categories: categories as never,
    memberships: { findActive: vi.fn() },
    decisions: decisionLogger<CategoryDecisions>('categories', { parent: capture.logger }),
  } as never);
  return { ...capture, categories, service };
}

describe('categories.service create slug (D445)', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('stores the hash address and emits categories.slug_derived for a non-Latin name', async () => {
    await t.service.create(user, 'family', { name: 'בריאות' }, { requestId: 'r1' });
    const slug = (t.categories.create.mock.calls[0][0] as { slug: string }).slug;
    expect(slug).toMatch(/^c-[0-9a-f]{8}$/);
    await t.flush();
    const line = expectDecision(t.lines, 'categories.slug_derived', { outcome: 'derived' });
    expect(line).toMatchObject({ deckId: 'd1', userId: 'u1', requestId: 'r1' });
    expect(JSON.stringify(line)).not.toContain('בריאות');
  });

  it('lets an explicit slug win and emits nothing', async () => {
    await t.service.create(user, 'family', { name: 'בריאות', slug: 'health' }, { requestId: 'r2' });
    expect((t.categories.create.mock.calls[0][0] as { slug: string }).slug).toBe('health');
    await t.flush();
    expect(t.lines.some((l) => l.event === 'categories.slug_derived')).toBe(false);
  });

  it('emits nothing for a Latin name', async () => {
    await t.service.create(user, 'family', { name: 'Health' }, { requestId: 'r3' });
    expect((t.categories.create.mock.calls[0][0] as { slug: string }).slug).toBe('health');
    await t.flush();
    expect(t.lines.some((l) => l.event === 'categories.slug_derived')).toBe(false);
  });
});
