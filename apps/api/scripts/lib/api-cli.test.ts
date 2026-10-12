import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiCliError, cardsToCreate, createApiClient, parseApiCliArgs } from './api-cli';

describe('parseApiCliArgs', () => {
  it('reads flags and positionals', () => {
    expect(
      parseApiCliArgs(['--deck', 'demo', '--base-url', 'https://x.test/api/', 'parking'], {
        SMOKE_SESSION_TOKEN: 'tok',
      }),
    ).toEqual({
      baseUrl: 'https://x.test/api',
      token: 'tok',
      deck: 'demo',
      positionals: ['parking'],
    });
  });

  it('defaults the deck and base URL, and prefers --token', () => {
    const opts = parseApiCliArgs(['--token', 'flag'], { SMOKE_SESSION_TOKEN: 'env' });
    expect(opts).toMatchObject({
      deck: 'search-demo',
      baseUrl: 'http://localhost:3000',
      token: 'flag',
    });
  });

  it('requires a token', () => {
    expect(() => parseApiCliArgs([], {})).toThrow(/SMOKE_SESSION_TOKEN/);
  });
});

describe('createApiClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the bearer and JSON body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = createApiClient({ baseUrl: 'http://a', token: 't' });
    await expect(request('POST', '/decks', { name: 'x' })).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledWith('http://a/decks', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: '{"name":"x"}',
    });
  });

  it('throws ApiCliError with the status on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    const request = createApiClient({ baseUrl: 'http://a', token: 't' });
    await expect(request('GET', '/decks/x')).rejects.toMatchObject({ status: 404 });
    await expect(request('GET', '/decks/x')).rejects.toBeInstanceOf(ApiCliError);
  });
});

describe('cardsToCreate', () => {
  it('skips titles already in the deck', () => {
    const cards = [{ card: { title: 'A' } }, { card: { title: 'B' } }];
    expect(cardsToCreate(cards, new Set(['A']))).toEqual([{ card: { title: 'B' } }]);
  });
});
