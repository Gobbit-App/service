import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { DeckRow } from '@gobbit/db';
import { LINK_PREVIEW_RATE_PER_HOUR } from '@gobbit/shared';
import { HttpError } from '../errors/http-errors';
import type { SafeFetch, SafeFetchResult } from '../fetch/safe-fetch';
import type { CurrentUser } from '../types';
import { createLinkPreviewService } from './link-preview.service';

const deckId = '0b6f3a52-5d0e-4c55-9f43-2f1d8f6a7b10';
const deck = { id: deckId, ownerAccountId: 'account-1' } as DeckRow;
const user: CurrentUser = {
  id: 'user-1',
  accountId: 'account-1',
  email: 'owner@example.test',
  displayName: 'owner',
};
const og = (o: Partial<Record<'title' | 'description' | 'image' | 'siteName', string>> = {}) => ({
  title: o.title ?? null,
  description: o.description ?? null,
  image: o.image ?? null,
  siteName: o.siteName ?? null,
});

describe('linkPreview.service lookup', () => {
  const ok = (html: string): SafeFetchResult => ({
    status: 200,
    finalUrl: 'https://example.test/final',
    ms: 1,
    html,
    error: null,
  });
  const failed = (error: string): SafeFetchResult => ({
    status: null,
    finalUrl: null,
    ms: 1,
    html: null,
    error,
  });

  type Deps = Parameters<typeof createLinkPreviewService>[0];
  let safeFetch: Mock<SafeFetch>;
  let extract: Mock<Deps['extract']>;
  let rateLimits: { enforce: Mock<Deps['rateLimits']['enforce']> };
  let memberships: { findActive: Mock<Deps['memberships']['findActive']> };
  let log: Mock<(message: string) => void>;
  const decks = {
    findById: vi.fn(async (id: string) => (id === deckId ? deck : null)),
    findBySlug: vi.fn(async () => null),
    findDefaultForAccount: vi.fn(async () => null),
  };

  const build = () =>
    createLinkPreviewService({ decks, memberships, rateLimits, safeFetch, extract, log });

  beforeEach(() => {
    safeFetch = vi.fn<SafeFetch>(async () => ok('<html></html>'));
    extract = vi.fn<Deps['extract']>(() => ({ title: 'Page', og: og({ description: 'Desc' }) }));
    rateLimits = { enforce: vi.fn<Deps['rateLimits']['enforce']>().mockResolvedValue(undefined) };
    memberships = {
      findActive: vi.fn<Deps['memberships']['findActive']>().mockResolvedValue(null),
    };
    log = vi.fn<(message: string) => void>();
  });

  it('fetches through safe-fetch and maps against the final URL', async () => {
    const preview = await build().lookup({ user, deckId, url: 'https://example.test/a' });
    expect(preview).toEqual({ title: 'Page', description: 'Desc' });
    expect(safeFetch).toHaveBeenCalledWith('https://example.test/a');
    expect(extract).toHaveBeenCalledWith('<html></html>', 'https://example.test/final');
  });

  it.each(['blocked', 'timeout', 'not_html', 'too_many_redirects', 'http_404', 'fetch_failed: x'])(
    'answers null for %s and only logs the reason',
    async (error) => {
      safeFetch.mockResolvedValue(failed(error));
      expect(await build().lookup({ user, deckId, url: 'https://example.test/a' })).toBeNull();
      expect(log).toHaveBeenCalledWith(expect.stringContaining(error));
    },
  );

  it('answers null if the fetcher throws anyway', async () => {
    safeFetch.mockRejectedValue(new Error('boom'));
    expect(await build().lookup({ user, deckId, url: 'https://example.test/a' })).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('serves repeat lookups (including null) from the cache but still counts them', async () => {
    const service = build();
    await service.lookup({ user, deckId, url: 'https://example.test/a' });
    await service.lookup({ user, deckId, url: 'https://example.test/a' });
    safeFetch.mockResolvedValue(failed('blocked'));
    await service.lookup({ user, deckId, url: 'https://example.test/b' });
    expect(await service.lookup({ user, deckId, url: 'https://example.test/b' })).toBeNull();
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(rateLimits.enforce).toHaveBeenCalledTimes(4);
    expect(rateLimits.enforce).toHaveBeenCalledWith(
      `link-preview:user:${user.id}`,
      LINK_PREVIEW_RATE_PER_HOUR,
    );
  });

  it('checks access before counting or fetching', async () => {
    const stranger = { ...user, accountId: 'account-2' };
    const err = await build()
      .lookup({ user: stranger, deckId, url: 'https://example.test/a' })
      .catch((e: unknown) => e);
    expect((err as HttpError).status).toBe(404);
    expect(rateLimits.enforce).not.toHaveBeenCalled();
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
