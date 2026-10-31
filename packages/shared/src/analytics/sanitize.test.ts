import { describe, expect, it } from 'vitest';
import { cleanEventData } from './events';
import { referrerOrigin, sanitizePayload, type SanitizeContext } from './sanitize';
import { PUBLIC_SCREENS } from './screens';

const MEMBER = '0b8f2f4e-3c1a-4d2b-9e6f-1a2b3c4d5e6f';
const DECK = '11111111-2222-4333-8444-555555555555';
const ITEM = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const ORIGIN = 'https://gobbit.example';

const ctx = (over: Partial<SanitizeContext> = {}): SanitizeContext => ({
  screen: { pattern: '/i/:item', name: 'Card' },
  memberId: MEMBER,
  online: true,
  origin: ORIGIN,
  ...over,
});

/** What Umami's tracker builds for `/i/<id>?from=search&q=allergy` in the "Smith family" deck. */
const pageView = {
  website: 'site',
  hostname: 'gobbit.example',
  screen: '390x844',
  language: 'en-GB',
  url: `/i/${ITEM}?from=search&q=allergy`,
  title: 'Allergy plan · Smith family',
  referrer: 'https://mail.example.com/inbox/123?q=smith#x',
  tag: 'smith',
  id: 'someone-else',
};

describe('sanitizePayload (D246)', () => {
  it('rewrites a page view to the pattern, the screen name and the referrer origin', () => {
    expect(sanitizePayload('event', pageView, ctx())).toEqual({
      website: 'site',
      hostname: 'gobbit.example',
      screen: '390x844',
      language: 'en-GB',
      url: '/i/:item',
      title: 'Card',
      referrer: 'https://mail.example.com',
      id: MEMBER,
    });
  });

  it('leaks no slug, title, search term or tag (US3 Smith family example)', () => {
    const sent = JSON.stringify(sanitizePayload('event', pageView, ctx()));
    for (const secret of ['smith', 'Smith', 'allergy', ITEM, 'inbox', 'someone-else']) {
      expect(sent).not.toContain(secret);
    }
  });

  it('cancels everything while offline or on an untracked screen (FR-002, FR-009)', () => {
    expect(sanitizePayload('event', pageView, ctx({ online: false }))).toBeNull();
    expect(sanitizePayload('event', pageView, ctx({ screen: null }))).toBeNull();
    expect(sanitizePayload('event', null, ctx())).toBeNull();
  });

  it('sends no id without a member, and never a non-UUID id (FR-005)', () => {
    expect(sanitizePayload('event', pageView, ctx({ memberId: null }))).not.toHaveProperty('id');
    expect(sanitizePayload('event', pageView, ctx({ memberId: 'a@b.c' }))).not.toHaveProperty('id');
  });

  it('keeps identify only for a member, without its data', () => {
    expect(sanitizePayload('identify', { ...pageView, data: { email: 'a@b.c' } }, ctx())).toEqual(
      expect.not.objectContaining({ data: expect.anything() }),
    );
    expect(sanitizePayload('identify', pageView, ctx({ memberId: undefined }))).toBeNull();
  });

  it('cancels unknown request types and event names', () => {
    expect(sanitizePayload('other', pageView, ctx())).toBeNull();
    expect(
      sanitizePayload('event', { ...pageView, name: 'search', data: { channel: 'editor' } }, ctx()),
    ).toBeNull();
  });

  it('keeps a content event with allow-listed data only (FR-006, FR-007)', () => {
    const out = sanitizePayload(
      'event',
      {
        ...pageView,
        name: 'card-created',
        data: { deckId: DECK, itemId: ITEM, type: 'text', channel: 'editor', title: 'Allergy' },
      },
      ctx(),
    );
    expect(out).toMatchObject({
      name: 'card-created',
      data: { deckId: DECK, itemId: ITEM, type: 'text', channel: 'editor' },
    });
    expect(JSON.stringify(out)).not.toContain('Allergy');
  });

  it('cancels an event without a valid channel', () => {
    expect(
      sanitizePayload('event', { ...pageView, name: 'card-shared', data: { deckId: DECK } }, ctx()),
    ).toBeNull();
  });

  it('applies the public screens unchanged (D249)', () => {
    const out = sanitizePayload(
      'event',
      { ...pageView, url: '/p/smith-family/i/x' },
      ctx({ screen: PUBLIC_SCREENS.item, memberId: undefined }),
    );
    expect(out).toMatchObject({ url: '/p/:deck/i/:item', title: 'Public card' });
  });
});

describe('cleanEventData', () => {
  it('drops invalid ids, counts and types', () => {
    expect(
      cleanEventData({ channel: 'bulk-publish', deckId: 'smith-family', count: 2.5, type: 'x' }),
    ).toEqual({ channel: 'bulk-publish' });
    expect(cleanEventData({ channel: 'import', count: 3 })).toEqual({
      channel: 'import',
      count: 3,
    });
    expect(cleanEventData({ channel: 'import', count: 0 })).toEqual({ channel: 'import' });
    expect(cleanEventData('editor')).toBeNull();
  });
});

describe('referrerOrigin', () => {
  it('keeps an external origin, empties same-origin and invalid', () => {
    expect(referrerOrigin('https://a.example/x?y', ORIGIN)).toBe('https://a.example');
    expect(referrerOrigin(`${ORIGIN}/d/smith`, ORIGIN)).toBe('');
    expect(referrerOrigin('not a url', ORIGIN)).toBe('');
    expect(referrerOrigin('android-app://com.x/y', ORIGIN)).toBe('');
    expect(referrerOrigin(undefined, ORIGIN)).toBe('');
  });
});
