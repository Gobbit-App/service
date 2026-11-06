import { describe, expect, it, vi } from 'vitest';
import { LINK_PREVIEW_TITLE_MAX } from '@gobbit/shared';
import { lookupHostOf, lookupPreview, LOOKUP_HOSTS, parseLookupAnswer } from './lookup-hosts';
import { lookupOutcomes, lookupReasons, PREVIEW_EVENTS } from './preview-events';
import type { SafeJsonFetchResult } from './safe-fetch';

const answer = (over: Partial<SafeJsonFetchResult>): SafeJsonFetchResult => ({
  status: 200,
  ms: 5,
  json: null,
  error: null,
  ...over,
});

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn() };
}

describe('lookupHostOf (D345)', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc', 'YouTube'],
    ['https://youtu.be/abc', 'YouTube'],
    ['https://m.youtube.com/shorts/abc', 'YouTube'],
    ['https://www.tiktok.com/@a/video/1', 'TikTok'],
    ['https://vimeo.com/123', 'Vimeo'],
  ])('%s → %s', (url, label) => {
    expect(lookupHostOf(url)?.label).toBe(label);
  });

  it.each([
    'https://notyoutube.com/x',
    'https://www.instagram.com/p/abc/',
    'ftp://youtube.com/x',
    'not a url',
  ])('%s has no lookup host', (url) => {
    expect(lookupHostOf(url)).toBeNull();
  });

  it('builds key-free oEmbed endpoints with the URL encoded', () => {
    for (const host of LOOKUP_HOSTS) {
      const endpoint = new URL(host.endpoint('https://x.test/a?b=1&c=2'));
      expect(endpoint.protocol).toBe('https:');
      expect(endpoint.searchParams.get('url')).toBe('https://x.test/a?b=1&c=2');
    }
  });
});

describe('parseLookupAnswer', () => {
  it('reads the title and an absolute thumbnail', () => {
    expect(
      parseLookupAnswer({ title: ' A  video ', thumbnail_url: 'https://i.test/t.jpg' }),
    ).toEqual({
      outcome: 'ok',
      title: 'A video',
      image: 'https://i.test/t.jpg',
    });
  });

  it('clips the title and ignores a relative or non-http thumbnail', () => {
    const result = parseLookupAnswer({
      title: 'x'.repeat(LINK_PREVIEW_TITLE_MAX + 5),
      thumbnail_url: '/t.jpg',
    });
    expect(result).toEqual({ outcome: 'ok', title: 'x'.repeat(LINK_PREVIEW_TITLE_MAX) });
    expect(parseLookupAnswer({ thumbnail_url: 'javascript:alert(1)' })).toEqual({
      outcome: 'empty',
    });
  });

  it.each([null, 'text', [], {}, { title: 5, thumbnail_url: {} }])('%j is empty', (json) => {
    expect(parseLookupAnswer(json)).toEqual({ outcome: 'empty' });
  });
});

describe('lookupPreview', () => {
  const youtube = lookupHostOf('https://youtu.be/abc')!;

  it('asks the endpoint once and logs the outcome with the host only', async () => {
    const fetchJson = vi.fn(async () =>
      answer({ json: { title: 'Clip', thumbnail_url: 'https://i.test/t.jpg' } }),
    );
    const log = fakeLog();
    const result = await lookupPreview({ fetchJson, log }, youtube, 'https://youtu.be/abc');
    expect(result).toEqual({ outcome: 'ok', title: 'Clip', image: 'https://i.test/t.jpg' });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    const [fields] = log.info.mock.calls[0]!;
    expect(fields).toMatchObject({ event: PREVIEW_EVENTS.lookup, outcome: 'ok', host: 'youtu.be' });
    expect(JSON.stringify(fields)).not.toMatch(/Clip|i\.test|abc/);
  });

  it.each([
    ['timeout', 'timeout'],
    ['blocked', 'blocked'],
    ['invalid_json', 'invalid'],
    ['not_json', 'invalid'],
    ['too_large', 'invalid'],
    ['http_404', 'http_error'],
  ])('maps %s to a failed %s and warns', async (error, reason) => {
    const log = fakeLog();
    const result = await lookupPreview(
      { fetchJson: async () => answer({ error }), log },
      youtube,
      'https://youtu.be/abc',
    );
    expect(result).toEqual({ outcome: 'failed', reason });
    expect(lookupReasons).toContain(reason);
    expect(log.warn.mock.calls[0]![0]).toMatchObject({ outcome: 'failed', reason });
  });

  it('never throws', async () => {
    const result = await lookupPreview(
      {
        fetchJson: async () => {
          throw new Error('boom');
        },
      },
      youtube,
      'https://youtu.be/abc',
    );
    expect(lookupOutcomes).toContain(result.outcome);
    expect(result).toEqual({ outcome: 'failed', reason: 'http_error' });
  });
});
